"""Single source of truth for the system tag taxonomy.

The LLM tagger is constrained to these names by the prompt. The same list is
upserted into the `tags` table by an Alembic data migration so the UI has
colors and the `is_system` flag without relying on a manual seed step.
"""
from __future__ import annotations

from typing import Final

SystemTag = tuple[str, str]  # (name, hex color)

SYSTEM_TAGS: Final[list[SystemTag]] = [
    ("discovery", "#10b981"),
    ("demo", "#22d3ee"),
    ("objection-handling", "#f59e0b"),
    ("pricing-discussion", "#f43f5e"),
    ("follow-up-agreed", "#a78bfa"),
    ("positive-outcome", "#10b981"),
    ("feature-request", "#0ea5e9"),
    ("onboarding", "#6366f1"),
    ("renewal", "#6366f1"),
    ("other", "#6b7280"),
]

SYSTEM_TAG_NAMES: Final[list[str]] = [name for name, _ in SYSTEM_TAGS]
