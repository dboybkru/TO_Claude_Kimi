import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.object import ObjectType, ObjectStatus

from app.schemas.user import UserRead  # noqa: E402


class ObjectBase(BaseModel):
    name: str
    address: str
    address_normalized: str = ""
    address_aliases: list[str] | None = None
    type: ObjectType = ObjectType.OS
    region: str | None = None
    equipment: list[Any] | None = None
    contact_person: dict[str, Any] | None = None
    monthly_maintenance_required: bool = True
    status: ObjectStatus = ObjectStatus.ACTIVE
    contract_number: str | None = None
    notes: str | None = None
    lat: float | None = None
    lng: float | None = None
    customer_id: str | None = None
    responsible_technician_id: str | None = None
    geocode_status: str | None = None
    geocode_source: str | None = None
    service_duration_minutes: int | None = None
    response_hours: int | None = None
    arrival_hours: int | None = None


class ObjectCreate(ObjectBase):
    pass


class ObjectUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    address_normalized: str | None = None
    address_aliases: list[str] | None = None
    type: ObjectType | None = None
    region: str | None = None
    equipment: list[Any] | None = None
    contact_person: dict[str, Any] | None = None
    monthly_maintenance_required: bool | None = None
    status: ObjectStatus | None = None
    contract_number: str | None = None
    notes: str | None = None
    lat: float | None = None
    lng: float | None = None
    customer_id: str | None = None
    responsible_technician_id: str | None = None
    geocode_status: str | None = None
    geocode_source: str | None = None
    service_duration_minutes: int | None = None
    response_hours: int | None = None
    arrival_hours: int | None = None


class ObjectRead(ObjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    last_maintenance_at: datetime | None = None
    geocode_status: str | None = None
    geocode_source: str | None = None
    service_duration_minutes: int | None = None
    response_hours: int | None = None
    arrival_hours: int | None = None
    created_at: datetime
    updated_at: datetime


class ObjectReadDetail(ObjectRead):
    customer: "UserRead | None" = None
    responsible_technician: "UserRead | None" = None


class ObjectList(BaseModel):
    items: list[ObjectRead]
    total: int
    page: int
    size: int


class ObjectMapItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    address: str
    type: ObjectType
    status: ObjectStatus
    lat: float | None
    lng: float | None
    geocode_status: str | None = None
    last_maintenance_at: datetime | None = None
