"""Voice bot webhook — receives calls, transcribes and creates tickets automatically."""
import hashlib
import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Header, Request, UploadFile, File, Form, Depends, BackgroundTasks
from pydantic import BaseModel

from app.api.deps import DBDep, CurrentUser, require_roles
from app.core.config import settings
from app.models.user import UserRole
from app.models.repair_ticket import TicketSource, TicketPriority, TicketStatus
from app.schemas.repair_ticket import RepairTicketCreate
from app import crud

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice-bot"])

SystemOnly = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.DISPATCHER))]


def _verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    """HMAC-SHA256 signature check. Skip if VOICEBOT_WEBHOOK_SECRET is not set."""
    secret = settings.VOICEBOT_WEBHOOK_SECRET
    if not secret:
        return True  # dev mode — no secret configured
    if not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.removeprefix("sha256="))


# ── Inbound Schemas ───────────────────────────────────────────────────────────

class CallWebhookPayload(BaseModel):
    """JSON payload from an external voice bot (e.g. Voximplant, Asterisk, MangoOffice)."""
    call_id: str
    caller_phone: str
    transcript: str | None = None          # pre-transcribed text (optional)
    call_recording_url: str | None = None  # URL to audio file
    called_at: str | None = None           # ISO datetime


class ProcessCallResult(BaseModel):
    ticket_id: str | None
    ticket_number: str | None
    object_id: str | None
    priority: str
    needs_callback: bool
    summary: str
    transcript: str | None


# ── Helpers ───────────────────────────────────────────────────────────────────

_PRIORITY_MAP = {
    "critical": TicketPriority.CRITICAL,
    "high":     TicketPriority.HIGH,
    "normal":   TicketPriority.NORMAL,
    "low":      TicketPriority.LOW,
}

_FAULT_MAP = {
    "hardware": "hardware",
    "software": "software",
    "power":    "power",
    "sensor":   "sensor",
    "access":   "access",
    "other":    "other",
}


