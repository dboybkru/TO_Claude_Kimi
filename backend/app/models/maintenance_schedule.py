import uuid
import enum
from datetime import date

from sqlalchemy import String, ForeignKey, Text, Date, Enum as SAEnum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class ScheduleType(str, enum.Enum):
    PLANNED   = "planned"
    UNPLANNED = "unplanned"


class ScheduleStatus(str, enum.Enum):
    PLANNED   = "planned"
    DONE      = "done"
    OVERDUE   = "overdue"
    CANCELLED = "cancelled"


class MaintenanceSchedule(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "maintenance_schedules"

    object_id:     Mapped[str]            = mapped_column(String(36), ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[str|None]       = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    scheduled_date:Mapped[date]           = mapped_column(Date, nullable=False)
    month:         Mapped[int]            = mapped_column(Integer, nullable=False)
    year:          Mapped[int]            = mapped_column(Integer, nullable=False)
    schedule_type: Mapped[ScheduleType]   = mapped_column(SAEnum(ScheduleType, native_enum=False), nullable=False, default=ScheduleType.PLANNED)
    status:        Mapped[ScheduleStatus] = mapped_column(SAEnum(ScheduleStatus, native_enum=False), nullable=False, default=ScheduleStatus.PLANNED)
    notes:         Mapped[str|None]       = mapped_column(Text, nullable=True)
    journal_id:    Mapped[str|None]       = mapped_column(String(36), ForeignKey("maintenance_journals.id", ondelete="SET NULL"), nullable=True)

    object:     Mapped["Object"]             = relationship("Object", back_populates="maintenance_schedules")
    technician: Mapped["User|None"]          = relationship("User", foreign_keys=[technician_id], back_populates="maintenance_schedules")
    journal:    Mapped["MaintenanceJournal|None"] = relationship("MaintenanceJournal", foreign_keys=[journal_id])
