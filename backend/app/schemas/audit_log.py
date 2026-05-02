from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AuditLogBase(BaseModel):
    user_id: str | None = None
    user_email: str | None = None
    action: str
    resource: str
    resource_id: str | None = None
    details: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogRead(AuditLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class AuditLogList(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    size: int
