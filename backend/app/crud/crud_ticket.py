import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.repair_ticket import RepairTicket, TicketStatus, TicketSource
from app.schemas.repair_ticket import RepairTicketCreate, RepairTicketUpdate


class CRUDTicket(CRUDBase[RepairTicket]):

    async def generate_number(self, db: AsyncSession) -> str:
        year = datetime.now(timezone.utc).year
        result = await db.execute(
            select(func.count()).select_from(RepairTicket).where(
                RepairTicket.ticket_number.like(f"REQ-{year}-%")
            )
        )
        count = result.scalar_one()
        return f"REQ-{year}-{count + 1:04d}"

    async def create(self, db: AsyncSession, *, obj_in: RepairTicketCreate, reporter_id: str | None = None) -> RepairTicket:
        data = obj_in.model_dump()
        data["ticket_number"] = await self.generate_number(db)
        if reporter_id:
            data["reporter_id"] = reporter_id
        return await super().create(db, obj_in=data)

    async def get_with_relations(self, db: AsyncSession, id: str) -> RepairTicket | None:
        result = await db.execute(
            select(RepairTicket)
            .options(
                selectinload(RepairTicket.object),
                selectinload(RepairTicket.reporter),
                selectinload(RepairTicket.assigned_to),
            )
            .where(RepairTicket.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
        status: TicketStatus | None = None,
        priority: str | None = None,
        object_id: str | None = None,
        assigned_to_id: str | None = None,
    ) -> tuple[list[RepairTicket], int]:
        query = select(RepairTicket)
        if status:
            query = query.where(RepairTicket.status == status)
        if priority:
            query = query.where(RepairTicket.priority == priority)
        if object_id:
            query = query.where(RepairTicket.object_id == object_id)
        if assigned_to_id:
            query = query.where(RepairTicket.assigned_to_id == assigned_to_id)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()
        result = await db.execute(query.order_by(RepairTicket.created_at.desc()).offset(skip).limit(limit))
        return result.scalars().all(), total

    async def assign(self, db: AsyncSession, *, db_obj: RepairTicket, technician_id: str) -> RepairTicket:
        db_obj.assigned_to_id = technician_id
        db_obj.assigned_at = datetime.now(timezone.utc)
        db_obj.status = TicketStatus.ASSIGNED
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def resolve(self, db: AsyncSession, *, db_obj: RepairTicket, notes: str, act_url: str | None = None) -> RepairTicket:
        db_obj.status = TicketStatus.RESOLVED
        db_obj.resolved_at = datetime.now(timezone.utc)
        db_obj.resolution_notes = notes
        if act_url:
            db_obj.diagnosis_act_url = act_url
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_callback_queue(self, db: AsyncSession) -> list[RepairTicket]:
        result = await db.execute(
            select(RepairTicket)
            .where(
                RepairTicket.source == TicketSource.VOICE_BOT,
                RepairTicket.status == TicketStatus.CALLBACK_REQUIRED,
            )
            .order_by(RepairTicket.created_at.asc())
        )
        return result.scalars().all()


ticket = CRUDTicket(RepairTicket)
