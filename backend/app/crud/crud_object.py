from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.object import Object, ObjectStatus
from app.schemas.object import ObjectCreate, ObjectUpdate


class CRUDObject(CRUDBase[Object]):
    async def get_with_relations(self, db: AsyncSession, id) -> Object | None:
        result = await db.execute(
            select(Object)
            .options(selectinload(Object.customer), selectinload(Object.responsible_technician))
            .where(Object.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 100,
        status: ObjectStatus | None = None,
        customer_id=None,
        technician_id=None,
    ) -> tuple[list[Object], int]:
        query = select(Object)
        if status:
            query = query.where(Object.status == status)
        if customer_id:
            query = query.where(Object.customer_id == customer_id)
        if technician_id:
            query = query.where(Object.responsible_technician_id == technician_id)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()

        result = await db.execute(query.order_by(Object.name.asc()).offset(skip).limit(limit))
        return result.scalars().all(), total

    async def create(self, db: AsyncSession, *, obj_in: ObjectCreate) -> Object:
        return await super().create(db, obj_in=obj_in.model_dump())

    async def update(self, db: AsyncSession, *, db_obj: Object, obj_in: ObjectUpdate) -> Object:
        return await super().update(db, db_obj=db_obj, obj_in=obj_in.model_dump(exclude_unset=True))


object = CRUDObject(Object)
