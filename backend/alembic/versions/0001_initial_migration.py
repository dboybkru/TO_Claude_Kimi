"""initial migration

Revision ID: 0001
Revises:
Create Date: 2026-04-27

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column(
            "role",
            sa.Enum("ADMIN", "MANAGER", "DISPATCHER", "TECHNICIAN", "CUSTOMER", "AUDITOR", name="userrole"),
            nullable=False,
            server_default="TECHNICIAN",
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "objects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column(
            "object_type",
            sa.Enum("RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "GOVERNMENT", "OTHER", name="objecttype"),
            nullable=False,
            server_default="COMMERCIAL",
        ),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="objectstatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("contract_number", sa.String(100), nullable=True, unique=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("customer_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("responsible_technician_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_objects_customer_id", "objects", ["customer_id"])
    op.create_index("ix_objects_responsible_technician_id", "objects", ["responsible_technician_id"])

    op.create_table(
        "maintenance_journals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("technician_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visit_date", sa.Date, nullable=False),
        sa.Column("work_performed", sa.Text, nullable=False),
        sa.Column("equipment_condition", sa.String(50), nullable=False, server_default="NORMAL"),
        sa.Column("next_visit_date", sa.Date, nullable=True),
        sa.Column("signature", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "repair_tickets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reporter_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_to_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "priority",
            sa.Enum("LOW", "MEDIUM", "HIGH", "CRITICAL", name="ticketpriority"),
            nullable=False,
            server_default="MEDIUM",
        ),
        sa.Column(
            "status",
            sa.Enum("NEW", "IN_PROGRESS", "RESOLVED", "CLOSED", name="ticketstatus"),
            nullable=False,
            server_default="NEW",
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "maintenance_schedules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("technician_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("scheduled_date", sa.Date, nullable=False),
        sa.Column(
            "schedule_type",
            sa.Enum("PLANNED", "UNPLANNED", name="scheduletype"),
            nullable=False,
            server_default="PLANNED",
        ),
        sa.Column(
            "status",
            sa.Enum("SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED", name="schedulestatus"),
            nullable=False,
            server_default="SCHEDULED",
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("maintenance_schedules")
    op.drop_table("repair_tickets")
    op.drop_table("maintenance_journals")
    op.drop_table("objects")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS schedulestatus")
    op.execute("DROP TYPE IF EXISTS scheduletype")
    op.execute("DROP TYPE IF EXISTS ticketstatus")
    op.execute("DROP TYPE IF EXISTS ticketpriority")
    op.execute("DROP TYPE IF EXISTS objectstatus")
    op.execute("DROP TYPE IF EXISTS objecttype")
    op.execute("DROP TYPE IF EXISTS userrole")
