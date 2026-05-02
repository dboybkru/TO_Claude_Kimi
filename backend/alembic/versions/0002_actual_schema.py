"""actual schema — align with current models

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-30
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── users ──────────────────────────────────────────────────────────────
    op.add_column("users", sa.Column("push_token", sa.Text, nullable=True))

    # ── objects: replace old enums, add missing columns ────────────────────
    op.drop_column("objects", "object_type")
    op.drop_column("objects", "status")
    conn.execute(sa.text("DROP TYPE IF EXISTS objecttype"))
    conn.execute(sa.text("DROP TYPE IF EXISTS objectstatus"))
    conn.execute(sa.text("CREATE TYPE objecttype_v2 AS ENUM ('OS','OTS','SKUD','OS_OTS','SKUD_OS')"))
    conn.execute(sa.text("CREATE TYPE objectstatus_v2 AS ENUM ('active','inactive','in_repair')"))

    op.add_column("objects", sa.Column(
        "type",
        sa.Enum("OS", "OTS", "SKUD", "OS_OTS", "SKUD_OS", name="objecttype_v2", create_type=False),
        nullable=False, server_default="OS",
    ))
    op.add_column("objects", sa.Column(
        "status",
        sa.Enum("active", "inactive", "in_repair", name="objectstatus_v2", create_type=False),
        nullable=False, server_default="active",
    ))
    op.add_column("objects", sa.Column("address_normalized", sa.Text, nullable=False, server_default=""))
    op.add_column("objects", sa.Column("address_aliases", sa.JSON, nullable=True))
    op.add_column("objects", sa.Column("region", sa.String(100), nullable=True))
    op.add_column("objects", sa.Column("equipment", sa.JSON, nullable=True))
    op.add_column("objects", sa.Column("contact_person", sa.JSON, nullable=True))
    op.add_column("objects", sa.Column("monthly_maintenance_required", sa.Boolean, nullable=False, server_default="true"))
    op.add_column("objects", sa.Column("last_maintenance_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("objects", sa.Column("lat", sa.Float, nullable=True))
    op.add_column("objects", sa.Column("lng", sa.Float, nullable=True))

    op.create_index("ix_objects_status", "objects", ["status"])
    op.create_index("ix_objects_region", "objects", ["region"])

    # ── maintenance_journals: drop old columns, add new ────────────────────
    op.drop_column("maintenance_journals", "visit_date")
    op.drop_column("maintenance_journals", "work_performed")
    op.drop_column("maintenance_journals", "equipment_condition")
    op.drop_column("maintenance_journals", "next_visit_date")
    op.drop_column("maintenance_journals", "signature")

    op.add_column("maintenance_journals", sa.Column("journal_number", sa.Integer, nullable=True))
    op.add_column("maintenance_journals", sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_journals", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_journals", sa.Column("checklist", sa.JSON, nullable=True))
    op.add_column("maintenance_journals", sa.Column("result_description", sa.Text, nullable=True))
    op.add_column("maintenance_journals", sa.Column("system_status", sa.String(20), nullable=True))
    op.add_column("maintenance_journals", sa.Column("final_statement", sa.Text, nullable=True))
    op.add_column("maintenance_journals", sa.Column("photos", sa.JSON, nullable=True))
    op.add_column("maintenance_journals", sa.Column("technician_signature", sa.Text, nullable=True))
    op.add_column("maintenance_journals", sa.Column("customer_signature", sa.Text, nullable=True))
    op.add_column("maintenance_journals", sa.Column("customer_rep_name", sa.String(255), nullable=True))
    op.create_index("ix_maintenance_journals_completed_at", "maintenance_journals", ["completed_at"])

    # ── repair_tickets: replace old enums, add new columns ────────────────
    op.drop_column("repair_tickets", "priority")
    op.drop_column("repair_tickets", "status")
    conn.execute(sa.text("DROP TYPE IF EXISTS ticketpriority"))
    conn.execute(sa.text("DROP TYPE IF EXISTS ticketstatus"))
    conn.execute(sa.text("CREATE TYPE ticketpriority_v2 AS ENUM ('low','normal','high','critical')"))
    conn.execute(sa.text("CREATE TYPE ticketstatus_v2 AS ENUM ('new','callback_required','assigned','in_progress','resolved','closed')"))
    conn.execute(sa.text("CREATE TYPE ticketsource AS ENUM ('voice_bot','manual','journal_auto')"))
    conn.execute(sa.text("CREATE TYPE faulttype AS ENUM ('hardware','software','power','sensor','access','other')"))

    op.add_column("repair_tickets", sa.Column(
        "priority",
        sa.Enum("low", "normal", "high", "critical", name="ticketpriority_v2", create_type=False),
        nullable=False, server_default="normal",
    ))
    op.add_column("repair_tickets", sa.Column(
        "status",
        sa.Enum("new", "callback_required", "assigned", "in_progress", "resolved", "closed",
                name="ticketstatus_v2", create_type=False),
        nullable=False, server_default="new",
    ))
    op.add_column("repair_tickets", sa.Column(
        "source",
        sa.Enum("voice_bot", "manual", "journal_auto", name="ticketsource", create_type=False),
        nullable=False, server_default="manual",
    ))
    op.add_column("repair_tickets", sa.Column(
        "fault_type",
        sa.Enum("hardware", "software", "power", "sensor", "access", "other",
                name="faulttype", create_type=False),
        nullable=True,
    ))
    op.add_column("repair_tickets", sa.Column(
        "ticket_number", sa.String(20), nullable=False, server_default="REQ-LEGACY-0000",
    ))
    op.add_column("repair_tickets", sa.Column("caller_phone", sa.String(20), nullable=True))
    op.add_column("repair_tickets", sa.Column("call_recording_url", sa.Text, nullable=True))
    op.add_column("repair_tickets", sa.Column("called_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("repair_tickets", sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("repair_tickets", sa.Column("resolution_notes", sa.Text, nullable=True))
    op.add_column("repair_tickets", sa.Column("diagnosis_act_url", sa.Text, nullable=True))

    op.alter_column("repair_tickets", "object_id", nullable=True)
    op.create_index("ix_repair_tickets_ticket_number", "repair_tickets", ["ticket_number"], unique=True)
    op.create_index("ix_repair_tickets_status", "repair_tickets", ["status"])

    # ── maintenance_schedules: replace old enum, add new columns ──────────
    op.drop_column("maintenance_schedules", "status")
    conn.execute(sa.text("DROP TYPE IF EXISTS schedulestatus"))
    conn.execute(sa.text("CREATE TYPE schedulestatus_v2 AS ENUM ('planned','done','overdue','cancelled')"))

    op.add_column("maintenance_schedules", sa.Column(
        "status",
        sa.Enum("planned", "done", "overdue", "cancelled", name="schedulestatus_v2", create_type=False),
        nullable=False, server_default="planned",
    ))
    op.add_column("maintenance_schedules", sa.Column("month", sa.Integer, nullable=False, server_default="1"))
    op.add_column("maintenance_schedules", sa.Column("year", sa.Integer, nullable=False, server_default="2026"))
    op.add_column("maintenance_schedules", sa.Column(
        "journal_id", sa.String(36),
        sa.ForeignKey("maintenance_journals.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index("ix_maintenance_schedules_month_year", "maintenance_schedules", ["month", "year"])


def downgrade() -> None:
    conn = op.get_bind()

    op.drop_index("ix_maintenance_schedules_month_year", "maintenance_schedules")
    op.drop_column("maintenance_schedules", "journal_id")
    op.drop_column("maintenance_schedules", "year")
    op.drop_column("maintenance_schedules", "month")
    op.drop_column("maintenance_schedules", "status")
    conn.execute(sa.text("DROP TYPE IF EXISTS schedulestatus_v2"))
    conn.execute(sa.text("CREATE TYPE schedulestatus AS ENUM ('SCHEDULED','COMPLETED','CANCELLED','RESCHEDULED')"))
    op.add_column("maintenance_schedules", sa.Column(
        "status",
        sa.Enum("SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED", name="schedulestatus", create_type=False),
        nullable=False, server_default="SCHEDULED",
    ))

    op.drop_index("ix_repair_tickets_status", "repair_tickets")
    op.drop_index("ix_repair_tickets_ticket_number", "repair_tickets")
    op.drop_column("repair_tickets", "diagnosis_act_url")
    op.drop_column("repair_tickets", "resolution_notes")
    op.drop_column("repair_tickets", "assigned_at")
    op.drop_column("repair_tickets", "called_at")
    op.drop_column("repair_tickets", "call_recording_url")
    op.drop_column("repair_tickets", "caller_phone")
    op.drop_column("repair_tickets", "ticket_number")
    op.drop_column("repair_tickets", "fault_type")
    op.drop_column("repair_tickets", "source")
    op.drop_column("repair_tickets", "status")
    op.drop_column("repair_tickets", "priority")
    conn.execute(sa.text("DROP TYPE IF EXISTS faulttype"))
    conn.execute(sa.text("DROP TYPE IF EXISTS ticketsource"))
    conn.execute(sa.text("DROP TYPE IF EXISTS ticketstatus_v2"))
    conn.execute(sa.text("DROP TYPE IF EXISTS ticketpriority_v2"))
    conn.execute(sa.text("CREATE TYPE ticketpriority AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL')"))
    conn.execute(sa.text("CREATE TYPE ticketstatus AS ENUM ('NEW','IN_PROGRESS','RESOLVED','CLOSED')"))
    op.add_column("repair_tickets", sa.Column(
        "priority",
        sa.Enum("LOW", "MEDIUM", "HIGH", "CRITICAL", name="ticketpriority", create_type=False),
        nullable=False, server_default="MEDIUM",
    ))
    op.add_column("repair_tickets", sa.Column(
        "status",
        sa.Enum("NEW", "IN_PROGRESS", "RESOLVED", "CLOSED", name="ticketstatus", create_type=False),
        nullable=False, server_default="NEW",
    ))
    op.alter_column("repair_tickets", "object_id", nullable=False)

    op.drop_index("ix_maintenance_journals_completed_at", "maintenance_journals")
    op.drop_column("maintenance_journals", "customer_rep_name")
    op.drop_column("maintenance_journals", "customer_signature")
    op.drop_column("maintenance_journals", "technician_signature")
    op.drop_column("maintenance_journals", "photos")
    op.drop_column("maintenance_journals", "final_statement")
    op.drop_column("maintenance_journals", "system_status")
    op.drop_column("maintenance_journals", "result_description")
    op.drop_column("maintenance_journals", "checklist")
    op.drop_column("maintenance_journals", "completed_at")
    op.drop_column("maintenance_journals", "arrived_at")
    op.drop_column("maintenance_journals", "journal_number")
    op.add_column("maintenance_journals", sa.Column("visit_date", sa.Date, nullable=False, server_default="2026-01-01"))
    op.add_column("maintenance_journals", sa.Column("work_performed", sa.Text, nullable=False, server_default=""))
    op.add_column("maintenance_journals", sa.Column("equipment_condition", sa.String(50), nullable=False, server_default="NORMAL"))
    op.add_column("maintenance_journals", sa.Column("next_visit_date", sa.Date, nullable=True))
    op.add_column("maintenance_journals", sa.Column("signature", sa.String(500), nullable=True))

    op.drop_index("ix_objects_region", "objects")
    op.drop_index("ix_objects_status", "objects")
    op.drop_column("objects", "lng")
    op.drop_column("objects", "lat")
    op.drop_column("objects", "last_maintenance_at")
    op.drop_column("objects", "monthly_maintenance_required")
    op.drop_column("objects", "contact_person")
    op.drop_column("objects", "equipment")
    op.drop_column("objects", "region")
    op.drop_column("objects", "address_aliases")
    op.drop_column("objects", "address_normalized")
    op.drop_column("objects", "status")
    op.drop_column("objects", "type")
    conn.execute(sa.text("DROP TYPE IF EXISTS objectstatus_v2"))
    conn.execute(sa.text("DROP TYPE IF EXISTS objecttype_v2"))
    conn.execute(sa.text("CREATE TYPE objecttype AS ENUM ('RESIDENTIAL','COMMERCIAL','INDUSTRIAL','GOVERNMENT','OTHER')"))
    conn.execute(sa.text("CREATE TYPE objectstatus AS ENUM ('ACTIVE','INACTIVE','SUSPENDED')"))
    op.add_column("objects", sa.Column(
        "object_type",
        sa.Enum("RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "GOVERNMENT", "OTHER",
                name="objecttype", create_type=False),
        nullable=False, server_default="COMMERCIAL",
    ))
    op.add_column("objects", sa.Column(
        "status",
        sa.Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="objectstatus", create_type=False),
        nullable=False, server_default="ACTIVE",
    ))

    op.drop_column("users", "push_token")
