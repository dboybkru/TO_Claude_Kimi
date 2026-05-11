"""Add contract fields: system_type in journals, geocode/scheduler fields in objects

Revision ID: 0005
Revises: d68ea739a04c
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = 'd68ea739a04c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- maintenance_journals ---
    # Тип системы и описание неисправности (Приложение №2 к ТЗ, столбец 3)
    op.add_column(
        'maintenance_journals',
        sa.Column('system_type', sa.String(200), nullable=True),
    )

    # --- objects ---
    # Геокодинг
    op.add_column('objects', sa.Column('geocode_status', sa.String(20), nullable=True, server_default='approximate'))
    op.add_column('objects', sa.Column('geocode_source', sa.String(50), nullable=True))

    # Планировщик выездов + SLA из договора 10944505 (п.1.2.2 / п.2.3.5)
    op.add_column('objects', sa.Column('service_duration_minutes', sa.Integer(), nullable=True))
    op.add_column('objects', sa.Column('response_hours', sa.Integer(), nullable=True, server_default='4'))
    op.add_column('objects', sa.Column('arrival_hours',  sa.Integer(), nullable=True, server_default='8'))

    # Заполняем geocode_status для существующих объектов у которых есть координаты
    op.execute(
        "UPDATE objects SET geocode_status = 'approximate' "
        "WHERE geocode_status IS NULL AND lat IS NOT NULL AND lng IS NOT NULL"
    )
    op.execute(
        "UPDATE objects SET geocode_status = 'failed' "
        "WHERE geocode_status IS NULL AND (lat IS NULL OR lng IS NULL)"
    )


def downgrade() -> None:
    op.drop_column('objects', 'arrival_hours')
    op.drop_column('objects', 'response_hours')
    op.drop_column('objects', 'service_duration_minutes')
    op.drop_column('objects', 'geocode_source')
    op.drop_column('objects', 'geocode_status')
    op.drop_column('maintenance_journals', 'system_type')
