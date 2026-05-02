from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status, Depends
from typing import Annotated

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.repair_ticket import TicketStatus, TicketPriority
from app.models.user import UserRole
from app.schemas.repair_ticket import (
    RepairTicketCreate, RepairTicketUpdate, RepairTicketRead,
    RepairTicketAssign, RepairTicketResolve,
)
from app import crud

router = APIRouter(prefix="/tickets", tags=["tickets"])

DispatcherPlus = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.DISPATCHER))]


@router.get("", response_model=dict)
async def list_tickets(
    db: DBDep,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status: TicketStatus | None = None,
    priority: TicketPriority | None = None,
    object_id: str | None = None,
    assigned_to_id: str | None = None,
):
    # TECHNICIAN sees only their assigned tickets
    if current_user.role == UserRole.TECHNICIAN:
        assigned_to_id = current_user.id

    items, total = await crud.ticket.get_multi_filtered(
        db,
        skip=(page - 1) * size,
        limit=size,
        status=status,
        priority=priority.value if priority else None,
        object_id=object_id,
        assigned_to_id=assigned_to_id,
    )
    return {
        "items": [RepairTicketRead.model_validate(t).model_dump(mode="json") for t in items],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/callback-queue", response_model=list[RepairTicketRead])
async def callback_queue(db: DBDep, _: DispatcherPlus):
    return await crud.ticket.get_callback_queue(db)


@router.get("/{ticket_id}", response_model=RepairTicketRead)
async def get_ticket(ticket_id: str, db: DBDep, current_user: CurrentUser):
    t = await crud.ticket.get_with_relations(db, id=ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


@router.post("", response_model=RepairTicketRead, status_code=status.HTTP_201_CREATED)
async def create_ticket(obj_in: RepairTicketCreate, db: DBDep, current_user: CurrentUser,
                        background_tasks: BackgroundTasks = None):
    ticket = await crud.ticket.create(db, obj_in=obj_in, reporter_id=current_user.id)

    # Auto-classify fault type in background if not provided
    if not ticket.fault_type:
        try:
            from app.tasks import ai_classify_ticket
            ai_classify_ticket.delay(str(ticket.id))
        except Exception:
            pass

    # Email dispatchers if critical/high priority
    if ticket.priority in ("critical", "high"):
        from app.services.email import notify_critical_ticket
        from app.core.config import settings
        # Get object name if available
        obj_name = "—"
        if ticket.object_id:
            obj = await crud.object_crud.get(db, id=ticket.object_id)
            if obj:
                obj_name = obj.name
        # Get dispatcher emails
        from sqlalchemy import select
        from app.models.user import User, UserRole
        result = await db.execute(
            select(User.email).where(
                User.role.in_([UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN]),
                User.is_active == True,
            )
        )
        emails = [row[0] for row in result.all()]
        if emails:
            import asyncio
            asyncio.create_task(notify_critical_ticket(
                ticket_number=ticket.ticket_number,
                title=ticket.title,
                object_name=obj_name,
                priority=str(ticket.priority.value if hasattr(ticket.priority, 'value') else ticket.priority),
                to_emails=emails,
                app_url=settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "",
            ))

    return ticket


@router.put("/{ticket_id}", response_model=RepairTicketRead)
async def update_ticket(ticket_id: str, obj_in: RepairTicketUpdate, db: DBDep, _: DispatcherPlus):
    t = await crud.ticket.get(db, id=ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return await crud.ticket.update(db, db_obj=t, obj_in=obj_in.model_dump(exclude_unset=True))


@router.post("/{ticket_id}/assign", response_model=RepairTicketRead)
async def assign_ticket(ticket_id: str, body: RepairTicketAssign, db: DBDep, _: DispatcherPlus):
    t = await crud.ticket.get(db, id=ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return await crud.ticket.assign(db, db_obj=t, technician_id=body.technician_id)


@router.post("/{ticket_id}/resolve", response_model=RepairTicketRead)
async def resolve_ticket(ticket_id: str, body: RepairTicketResolve, db: DBDep, current_user: CurrentUser):
    t = await crud.ticket.get(db, id=ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role == UserRole.TECHNICIAN and t.assigned_to_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    return await crud.ticket.resolve(db, db_obj=t, notes=body.resolution_notes, act_url=body.diagnosis_act_url)
