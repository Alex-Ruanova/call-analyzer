"""calls_soft_delete

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("calls", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_calls_deleted_at", "calls", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_calls_deleted_at", table_name="calls")
    op.drop_column("calls", "deleted_at")