async def _process_call(
    db,
    transcript: str,
    caller_phone: str | None,
    call_recording_url: str | None,
    called_at_str: str | None,
) -> ProcessCallResult:
    """Core logic: parse transcript → match object → create ticket."""
    from app.services.ai import parse_call, match_object_address

    parsed = await parse_call(transcript)

    # Try to match object
    object_id: str | None = None
    address_hint = parsed.get("address_hint") or parsed.get("object_name")
    if address_hint:
        objects_raw, _ = await crud.object_crud.get_multi_filtered(db, skip=0, limit=200)
        candidates = [{"id": str(o.id), "name": o.name, "address": o.address} for o in objects_raw]
        object_id = await match_object_address(address_hint, candidates)

    priority_str = parsed.get("priority", "normal")
    priority = _PRIORITY_MAP.get(priority_str, TicketPriority.NORMAL)
    fault_type = _FAULT_MAP.get(parsed.get("fault_type") or "other", "other")
    needs_callback: bool = parsed.get("needs_callback", True)
    summary: str = parsed.get("summary") or parsed.get("problem") or transcript[:300]

    # Determine status
    status = TicketStatus.CALLBACK_REQUIRED if needs_callback else TicketStatus.NEW

    ticket = await crud.ticket.create(
        db,
        obj_in=RepairTicketCreate(
            object_id=object_id,
            title=summary[:499],
            description=f"Транскрипция:\n{transcript}\n\nПарсинг AI:\n{parsed.get('problem', '')}",
            fault_type=fault_type,
            priority=priority,
            source=TicketSource.VOICE_BOT,
            caller_phone=caller_phone or parsed.get("caller_phone"),
            call_recording_url=call_recording_url,
        ),
    )

    # Update status to callback_required if needed (create sets NEW by default)
    if needs_callback:
        await crud.ticket.update(
            db, db_obj=ticket, obj_in={"status": TicketStatus.CALLBACK_REQUIRED}
        )

    return ProcessCallResult(
        ticket_id=str(ticket.id),
        ticket_number=ticket.ticket_number,
        object_id=object_id,
        priority=priority_str,
        needs_callback=needs_callback,
        summary=summary,
        transcript=transcript,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/digest", response_model=dict)
async def ai_daily_digest(db: DBDep, _: SystemOnly):
    """AI daily digest — summary of all objects, overdue TOs, critical tickets."""
    from datetime import date, datetime, timezone, timedelta
    from sqlalchemy import select, func
    from app.models.object import Object, ObjectStatus
    from app.models.repair_ticket import RepairTicket, TicketStatus, TicketPriority
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
    from app.models.maintenance_journal import MaintenanceJournal
    from app.models.user import User
    from app.services.ai import daily_digest

    now = datetime.now(timezone.utc)
    month, year = now.month, now.year

    # Stats
    total_obj   = (await db.execute(select(func.count()).select_from(Object))).scalar_one()
    active_obj  = (await db.execute(select(func.count()).select_from(Object).where(Object.status == ObjectStatus.ACTIVE.value))).scalar_one()
    overdue_cnt = (await db.execute(select(func.count()).select_from(MaintenanceSchedule).where(MaintenanceSchedule.status == ScheduleStatus.OVERDUE))).scalar_one()
    open_t      = (await db.execute(select(func.count()).select_from(RepairTicket).where(RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED])))).scalar_one()
    crit_t      = (await db.execute(select(func.count()).select_from(RepairTicket).where(RepairTicket.priority == TicketPriority.CRITICAL, RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED])))).scalar_one()
    high_t      = (await db.execute(select(func.count()).select_from(RepairTicket).where(RepairTicket.priority == TicketPriority.HIGH, RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED])))).scalar_one()
    done_mo     = (await db.execute(select(func.count()).select_from(MaintenanceSchedule).where(MaintenanceSchedule.month == month, MaintenanceSchedule.year == year, MaintenanceSchedule.status == ScheduleStatus.DONE))).scalar_one()
    plan_mo     = (await db.execute(select(func.count()).select_from(MaintenanceSchedule).where(MaintenanceSchedule.month == month, MaintenanceSchedule.year == year))).scalar_one()

    # Overdue objects (no maintenance for 35+ days)
    cutoff = now - timedelta(days=35)
    overdue_obj_rows = (await db.execute(
        select(Object.name, Object.region, Object.last_maintenance_at)
        .where(Object.status == ObjectStatus.ACTIVE.value)
        .where((Object.last_maintenance_at == None) | (Object.last_maintenance_at < cutoff))
        .order_by(Object.last_maintenance_at.asc().nullsfirst())
        .limit(10)
    )).all()
    overdue_objects = [
        {"name": r.name, "region": r.region or "—",
         "days": (now.date() - r.last_maintenance_at.date()).days if r.last_maintenance_at else 9999}
        for r in overdue_obj_rows
    ]

    # Critical open tickets
    crit_rows = (await db.execute(
        select(RepairTicket.ticket_number, RepairTicket.title, RepairTicket.object_id)
        .where(RepairTicket.priority.in_([TicketPriority.CRITICAL, TicketPriority.HIGH]))
        .where(RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED]))
        .order_by(RepairTicket.created_at.asc())
        .limit(5)
    )).all()
    crit_list = [{"number": r.ticket_number, "title": r.title, "object": r.object_id or "—"} for r in crit_rows]

    # Recent journals (last 24h)
    since_24h = now - timedelta(hours=24)
    from sqlalchemy.orm import selectinload
    j_rows = (await db.execute(
        select(MaintenanceJournal)
        .options(selectinload(MaintenanceJournal.object), selectinload(MaintenanceJournal.technician))
        .where(MaintenanceJournal.completed_at >= since_24h)
        .limit(5)
    )).scalars().all()
    recent_j = [
        {"object": j.object.name if j.object else "—",
         "status": j.system_status or "—",
         "tech": j.technician.full_name if j.technician else "—"}
        for j in j_rows
    ]

    digest = await daily_digest(
        total_objects=total_obj, active_objects=active_obj,
        overdue_schedules=overdue_cnt, open_tickets=open_t,
        critical_tickets=crit_t, high_tickets=high_t,
        done_this_month=done_mo, planned_this_month=plan_mo,
        overdue_objects=overdue_objects, critical_ticket_list=crit_list,
        recent_journals=recent_j,
    )
    return {"digest": digest, "generated_at": now.isoformat()}


