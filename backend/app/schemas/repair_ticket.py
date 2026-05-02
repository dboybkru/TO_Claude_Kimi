import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.repair_ticket import TicketPriority, TicketStatus, TicketSource, FaultType


class RepairTicketBase(BaseModel):
    object_id: str | None = None
    title: str
    description: str | None = None
    fault_type: FaultType | None = None
    priority: TicketPriority = TicketPriority.NORMAL
    source: TicketSource = TicketSource.MANUAL
    caller_phone: str | None = None
    called_at: datetime | None = None


class RepairTicketCreate(RepairTicketBase):
    reporter_id: str | None = None
    assigned_to_id: str | None = None


class RepairTicketUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    fault_type: FaultType | None = None
    priority: TicketPriority | None = None
    status: TicketStatus | None = None
    assigned_to_id: str | None = None
    assigned_at: datetime | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    diagnosis_act_url: str | None = None


class RepairTicketRead(RepairTicketBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    ticket_number: str
    status: TicketStatus
    reporter_id: str | None
    assigned_to_id: str | None
    assigned_at: datetime | None
    resolved_at: datetime | None
    resolution_notes: str | None
    call_recording_url: str | None
    diagnosis_act_url: str | None
    created_at: datetime
    updated_at: datetime


class RepairTicketAssign(BaseModel):
    technician_id: str


class RepairTicketResolve(BaseModel):
    resolution_notes: str
    diagnosis_act_url: str | None = None
