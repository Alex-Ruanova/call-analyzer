"""seed_system_tags

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-09

Upserts the canonical system tag taxonomy (defined in app.llm.system_tags) so
the UI has stable colors and is_system flags without relying on a manual seed
step. Idempotent — safe to re-run via downgrade/upgrade.
"""

from typing import Sequence, Union

from alembic import op

from app.llm.system_tags import SYSTEM_TAGS

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for name, color in SYSTEM_TAGS:
        op.execute(
            "INSERT INTO tags (name, color, is_system) "
            f"VALUES ('{name}', '{color}', TRUE) "
            "ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, is_system = TRUE"
        )


def downgrade() -> None:
    names = ", ".join(f"'{name}'" for name, _ in SYSTEM_TAGS)
    op.execute(f"DELETE FROM tags WHERE is_system = TRUE AND name IN ({names})")
