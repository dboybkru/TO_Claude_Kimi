import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.maintenance_journal import MaintenanceJournal
from app.schemas.maintenance_journal import MaintenanceJournalCreate, MaintenanceJournalUpdate


class CRUDJournal(CRUDBase[MaintenanceJournal]):

    async def _next_journal_number(self, db: AsyncSession, object_id: str) -> int:
        result = await db.execute(
            select(func.count()).select_from(MaintenanceJournal).where(
                MaintenanceJournal.object_id == object_id
            )
        )
        return (result.scalar_one() or 0) + 1

    async def create(self, db: AsyncSession, *, obj_in: MaintenanceJournalCreate) -> MaintenanceJournal:
        data = obj_in.model_dump()
        data["journal_number"] = await self._next_journal_number(db, obj_in.object_id)
        if not data.get("arrived_at"):
            data["arrived_at"] = datetime.now(timezone.utc)
        obj = await super().create(db, obj_in=data)

        # Auto-update last_maintenance_at on operational status
        if obj.system_status == "operational":
            await self._update_object_maintenance_date(db, obj.object_id, obj.arrived_at or obj.created_at)

        # Auto-create ticket on needs_repair
        if obj.system_status == "needs_repair":
            await self._auto_create_ticket(db, obj)

        return obj

    async def _update_object_maintenance_date(self, db: AsyncSession, object_id: str, date: datetime):
        from app.models.object import Object
        result = await db.execute(select(Object).where(Object.id == object_id))
        obj = result.scalar_one_or_none()
        if obj:
            obj.last_maintenance_at = date
            db.add(obj)
            await db.commit()

    async def _auto_create_ticket(self, db: AsyncSession, journal: MaintenanceJournal):
        from app.models.repair_ticket import RepairTicket
        from app.models.user import UserRole
        from app.crud.crud_ticket import generate_number
        from app.services.ai import ai_service

        ticket = RepairTicket(
            id=str(uuid.uuid4()),
            ticket_number=await generate_number(db),
            object_id=journal.object_id,
            title="Автоматическая заявка после ТО",
            description=journal.result_description or "Выявлена неисправность при плановом ТО",
            priority="high",
            status="new",
            source="journal_auto",
            created_by_id=journal.technician_id,
        )
        db.add(ticket)
        await db.commit()

    async def get_with_relations(self, db: AsyncSession, id: str) -> MaintenanceJournal | None:
        result = await db.execute(
            select(MaintenanceJournal)
            .options(selectinload(MaintenanceJournal.object), selectinload(MaintenanceJournal.technician))
            .where(MaintenanceJournal.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
        object_id: str | None = None,
        technician_id: str | None = None,
        system_status: str | None = None,
    ) -> tuple[list[MaintenanceJournal], int]:
        query = select(MaintenanceJournal)
        if object_id:
            query = query.where(MaintenanceJournal.object_id == object_id)
        if technician_id:
            query = query.where(MaintenanceJournal.technician_id == technician_id)
        if system_status:
            query = query.where(MaintenanceJournal.system_status == system_status)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()
        result = await db.execute(query.order_by(MaintenanceJournal.created_at.desc()).offset(skip).limit(limit))
        return result.scalars().all(), total

    async def complete(
        self,
        db: AsyncSession,
        *,
        db_obj: MaintenanceJournal,
        system_status: str,
        result_description: str,
        technician_signature: str | None = None,
        customer_rep_name: str | None = None,
        customer_signature: str | None = None,
    ) -> MaintenanceJournal:
        db_obj.completed_at = datetime.now(timezone.utc)
        db_obj.system_status = system_status
        db_obj.result_description = result_description
        if technician_signature:
            db_obj.technician_signature = technician_signature
        if customer_rep_name:
            db_obj.customer_rep_name = customer_rep_name
        if customer_signature:
            db_obj.customer_signature = customer_signature
        if system_status == "operational":
            db_obj.final_statement = "Система сдана Заказчику в работоспособном состоянии"
        await db.commit()
        await db.refresh(db_obj)

        # Auto-update last_maintenance_at on completion with operational status
        if system_status == "operational":
            await self._update_object_maintenance_date(db, db_obj.object_id, db_obj.completed_at)

        return db_obj

    async def add_photos(self, db: AsyncSession, *, db_obj: MaintenanceJournal, urls: list[str]) -> MaintenanceJournal:
        existing = list(db_obj.photos or [])
        db_obj.photos = existing + urls
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


journal = CRUDJournal(MaintenanceJournal)
