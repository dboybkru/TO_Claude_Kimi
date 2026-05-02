import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, Text, DateTime, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class MaintenanceJournal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "maintenance_journals"

    object_id:    Mapped[str]      = mapped_column(String(36), ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id:Mapped[str]      = mapped_column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    journal_number:Mapped[int|None]= mapped_column(Integer, nullable=True)

    arrived_at:   Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    checklist:           Mapped[dict|None] = mapped_column(JSON, nullable=True)
    result_description:  Mapped[str|None]  = mapped_column(Text, nullable=True)
    system_status:       Mapped[str|None]  = mapped_column(String(20), nullable=True)
    final_statement:     Mapped[str|None]  = mapped_column(Text, nullable=True)
    photos:              Mapped[dict|None] = mapped_column(JSON, nullable=True)
    technician_signature:Mapped[str|None]  = mapped_column(Text, nullable=True)
    customer_signature:  Mapped[str|None]  = mapped_column(Text, nullable=True)
    customer_rep_name:   Mapped[str|None]  = mapped_column(String(255), nullable=True)

    object:     Mapped["Object"] = relationship("Object", back_populates="maintenance_journals")
    technician: Mapped["User"]   = relationship("User", foreign_keys=[technician_id], back_populates="maintenance_journals")
