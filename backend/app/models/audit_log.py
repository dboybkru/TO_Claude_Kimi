import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin


class AuditLog(UUIDMixin, Base):
    __tablename__ = "audit_logs"

    user_id:    Mapped[str|None]  = mapped_column(String(36), nullable=True)
    user_email: Mapped[str|None]  = mapped_column(String(255), nullable=True)
    action:     Mapped[str]       = mapped_column(String(50), nullable=False)
    resource:   Mapped[str]       = mapped_column(String(100), nullable=False)
    resource_id:Mapped[str|None]  = mapped_column(String(36), nullable=True)
    details:    Mapped[str|None]  = mapped_column(Text, nullable=True)
    ip_address: Mapped[str|None]  = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str|None]  = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_resource", "resource"),
        Index("ix_audit_logs_created_at", "created_at"),
    )
