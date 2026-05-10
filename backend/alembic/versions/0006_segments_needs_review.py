"""segments_needs_review

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-09

Adds a flag to surface diarization-suspect segments to the user as a review
queue (see docs/technical-debt/20).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transcript_segments",
        sa.Column(
            "needs_review",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("transcript_segments", "needs_review")
