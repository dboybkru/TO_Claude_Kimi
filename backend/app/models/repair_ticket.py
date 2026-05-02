import uuid
import enum
from datetime import datetime

from sqlalchemy import String, ForeignKey, Text, DateTime, Enum as SAEnum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class TicketSource(str, enum.Enum):
    VOICE_BOT    = "voice_bot"
    MANUAL       = "manual"
    JOURNAL_AUTO = "journal_auto"


class FaultType(str, enum.Enum):
    HARDWARE = "hardware"
    SOFTWARE = "software"
    POWER    = "power"
    SENSOR   = "sensor"
    ACCESS   = "access"
    OTHER    = "other"


class TicketPriority(str, enum.Enum):
    LOW      = "low"
    NORMAL   = "normal"
    HIGH     = "high"
    CRITICAL = "critical"


class TicketStatus(str, enum.Enum):
    NEW               = "new"
    CALLBACK_REQUIRED = "callback_required"
    ASSIGNED          = "assigned"
    IN_PROGRESS       = "in_progress"
    RESOLVED          = "resolved"
    CLOSED            = "closed"


class RepairTicket(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "repair_tickets"

    ticket_number:    Mapped[str]              = mapped_column(String(20), unique=True, nullable=False, index=True)
    source:           Mapped[TicketSource]     = mapped_column(SAEnum(TicketSource, native_enum=False), nullable=False, default=TicketSource.MANUAL)
    object_id:        Mapped[str|None]         = mapped_column(String(36), ForeignKey("objects.id", ondelete="SET NULL"), nullable=True, index=True)
    caller_phone:     Mapped[str|None]         = mapped_column(String(20), nullable=True)
    call_recording_url:Mapped[str|None]        = mapped_column(Text, nullable=True)
    called_at:        Mapped[datetime|None]    = mapped_column(DateTime(timezone=True), nullable=True)
    title:            Mapped[str]              = mapped_column(String(500), nullable=False)
    description:      Mapped[str|None]         = mapped_column(Text, nullable=True)
    fault_type:       Mapped[FaultType|None]   = mapped_column(SAEnum(FaultType, native_enum=False), nullable=True)
    priority:         Mapped[TicketPriority]   = mapped_column(SAEnum(TicketPriority, native_enum=False), nullable=False, default=TicketPriority.NORMAL)
    status:           Mapped[TicketStatus]     = mapped_column(SAEnum(TicketStatus, native_enum=False), nullable=False, default=TicketStatus.NEW, index=True)
    reporter_id:      Mapped[str|None]         = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_id:   Mapped[str|None]         = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_at:      Mapped[datetime|None]    = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at:      Mapped[datetime|None]    = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notes: Mapped[str|None]         = mapped_column(Text, nullable=True)
    diagnosis_act_url:Mapped[str|None]         = mapped_column(Text, nullable=True)

    object:      Mapped["Object|None"] = relationship("Object", back_populates="repair_tickets")
    reporter:    Mapped["User|None"]   = relationship("User", foreign_keys=[reporter_id], back_populates="repair_tickets_reported")
    assigned_to: Mapped["User|None"]   = relationship("User", foreign_keys=[assigned_to_id], back_populates="repair_tickets_assigned")
