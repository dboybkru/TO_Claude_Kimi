from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, require_roles
from app.crud.crud_audit_log import audit_log_crud
from app.models.user import User, UserRole
from app.schemas.audit_log import AuditLogRead, AuditLogList

router = APIRouter()


@router.get("/", response_model=AuditLogList)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user_id: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR)),
):
    """Просмотр audit logs (только ADMIN и AUDITOR)."""
    skip = (page - 1) * size
    
    if user_id:
        items = await audit_log_crud.get_by_user(db, user_id, limit=size)
    elif resource:
        items = await audit_log_crud.get_by_resource(db, resource, limit=size)
    else:
        items = await audit_log_crud.get_multi(db, skip=skip, limit=size)
    
    total = len(items)  # TODO: add count query
    
    return AuditLogList(
        items=[AuditLogRead.model_validate(item) for item in items],
        total=total,
        page=page,
        size=size,
    )
