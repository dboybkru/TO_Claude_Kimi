import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DBDep, CurrentUser
from app.models.maintenance_schedule import ScheduleStatus
from app.models.user import UserRole
from app.schemas.maintenance_schedule import (
    MaintenanceScheduleCreate, MaintenanceScheduleUpdate, MaintenanceScheduleRead,
)
from app import crud

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.get("", response_model=dict)
async def list_schedule(
    db: DBDep,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(200, ge=1, le=500),
    month: int | None = None,
    year: int | None = None,
    technician_id: str | None = None,
    status: ScheduleStatus | None = None,
):
    if current_user.role == UserRole.TECHNICIAN:
        technician_id = current_user.id

    items, total = await crud.schedule.get_multi_filtered(
        db,
        skip=(page - 1) * size,
        limit=size,
        month=month,
        year=year,
        technician_id=technician_id,
        status=status,
    )
    return {
        "items": [MaintenanceScheduleRead.model_validate(s).model_dump(mode="json") for s in items],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/stats", response_model=dict)
async def schedule_stats(
    db: DBDep,
    _: CurrentUser,
    month: int = Query(...),
    year: int = Query(...),
):
    return await crud.schedule.get_month_stats(db, month=month, year=year)


@router.get("/{schedule_id}", response_model=MaintenanceScheduleRead)
async def get_schedule_item(schedule_id: str, db: DBDep, _: CurrentUser):
    s = await crud.schedule.get(db, id=schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule item not found")
    return s


@router.post("", response_model=MaintenanceScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule_item(obj_in: MaintenanceScheduleCreate, db: DBDep, current_user: CurrentUser):
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return await crud.schedule.create(db, obj_in=obj_in)


@router.put("/{schedule_id}", response_model=MaintenanceScheduleRead)
async def update_schedule_item(
    schedule_id: str,
    obj_in: MaintenanceScheduleUpdate,
    db: DBDep,
    current_user: CurrentUser,
):
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.DISPATCHER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    s = await crud.schedule.get(db, id=schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule item not found")
    return await crud.schedule.update(db, db_obj=s, obj_in=obj_in.model_dump(exclude_unset=True))
