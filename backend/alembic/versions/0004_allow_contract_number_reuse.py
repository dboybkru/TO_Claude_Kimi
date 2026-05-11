"""allow contract number reuse across objects

Revision ID: 0004
Revises: d68ea739a04c
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "d68ea739a04c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_contract_number_key")
    elif bind.dialect.name == "sqlite":
        with op.batch_alter_table("objects") as batch_op:
            batch_op.alter_column(
                "contract_number",
                existing_type=sa.String(length=100),
                nullable=True,
            )


def downgrade() -> None:
    op.create_unique_constraint("objects_contract_number_key", "objects", ["contract_number"])
