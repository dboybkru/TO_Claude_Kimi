"""Celery background tasks."""
import asyncio
import logging
from datetime import date

from app.worker import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.mark_overdue_schedules", bind=True, max_retries=3)
def mark_overdue_schedules(self):
    """Mark PLANNED schedules whose scheduled_date < today as OVERDUE.
    Intended to run daily via Celery Beat.
    """
    from sqlalchemy import update
    from app.database import AsyncSessionLocal
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                update(MaintenanceSchedule)
                .where(
                    MaintenanceSchedule.status == ScheduleStatus.PLANNED,
                    MaintenanceSchedule.scheduled_date < date.today(),
                )
                .values(status=ScheduleStatus.OVERDUE)
                .returning(MaintenanceSchedule.id)
            )
            await db.commit()
            ids = result.scalars().all()
            logger.info("mark_overdue_schedules: %d schedules marked overdue", len(ids))
            return len(ids)

    try:
        return {"marked_overdue": _run_async(_run())}
    except Exception as exc:
        logger.error("mark_overdue_schedules failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.send_push_notification", bind=True, max_retries=3)
def send_push_notification(self, user_id: str, title: str, body: str, data: dict | None = None):
    """Send a push notification to a user via their push_token.
    Wire up FCM/APNS here once the mobile app is ready.
    """
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.user import User

    async def _get_token():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User.push_token).where(User.id == user_id))
            return result.scalar_one_or_none()

    try:
        push_token = _run_async(_get_token())
        if not push_token:
            logger.debug("send_push_notification: user %s has no push_token", user_id)
            return {"sent": False, "reason": "no_token"}

        # TODO: call FCM / APNS SDK
        logger.info("send_push_notification: token=%.8s… title=%r", push_token, title)
        return {"sent": True}
    except Exception as exc:
        logger.error("send_push_notification failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.send_overdue_notification")
