import uuid
import enum

from sqlalchemy import String, Boolean, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class UserRole(str, enum.Enum):
    ADMIN      = "ADMIN"
    MANAGER    = "MANAGER"
    DISPATCHER = "DISPATCHER"
    TECHNICIAN = "TECHNICIAN"
    CUSTOMER   = "CUSTOMER"
    AUDITOR    = "AUDITOR"
    ROBOT_API  = "ROBOT_API"


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email:          Mapped[str]      = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password:Mapped[str]      = mapped_column(String(255), nullable=False)
    full_name:      Mapped[str]      = mapped_column(String(255), nullable=False)
    phone:          Mapped[str|None] = mapped_column(String(50), nullable=True)
    role:           Mapped[UserRole] = mapped_column(SAEnum(UserRole, native_enum=False), nullable=False, default=UserRole.TECHNICIAN)
    is_active:      Mapped[bool]     = mapped_column(Boolean, default=True, nullable=False)
    push_token:     Mapped[str|None] = mapped_column(Text, nullable=True)

    objects_as_customer:  Mapped[list["Object"]] = relationship("Object", foreign_keys="Object.customer_id", back_populates="customer")
    objects_as_technician:Mapped[list["Object"]] = relationship("Object", foreign_keys="Object.responsible_technician_id", back_populates="responsible_technician")
    maintenance_journals: Mapped[list["MaintenanceJournal"]] = relationship("MaintenanceJournal", foreign_keys="MaintenanceJournal.technician_id", back_populates="technician")
    repair_tickets_reported: Mapped[list["RepairTicket"]] = relationship("RepairTicket", foreign_keys="RepairTicket.reporter_id", back_populates="reporter")
    repair_tickets_assigned: Mapped[list["RepairTicket"]] = relationship("RepairTicket", foreign_keys="RepairTicket.assigned_to_id", back_populates="assigned_to")
    maintenance_schedules:   Mapped[list["MaintenanceSchedule"]] = relationship("MaintenanceSchedule", foreign_keys="MaintenanceSchedule.technician_id", back_populates="technician")
