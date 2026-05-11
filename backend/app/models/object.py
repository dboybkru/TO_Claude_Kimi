import uuid
import enum
from datetime import datetime

from sqlalchemy import String, ForeignKey, Enum as SAEnum, Text, Boolean, DateTime, Float, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class ObjectType(str, enum.Enum):
    OS      = "OS"
    OTS     = "OTS"
    SKUD    = "SKUD"
    OS_OTS  = "OS_OTS"
    SKUD_OS = "SKUD_OS"


class ObjectStatus(str, enum.Enum):
    ACTIVE    = "active"
    INACTIVE  = "inactive"
    IN_REPAIR = "in_repair"


class Object(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "objects"

    name:                        Mapped[str]           = mapped_column(String(255), nullable=False)
    address:                     Mapped[str]           = mapped_column(Text, nullable=False)
    address_normalized:          Mapped[str]           = mapped_column(Text, nullable=False, default="")
    address_aliases:             Mapped[dict|None]     = mapped_column(JSON, nullable=True)
    type:                        Mapped[ObjectType]    = mapped_column(SAEnum(ObjectType, native_enum=False), nullable=False, default=ObjectType.OS)
    region:                      Mapped[str|None]      = mapped_column(String(100), nullable=True)
    equipment:                   Mapped[dict|None]     = mapped_column(JSON, nullable=True)
    contact_person:              Mapped[dict|None]     = mapped_column(JSON, nullable=True)
    monthly_maintenance_required:Mapped[bool]          = mapped_column(Boolean, default=True, nullable=False)
    last_maintenance_at:         Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    status:                      Mapped[ObjectStatus]  = mapped_column(
        SAEnum(
            ObjectStatus,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
        default=ObjectStatus.ACTIVE.value,
    )
    contract_number:             Mapped[str|None]      = mapped_column(String(100), nullable=True)
    notes:                       Mapped[str|None]      = mapped_column(Text, nullable=True)
    lat:                         Mapped[float|None]    = mapped_column(Float, nullable=True)
    lng:                         Mapped[float|None]    = mapped_column(Float, nullable=True)

    # Геокодинг — статус точности координат
    # exact: точный адрес, approximate: центр нас. пункта, failed: не найден, manual: задано вручную
    geocode_status:  Mapped[str|None] = mapped_column(String(20), nullable=True, default="approximate")
    geocode_source:  Mapped[str|None] = mapped_column(String(50), nullable=True)

    # Планировщик выездов (Договор 10944505, п.1.2.2 / п.2.3.5)
    service_duration_minutes: Mapped[int|None] = mapped_column(Integer, nullable=True)
    # SLA: response_hours=4 (диспетчер обязан отреагировать), arrival_hours=8 (физический приезд)
    response_hours: Mapped[int|None] = mapped_column(Integer, nullable=True, default=4)
    arrival_hours:  Mapped[int|None] = mapped_column(Integer, nullable=True, default=8)

    customer_id:              Mapped[str|None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    responsible_technician_id:Mapped[str|None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    customer:               Mapped["User|None"] = relationship("User", foreign_keys=[customer_id], back_populates="objects_as_customer")
    responsible_technician: Mapped["User|None"] = relationship("User", foreign_keys=[responsible_technician_id], back_populates="objects_as_technician")
    maintenance_journals:   Mapped[list["MaintenanceJournal"]]  = relationship("MaintenanceJournal", back_populates="object", cascade="all, delete-orphan")
    repair_tickets:         Mapped[list["RepairTicket"]]         = relationship("RepairTicket", back_populates="object", cascade="all, delete-orphan")
    maintenance_schedules:  Mapped[list["MaintenanceSchedule"]] = relationship("MaintenanceSchedule", back_populates="object", cascade="all, delete-orphan")