@router.post("/similar-tickets", response_model=dict)
async def similar_tickets(body: dict, db: DBDep, _: CurrentUser):
    """Find similar past tickets for a given problem description."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.repair_ticket import RepairTicket, TicketStatus
    from app.services.ai import find_similar_tickets

    title       = (body.get("title") or "").strip()
    description = (body.get("description") or "").strip()
    fault_type  = body.get("fault_type")

    if not title:
        return {"similar": ""}

    # Get resolved/closed tickets with resolution notes
    rows = (await db.execute(
        select(RepairTicket)
        .options(selectinload(RepairTicket.object))
        .where(RepairTicket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]))
        .where(RepairTicket.resolution_notes != None)
        .order_by(RepairTicket.resolved_at.desc())
        .limit(30)
    )).scalars().all()

    past = [
        {"number": t.ticket_number, "title": t.title,
         "fault_type": str(t.fault_type.value) if t.fault_type else None,
         "resolution_notes": t.resolution_notes,
         "object_name": t.object.name if t.object else "—"}
        for t in rows
    ]
    similar = await find_similar_tickets(title, description, fault_type, past)
    return {"similar": similar}


@router.post("/journal-assist", response_model=dict)
async def journal_assist_endpoint(body: dict, db: DBDep, _: CurrentUser):
    """Convert free-text technician description to structured journal fields."""
    from app.services.ai import journal_assist
    free_text   = (body.get("free_text") or "").strip()
    object_id   = body.get("object_id")
    object_name = "объект"
    object_type = "OS"

    if object_id:
        obj = await crud.object_crud.get(db, id=object_id)
        if obj:
            object_name = obj.name
            object_type = str(obj.type.value) if hasattr(obj.type, 'value') else str(obj.type)

    if len(free_text) < 10:
        return {}
    result = await journal_assist(free_text, object_name, object_type)
    return result


@router.post("/suggest-technician", response_model=dict)
async def suggest_technician_endpoint(body: dict, db: DBDep, _: SystemOnly):
    """AI suggests best technician for a ticket based on history and workload."""
    from sqlalchemy import select, func
    from app.models.user import User, UserRole
    from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
    from app.models.repair_ticket import RepairTicket
    from app.models.object import Object
    from app.services.ai import suggest_technician
    from datetime import datetime, timezone

    ticket_title = body.get("title", "")
    fault_type   = body.get("fault_type")
    object_id    = body.get("object_id")

    # Get object type/region
    object_type   = "OS"
    object_region = None
    if object_id:
        obj = await crud.object_crud.get(db, id=object_id)
        if obj:
            object_type   = str(obj.type.value) if hasattr(obj.type, 'value') else str(obj.type)
            object_region = obj.region

    # Get active technicians with their monthly stats
    now = datetime.now(timezone.utc)
    techs = (await db.execute(
        select(User).where(User.role == UserRole.TECHNICIAN, User.is_active == True)
    )).scalars().all()

    tech_list = []
    for t in techs:
        done = (await db.execute(
            select(func.count()).select_from(MaintenanceSchedule)
            .where(MaintenanceSchedule.technician_id == t.id,
                   MaintenanceSchedule.month == now.month,
                   MaintenanceSchedule.year  == now.year,
                   MaintenanceSchedule.status == ScheduleStatus.DONE)
        )).scalar_one()
        tech_list.append({"id": str(t.id), "name": t.full_name,
                          "completed_this_month": done, "specialization_hint": "общая"})

    result = await suggest_technician(ticket_title, fault_type, object_type, object_region, tech_list)
    return result


@router.get("/predictive/{object_id}", response_model=dict)
async def predictive_endpoint(object_id: str, db: DBDep, _: CurrentUser):
    """Predictive maintenance risk assessment for an object."""
    from sqlalchemy import select
    from app.models.maintenance_journal import MaintenanceJournal
    from app.models.repair_ticket import RepairTicket, TicketStatus
    from app.models.object import Object
    from app.services.ai import predictive_maintenance
    from datetime import datetime, timezone

    obj = await crud.object_crud.get(db, id=object_id)
    if not obj:
        raise HTTPException(404, "Object not found")

    now = datetime.now(timezone.utc)
    last_days = None
    if obj.last_maintenance_at:
        last_days = (now.date() - obj.last_maintenance_at.date()).days

    # Recent journal statuses
    j_rows = (await db.execute(
        select(MaintenanceJournal.system_status)
        .where(MaintenanceJournal.object_id == object_id)
        .order_by(MaintenanceJournal.completed_at.desc())
        .limit(5)
    )).scalars().all()
    statuses = [s for s in j_rows if s]

    # Open tickets
    open_t = (await db.execute(
        select(__import__('sqlalchemy', fromlist=['func']).func.count())
        .select_from(RepairTicket)
        .where(RepairTicket.object_id == object_id,
               RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED]))
    )).scalar_one()

    # Repeat fault types from recent resolved tickets
    from sqlalchemy import select as sel
    fault_rows = (await db.execute(
        sel(RepairTicket.fault_type)
        .where(RepairTicket.object_id == object_id, RepairTicket.fault_type != None)
        .order_by(RepairTicket.created_at.desc())
        .limit(10)
    )).scalars().all()
    fault_types = [str(f.value) if hasattr(f, 'value') else str(f) for f in fault_rows if f]

    result = await predictive_maintenance(
        object_name=obj.name,
        object_type=str(obj.type.value) if hasattr(obj.type, 'value') else str(obj.type),
        last_maintenance_days_ago=last_days,
        open_tickets=open_t,
        system_statuses=statuses,
        repeat_fault_types=fault_types,
    )
    return {"object_id": object_id, **result}

@router.get("/info")
async def voice_info(request: Request, _: SystemOnly):
    """Return voice bot configuration visible to dispatchers/admins."""
    # Build webhook URL from the current request's base URL (not VseGPT URL)
    base = str(request.base_url).rstrip("/")
    return {
        "phone_number": settings.VOICEBOT_PHONE_NUMBER or "не настроен",
        "webhook_url": f"{base}/api/v1/voice/webhook",
        "webhook_secured": bool(settings.VOICEBOT_WEBHOOK_SECRET),
        "ai_configured": bool(settings.VSEGPT_API_KEY),
        "models": {
            "parse_call":  settings.AI_MODEL_PARSE_CALL,
            "classify":    settings.AI_MODEL_CLASSIFY,
            "summarize":   settings.AI_MODEL_SUMMARIZE,
            "report":      settings.AI_MODEL_REPORT,
        },
    }


@router.put("/ai-key", response_model=dict)
async def update_ai_key(
    body: dict,
    _: Annotated[object, Depends(require_roles(UserRole.ADMIN))],
):
    """Update VseGPT API key. Admin only."""
    api_key = (body.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(400, "API key is required")
    if not api_key.startswith("sk-") and not api_key.startswith("gpt_"):
        raise HTTPException(400, "Invalid API key format")
    
    # Update .env file on disk (only works in Docker if .env is mounted)
    import os
    env_path = os.path.join(os.getcwd(), ".env")
    if os.path.exists(env_path):
        lines = open(env_path, "r", encoding="utf-8").readlines()
        found = False
        new_lines = []
        for line in lines:
            if line.startswith("VSEGPT_API_KEY="):
                new_lines.append(f"VSEGPT_API_KEY={api_key}\n")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"VSEGPT_API_KEY={api_key}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    
    # Update in-memory settings (until restart)
    settings.VSEGPT_API_KEY = api_key
    return {"ai_configured": True, "message": "API key updated"}


@router.put("/phone-number", response_model=dict)
async def update_phone_number(
    body: dict,
    _: Annotated[object, Depends(require_roles(UserRole.ADMIN))],
):
    """Update voice bot phone number. Admin only."""
    phone = (body.get("phone_number") or "").strip()
    if not phone:
        raise HTTPException(400, "Phone number is required")
    if len(phone) < 7:
        raise HTTPException(400, "Phone number too short")

    import os
    env_path = os.path.join(os.getcwd(), ".env")
    if os.path.exists(env_path):
        lines = open(env_path, "r", encoding="utf-8").readlines()
        found = False
        new_lines = []
        for line in lines:
            if line.startswith("VOICEBOT_PHONE_NUMBER="):
                new_lines.append(f"VOICEBOT_PHONE_NUMBER={phone}\n")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"VOICEBOT_PHONE_NUMBER={phone}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

    settings.VOICEBOT_PHONE_NUMBER = phone
    return {"phone_number": phone, "message": "Phone number updated"}


@router.post("/webhook", response_model=ProcessCallResult)
async def call_webhook(
    request: Request,
    payload: CallWebhookPayload,
    background_tasks: BackgroundTasks,
    db: DBDep,
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
):
    """Webhook called by external voice bot with a finished call.

    Accepts a JSON body with transcript (or URL to recording).
    Creates a RepairTicket automatically.

    Security: set VOICEBOT_WEBHOOK_SECRET in .env — the caller must send
    ``X-Webhook-Signature: sha256=<HMAC-SHA256(body, secret)>`` header.
    """
    body = await request.body()
    if not _verify_webhook_signature(body, x_webhook_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    transcript = payload.transcript or ""

    if not transcript and payload.call_recording_url:
        # Transcription will be done in background; return immediately
        background_tasks.add_task(
            _process_call_by_url_bg,
            payload.call_recording_url,
            payload.caller_phone,
            payload.call_recording_url,
            payload.called_at,
        )
        return ProcessCallResult(
            ticket_id=None,
            ticket_number=None,
            object_id=None,
            priority="normal",
            needs_callback=True,
            summary="Звонок принят, обрабатывается...",
            transcript=None,
        )

    return await _process_call(
        db,
        transcript=transcript,
        caller_phone=payload.caller_phone,
        call_recording_url=payload.call_recording_url,
        called_at_str=payload.called_at,
    )


def _is_safe_audio_url(url: str) -> bool:
    """SSRF guard: only allow public HTTPS URLs, block internal/private addresses."""
    from urllib.parse import urlparse
    import ipaddress
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http"):
            return False
        host = parsed.hostname or ""
        # Block localhost and private RFC-1918 / link-local ranges
        if host in ("localhost", "127.0.0.1", "::1"):
            return False
        try:
            addr = ipaddress.ip_address(host)
            if addr.is_private or addr.is_loopback or addr.is_link_local:
                return False
        except ValueError:
            pass  # hostname — not an IP, allow
        return True
    except Exception:
        return False


async def _process_call_by_url_bg(audio_url: str, caller_phone: str, recording_url: str, called_at: str | None):
    """Background task: download audio → transcribe → create ticket."""
    import httpx
    from app.services.ai import transcribe_audio
    from app.database import AsyncSessionLocal

    if not _is_safe_audio_url(audio_url):
        logger.warning("_process_call_by_url_bg: blocked unsafe URL %s", audio_url)
        return

    try:
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.get(audio_url)
            resp.raise_for_status()
            audio_bytes = resp.content

        transcript = await transcribe_audio(audio_bytes)
        async with AsyncSessionLocal() as db:
            await _process_call(db, transcript, caller_phone, recording_url, called_at)
    except Exception as exc:
        logger.error("Background call processing failed: %s", exc)


@router.post("/transcribe", response_model=dict)
async def transcribe_upload(
    _: SystemOnly,
    file: UploadFile = File(...),
):
    """Upload an audio file and get back the transcript. Admin/dispatcher only."""
    from app.services.ai import transcribe_audio
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio file too large (max 25 MB)")
    transcript = await transcribe_audio(content, file.filename or "audio.ogg")
    return {"transcript": transcript, "filename": file.filename}


@router.post("/analyze", response_model=ProcessCallResult)
async def analyze_transcript(
    db: DBDep,
    _: SystemOnly,
    transcript: str = Form(...),
    caller_phone: str = Form(default=""),
    create_ticket: bool = Form(default=True),
):
    """Manually submit a transcript for AI analysis. Optionally create a ticket."""
    if not transcript.strip():
        raise HTTPException(400, "Transcript cannot be empty")

    if create_ticket:
        return await _process_call(db, transcript, caller_phone or None, None, None)

    from app.services.ai import parse_call
    parsed = await parse_call(transcript)
    return ProcessCallResult(
        ticket_id=None,
        ticket_number=None,
        object_id=None,
        priority=parsed.get("priority", "normal"),
        needs_callback=parsed.get("needs_callback", True),
        summary=parsed.get("summary", transcript[:200]),
        transcript=transcript,
    )


@router.post("/summarize-journal/{journal_id}", response_model=dict)
async def summarize_journal_endpoint(journal_id: str, db: DBDep, _: SystemOnly):
    """Generate an AI summary for a maintenance journal entry."""
    from app.services.ai import summarize_journal

    j = await crud.journal.get_with_relations(db, id=journal_id)
    if not j:
        raise HTTPException(404, "Journal not found")

    object_name = j.object.name if j.object else "Неизвестный объект"
    summary = await summarize_journal(
        object_name=object_name,
        checklist=j.checklist,
        result_description=j.result_description,
        system_status=j.system_status,
    )
    return {"journal_id": journal_id, "summary": summary}


@router.post("/hint", response_model=dict)
async def ticket_hint_endpoint(body: dict, _: CurrentUser):
    """AI-подсказка для формы создания тикета.
    Вход: {"description": "..."} — Выход: {priority, fault_type, title}
    """
    from app.services.ai import ticket_hint
    description = (body.get("description") or "").strip()
    if len(description) < 10:
        return {}
    return await ticket_hint(description)


@router.post("/report/object/{object_id}", response_model=dict)
async def object_ai_report(object_id: str, db: DBDep, _: SystemOnly):
    """Generate a monthly AI maintenance report for an object."""
    from app.services.ai import generate_object_report
    from app.schemas.maintenance_journal import MaintenanceJournalRead

    obj = await crud.object_crud.get(db, id=object_id)
    if not obj:
        raise HTTPException(404, "Object not found")

    journals, _ = await crud.journal.get_multi_filtered(db, object_id=object_id, limit=10)
    summaries = [
        j.result_description or j.system_status or ""
        for j in journals if j.result_description or j.system_status
    ]

    tickets, open_count = await crud.ticket.get_multi_filtered(db, object_id=object_id, limit=1)
    _, open_count = await crud.ticket.get_multi_filtered(db, object_id=object_id)

    report = await generate_object_report(
        object_name=obj.name,
        object_type=str(obj.type),
        journals_summary=summaries,
        open_tickets=open_count,
    )
    return {"object_id": object_id, "object_name": obj.name, "report": report}
