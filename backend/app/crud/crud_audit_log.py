from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Sequence

from app.crud.base import CRUDBase
from app.models.audit_log import AuditLog


class CRUDAuditLog(CRUDBase[AuditLog]):
    async def get_by_user(
        self, db: AsyncSession, user_id: str, limit: int = 100
    ) -> Sequence[AuditLog]:
        result = await db.execute(
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        return result.scalars().all()

    async def get_by_resource(
        self, db: AsyncSession, resource: str, resource_id: str | None = None, limit: int = 100
    ) -> Sequence[AuditLog]:
        query = select(AuditLog).where(AuditLog.resource == resource)
        if resource_id:
            query = query.where(AuditLog.resource_id == resource_id)
        result = await db.execute(
            query.order_by(desc(AuditLog.created_at)).limit(limit)
        )
        return result.scalars().all()


audit_log_crud = CRUDAuditLog(AuditLog)
