from datetime import datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from app.api.deps import DBDep, CurrentUser
from app.models.object import Object, ObjectStatus
from app.models.repair_ticket import RepairTicket, TicketStatus, TicketPriority
from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(db: DBDep, _: CurrentUser):
    now = datetime.now(timezone.utc)
    month, year = now.month, now.year

    total_objects = (await db.execute(select(func.count()).select_from(Object))).scalar_one()

    active_objects = (
        await db.execute(select(func.count()).select_from(Object).where(Object.status == ObjectStatus.ACTIVE))
    ).scalar_one()

    open_tickets = (
        await db.execute(
            select(func.count()).select_from(RepairTicket).where(
                RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED])
            )
        )
    ).scalar_one()

    critical_tickets = (
        await db.execute(
            select(func.count()).select_from(RepairTicket).where(
                RepairTicket.priority == TicketPriority.CRITICAL,
                RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            )
        )
    ).scalar_one()

    high_tickets = (
        await db.execute(
            select(func.count()).select_from(RepairTicket).where(
                RepairTicket.priority == TicketPriority.HIGH,
                RepairTicket.status.notin_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            )
        )
    ).scalar_one()

    done_this_month = (
        await db.execute(
            select(func.count()).select_from(MaintenanceSchedule).where(
                MaintenanceSchedule.month == month,
                MaintenanceSchedule.year == year,
                MaintenanceSchedule.status == ScheduleStatus.DONE,
            )
        )
    ).scalar_one()

    planned_this_month = (
        await db.execute(
            select(func.count()).select_from(MaintenanceSchedule).where(
                MaintenanceSchedule.month == month,
                MaintenanceSchedule.year == year,
            )
        )
    ).scalar_one()

    overdue_count = (
        await db.execute(
            select(func.count()).select_from(MaintenanceSchedule).where(
                MaintenanceSchedule.status == ScheduleStatus.OVERDUE,
            )
        )
    ).scalar_one()

    return {
        "total_objects": total_objects,
        "active_objects": active_objects,
        "open_tickets": open_tickets,
        "critical_tickets": critical_tickets,
        "high_tickets": high_tickets,
        "maintenance_done_this_month": done_this_month,
        "maintenance_planned_this_month": planned_this_month,
        "overdue_count": overdue_count,
    }


@router.get("/districts")
async def get_districts(
    db: DBDep,
    _: CurrentUser,
    month: int = Query(...),
    year: int = Query(...),
):
    result = await db.execute(
        select(Object.region, MaintenanceSchedule.status, func.count().label("cnt"))
        .join(Object, MaintenanceSchedule.object_id == Object.id)
        .where(MaintenanceSchedule.month == month, MaintenanceSchedule.year == year)
        .group_by(Object.region, MaintenanceSchedule.status)
    )
    rows = result.all()

    districts: dict[str, dict] = {}
    for region, status, count in rows:
        key = region or "Не указан"
        if key not in districts:
            districts[key] = {"name": key, "done": 0, "pending": 0, "overdue": 0, "total": 0}
        districts[key]["total"] += count
        if status == ScheduleStatus.DONE:
            districts[key]["done"] += count
        elif status == ScheduleStatus.OVERDUE:
            districts[key]["overdue"] += count
            districts[key]["pending"] += count
        else:
            districts[key]["pending"] += count

    return sorted(districts.values(), key=lambda d: -d["total"])


@router.get("/technicians")
async def get_technicians_stats(
    db: DBDep,
    _: CurrentUser,
    month: int = Query(...),
    year: int = Query(...),
):
    # All active technicians
    techs_result = await db.execute(
        select(User).where(User.role == UserRole.TECHNICIAN, User.is_active == True)
    )
    technicians = techs_result.scalars().all()

    # Their schedule items for this month
    sched_result = await db.execute(
        select(MaintenanceSchedule.technician_id, MaintenanceSchedule.status, func.count().label("cnt"))
        .where(MaintenanceSchedule.month == month, MaintenanceSchedule.year == year,
               MaintenanceSchedule.technician_id.isnot(None))
        .group_by(MaintenanceSchedule.technician_id, MaintenanceSchedule.status)
    )
    sched_rows = sched_result.all()

    stats: dict[str, dict] = {}
    for tid, status, count in sched_rows:
        key = str(tid)
        if key not in stats:
            stats[key] = {"done": 0, "total": 0}
        stats[key]["total"] += count
        if status == ScheduleStatus.DONE:
            stats[key]["done"] += count

    result = []
    for t in technicians:
        tid = str(t.id)
        s = stats.get(tid, {"done": 0, "total": 0})
        result.append({
            "id": tid,
            "full_name": t.full_name,
            "phone": t.phone,
            "done": s["done"],
            "total": s["total"],
        })

    return sorted(result, key=lambda x: -x["total"])