def send_overdue_notification():
    """Find OVERDUE schedules and notify their technicians via push."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.database import AsyncSessionLocal
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MaintenanceSchedule)
                .options(
                    selectinload(MaintenanceSchedule.technician),
                    selectinload(MaintenanceSchedule.object),
                )
                .where(MaintenanceSchedule.status == ScheduleStatus.OVERDUE)
            )
            overdue = result.scalars().all()
            queued = 0
            for schedule in overdue:
                if schedule.technician and schedule.technician.push_token:
                    obj_name = schedule.object.name if schedule.object else "объект"
                    send_push_notification.delay(
                        user_id=str(schedule.technician_id),
                        title="Просрочено ТО",
                        body=f"Плановое ТО для «{obj_name}» просрочено",
                        data={"schedule_id": str(schedule.id)},
                    )
                    queued += 1
        logger.info("send_overdue_notification: queued %d notifications", queued)
        return queued

    return {"notifications_queued": _run_async(_run())}


# ── AI Tasks ──────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.process_voice_call", bind=True, max_retries=3)
def process_voice_call(self, audio_url: str, caller_phone: str | None = None, call_recording_url: str | None = None):
    """Download audio → transcribe via STT → parse with AI → create ticket."""
    import httpx
    from app.services.ai import transcribe_audio, parse_call, match_object_address
    from app.schemas.repair_ticket import RepairTicketCreate
    from app.models.repair_ticket import TicketSource, TicketPriority, TicketStatus
    from app.database import AsyncSessionLocal
    from app import crud

    _PRIORITY_MAP = {"critical": TicketPriority.CRITICAL, "high": TicketPriority.HIGH, "normal": TicketPriority.NORMAL, "low": TicketPriority.LOW}

    async def _run():
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.get(audio_url)
            resp.raise_for_status()
            audio_bytes = resp.content

        transcript = await transcribe_audio(audio_bytes)
        if not transcript:
            logger.warning("process_voice_call: empty transcript for %s", audio_url)
            return {"status": "empty_transcript"}

        parsed = await parse_call(transcript)
        priority = _PRIORITY_MAP.get(parsed.get("priority", "normal"), TicketPriority.NORMAL)

        async with AsyncSessionLocal() as db:
            object_id = None
            if parsed.get("address_hint") or parsed.get("object_name"):
                hint = parsed.get("address_hint") or parsed.get("object_name")
                objects_raw, _ = await crud.object_crud.get_multi_filtered(db, skip=0, limit=200)
                candidates = [{"id": str(o.id), "name": o.name, "address": o.address} for o in objects_raw]
                object_id = await match_object_address(hint, candidates)

            ticket = await crud.ticket.create(
                db,
                obj_in=RepairTicketCreate(
                    object_id=object_id,
                    title=(parsed.get("summary") or transcript)[:499],
                    description=f"Транскрипция:\n{transcript}",
                    fault_type=parsed.get("fault_type") or "other",
                    priority=priority,
                    source=TicketSource.VOICE_BOT,
                    caller_phone=caller_phone or parsed.get("caller_phone"),
                    call_recording_url=call_recording_url or audio_url,
                ),
            )
            if parsed.get("needs_callback"):
                await crud.ticket.update(db, db_obj=ticket, obj_in={"status": TicketStatus.CALLBACK_REQUIRED})

        logger.info("process_voice_call: created ticket %s", ticket.ticket_number)
        return {"ticket_id": str(ticket.id), "ticket_number": ticket.ticket_number}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("process_voice_call failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.ai_summarize_journal", bind=True, max_retries=2)
def ai_summarize_journal(self, journal_id: str):
    """Generate and save an AI summary for a maintenance journal (stored as final_statement)."""
    from app.services.ai import summarize_journal
    from app.database import AsyncSessionLocal
    from app import crud

    async def _run():
        async with AsyncSessionLocal() as db:
            j = await crud.journal.get_with_relations(db, id=journal_id)
            if not j:
                return {"error": "journal not found"}
            object_name = j.object.name if j.object else "объект"
            summary = await summarize_journal(
                object_name=object_name,
                checklist=j.checklist,
                result_description=j.result_description,
                system_status=j.system_status,
            )
            await crud.journal.update(db, db_obj=j, obj_in={"final_statement": summary})
        return {"journal_id": journal_id, "summary": summary}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("ai_summarize_journal failed: %s", exc)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.ai_classify_ticket", bind=True, max_retries=2)
def ai_classify_ticket(self, ticket_id: str):
    """Auto-classify fault_type for a ticket using AI if not already set."""
    from app.services.ai import classify_fault
    from app.database import AsyncSessionLocal
    from app import crud

    async def _run():
        async with AsyncSessionLocal() as db:
            t = await crud.ticket.get(db, id=ticket_id)
            if not t or t.fault_type:
                return {"skipped": True}
            text = f"{t.title}. {t.description or ''}"
            fault_type = await classify_fault(text)
            await crud.ticket.update(db, db_obj=t, obj_in={"fault_type": fault_type})
        return {"ticket_id": ticket_id, "fault_type": fault_type}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("ai_classify_ticket failed: %s", exc)
        raise self.retry(exc=exc, countdown=30)


# ── Scheduler Tasks ───────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.generate_monthly_plan", bind=True, max_retries=2)
def generate_monthly_plan(self, month: int | None = None, year: int | None = None):
    """Generate monthly maintenance plan for all objects.
    Runs automatically on 1st day of each month at 01:00 via Celery Beat.
    """
    from datetime import date
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.object import Object, ObjectStatus
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
    from app.models.user import User, UserRole

    today = date.today()
    target_month = month or today.month
    target_year = year or today.year

    async def _run():
        async with AsyncSessionLocal() as db:
            # Get all active objects
            result = await db.execute(
                select(Object).where(Object.status == ObjectStatus.ACTIVE.value)
            )
            objects = result.scalars().all()

            # Get available technicians
            tech_result = await db.execute(
                select(User).where(User.role == UserRole.TECHNICIAN, User.is_active == True)
            )
            technicians = tech_result.scalars().all()

            if not technicians:
                logger.warning("generate_monthly_plan: no technicians available")
                return {"created": 0, "reason": "no_technicians"}

            created_count = 0
            for i, obj in enumerate(objects):
                # Simple round-robin assignment
                tech = technicians[i % len(technicians)]

                # Check if already planned for this month
                existing = await db.execute(
                    select(MaintenanceSchedule).where(
                        MaintenanceSchedule.object_id == obj.id,
                        MaintenanceSchedule.month == target_month,
                        MaintenanceSchedule.year == target_year,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                # Determine scheduled date (distribute across month)
                from datetime import date as dt_date
                scheduled_day = min((i % 28) + 1, 28)
                scheduled_date = dt_date(target_year, target_month, scheduled_day)

                schedule = MaintenanceSchedule(
                    object_id=obj.id,
                    technician_id=tech.id,
                    scheduled_date=scheduled_date,
                    month=target_month,
                    year=target_year,
                    status=ScheduleStatus.PLANNED,
                )
                db.add(schedule)
                created_count += 1

            await db.commit()
            logger.info("generate_monthly_plan: created %d schedules for %d-%d", created_count, target_year, target_month)
            return {"created": created_count, "month": target_month, "year": target_year}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("generate_monthly_plan failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(name="app.tasks.send_monthly_report_emails", bind=True, max_retries=2)
def send_monthly_report_emails(self):
    """Send monthly maintenance report emails to customers.
    Runs on 25th day of each month at 09:00 via Celery Beat.
    """
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.object import Object
    from app.models.user import User, UserRole
    from app.models.maintenance_journal import MaintenanceJournal
    from app.services.email import send_email

    async def _run():
        async with AsyncSessionLocal() as db:
            # Get customers with email
            result = await db.execute(
                select(User).where(User.role == UserRole.CUSTOMER, User.is_active == True)
            )
            customers = result.scalars().all()

            sent_count = 0
            for customer in customers:
                # Get customer's objects
                obj_result = await db.execute(
                    select(Object).where(Object.customer_id == customer.id)
                )
                objects = obj_result.scalars().all()

                if not objects or not customer.email:
                    continue

                # Build report
                report_lines = [f"Отчёт по техническому обслуживанию — {customer.full_name}", "=" * 50, ""]

                for obj in objects:
                    # Get last journal
                    journal_result = await db.execute(
                        select(MaintenanceJournal)
                        .where(MaintenanceJournal.object_id == obj.id)
                        .order_by(MaintenanceJournal.created_at.desc())
                        .limit(1)
                    )
                    last_journal = journal_result.scalar_one_or_none()

                    status_text = {
                        "operational": "Работоспособна",
                        "repaired": "Отремонтирована",
                        "needs_repair": "Требует ремонта",
                    }.get(last_journal.system_status if last_journal else None, "Нет данных")

                    report_lines.extend([
                        f"📍 {obj.name}",
                        f"   Адрес: {obj.address}",
                        f"   Статус: {status_text}",
                        f"   Последнее ТО: {last_journal.created_at.strftime('%d.%m.%Y') if last_journal else 'Нет'}",
                        "",
                    ])

                report_body = "\n".join(report_lines)

                try:
                    await send_email(
                        to=customer.email,
                        subject="Ежемесячный отчёт по техническому обслуживанию",
                        body_text=report_body,
                    )
                    sent_count += 1
                except Exception as exc:
                    logger.error("Failed to send report to %s: %s", customer.email, exc)

            logger.info("send_monthly_report_emails: sent %d reports", sent_count)
            return {"sent": sent_count}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("send_monthly_report_emails failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(name="app.tasks.generate_daily_digest")
def generate_daily_digest():
    """Generate and send AI-powered daily digest email to managers and dispatchers.
    Runs every day at 20:00 via Celery Beat.
    """
    from datetime import date, datetime, timezone
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    from app.database import AsyncSessionLocal
    from app.models.maintenance_journal import MaintenanceJournal
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
    from app.models.user import User, UserRole
    from app.models.object import Object
    from app.services.ai import ai_service
    from app.services.email import render_template, send_email

    today = date.today()
    start_of_day = datetime(today.year, today.month, today.day, 0, 0, 0, tzinfo=timezone.utc)
    end_of_day = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=timezone.utc)

    async def _run():
        async with AsyncSessionLocal() as db:
            # Today's journals
            result = await db.execute(
                select(MaintenanceJournal)
                .options(selectinload(MaintenanceJournal.object), selectinload(MaintenanceJournal.technician))
                .where(
                    MaintenanceJournal.created_at >= start_of_day,
                    MaintenanceJournal.created_at <= end_of_day,
                )
                .order_by(MaintenanceJournal.created_at.desc())
            )
            journals = result.scalars().all()

            # Build journal data for AI
            journal_data = []
            for j in journals:
                journal_data.append({
                    "object_name": j.object.name if j.object else "неизвестно",
                    "status": j.system_status or "не указан",
                    "result_description": j.result_description,
                    "technician_name": j.technician.full_name if j.technician else "не указан",
                })

            ai_summary = await ai_service.summarize_day(today, journal_data)

            # Counts
            operational_count = sum(1 for j in journals if j.system_status == "operational")
            needs_repair_count = sum(1 for j in journals if j.system_status == "needs_repair")

            # Overdue schedules
            overdue_result = await db.execute(
                select(MaintenanceSchedule)
                .options(selectinload(MaintenanceSchedule.object))
                .where(MaintenanceSchedule.status == ScheduleStatus.OVERDUE)
            )
            overdue_schedules = overdue_result.scalars().all()
            overdue_items = []
            for s in overdue_schedules:
                days = (today - s.scheduled_date).days if s.scheduled_date else 0
                overdue_items.append({
                    "name": s.object.name if s.object else "неизвестно",
                    "region": getattr(s.object, "region", None) if s.object else None,
                    "days": max(days, 0),
                })

            recent_journals = [
                {
                    "object": j.object.name if j.object else "неизвестно",
                    "status": j.system_status or "не указан",
                    "tech": j.technician.full_name if j.technician else "не указан",
                }
                for j in journals[:10]
            ]

            # Render template
            html = render_template("daily_digest.html", {
                "date_str": today.strftime("%d.%m.%Y"),
                "total_journals": len(journals),
                "operational_count": operational_count,
                "needs_repair_count": needs_repair_count,
                "overdue_count": len(overdue_items),
                "ai_summary": ai_summary,
                "overdue_items": overdue_items,
                "recent_journals": recent_journals,
            })

            # Find managers and dispatchers with emails
            user_result = await db.execute(
                select(User).where(
                    User.role.in_([UserRole.MANAGER, UserRole.DISPATCHER]),
                    User.is_active == True,
                )
            )
            recipients = [u.email for u in user_result.scalars().all() if u.email]

            if recipients and html:
                await send_email(
                    to=recipients,
                    subject=f"Ежедневный дайджест ТО — {today.strftime('%d.%m.%Y')}",
                    body_html=html,
                )
                logger.info("generate_daily_digest: sent to %d recipients", len(recipients))
                return {"sent": len(recipients), "journals": len(journals)}
            else:
                logger.info("generate_daily_digest: no recipients or empty template")
                return {"sent": 0, "journals": len(journals), "reason": "no_recipients"}

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("generate_daily_digest failed: %s", exc)
        raise
