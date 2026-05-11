import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class MaintenanceJournalBase(BaseModel):
    object_id: str
    technician_id: str
    arrived_at: datetime | None = None
    # Тип системы и описание неисправности (Приложение №2 к ТЗ, столбец 3)
    system_type: str | None = None
    checklist: list[dict[str, Any]] | None = None
    result_description: str | None = None
    system_status: str | None = None
    customer_rep_name: str | None = None


class MaintenanceJournalCreate(MaintenanceJournalBase):
    pass


class MaintenanceJournalUpdate(BaseModel):
    arrived_at: datetime | None = None
    completed_at: datetime | None = None
    system_type: str | None = None
    checklist: list[dict[str, Any]] | None = None
    result_description: str | None = None
    system_status: str | None = None
    final_statement: str | None = None
    technician_signature: str | None = None
    customer_signature: str | None = None
    customer_rep_name: str | None = None


class MaintenanceJournalRead(MaintenanceJournalBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    journal_number: int | None
    completed_at: datetime | None
    final_statement: str | None
    photos: list[str] | None
    technician_signature: str | None
    customer_signature: str | None
    created_at: datetime
    updated_at: datetime


class JournalPhotosPatch(BaseModel):
    photo_urls: list[str]
