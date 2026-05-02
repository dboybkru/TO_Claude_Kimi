import uuid
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
from app.schemas.maintenance_schedule import MaintenanceScheduleCreate


class CRUDSchedule(CRUDBase[MaintenanceSchedule]):

    async def create(self, db: AsyncSession, *, obj_in: MaintenanceScheduleCreate) -> MaintenanceSchedule:
        return await super().create(db, obj_in=obj_in.model_dump())

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 200,
        month: int | None = None,
        year: int | None = None,
        technician_id: str | None = None,
        status: ScheduleStatus | None = None,
    ) -> tuple[list[MaintenanceSchedule], int]:
        query = select(MaintenanceSchedule)
        if month:
            query = query.where(MaintenanceSchedule.month == month)
        if year:
            query = query.where(MaintenanceSchedule.year == year)
        if technician_id:
            query = query.where(MaintenanceSchedule.technician_id == technician_id)
        if status:
            query = query.where(MaintenanceSchedule.status == status)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()
        result = await db.execute(query.order_by(MaintenanceSchedule.scheduled_date.asc()).offset(skip).limit(limit))
        return result.scalars().all(), total

    async def get_month_stats(self, db: AsyncSession, *, month: int, year: int) -> dict:
        result = await db.execute(
            select(MaintenanceSchedule.status, func.count())
            .where(MaintenanceSchedule.month == month, MaintenanceSchedule.year == year)
            .group_by(MaintenanceSchedule.status)
        )
        rows = result.all()
        return {str(status): count for status, count in rows}

    async def mark_overdue(self, db: AsyncSession) -> int:
        today = date.today()
        result = await db.execute(
            select(MaintenanceSchedule).where(
                MaintenanceSchedule.status == ScheduleStatus.PLANNED,
                MaintenanceSchedule.scheduled_date < today,
            )
        )
        items = result.scalars().all()
        for item in items:
            item.status = ScheduleStatus.OVERDUE
        await db.commit()
        return len(items)


schedule = CRUDSchedule(MaintenanceSchedule)
