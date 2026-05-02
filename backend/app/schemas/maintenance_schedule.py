import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.maintenance_schedule import ScheduleType, ScheduleStatus


class MaintenanceScheduleBase(BaseModel):
    object_id: str
    technician_id: str | None = None
    scheduled_date: date
    month: int
    year: int
    schedule_type: ScheduleType = ScheduleType.PLANNED
    notes: str | None = None


class MaintenanceScheduleCreate(MaintenanceScheduleBase):
    pass


class MaintenanceScheduleUpdate(BaseModel):
    technician_id: str | None = None
    scheduled_date: date | None = None
    status: ScheduleStatus | None = None
    notes: str | None = None
    journal_id: str | None = None


class MaintenanceScheduleRead(MaintenanceScheduleBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: ScheduleStatus
    journal_id: str | None
    created_at: datetime
    updated_at: datetime
