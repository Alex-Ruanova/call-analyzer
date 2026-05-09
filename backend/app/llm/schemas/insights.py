from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

INSIGHTS_VERSION = "v1"

InsightKind = Literal[
    "pain-point",
    "objection",
    "buying-signal",
    "feature-req",
    "competitor",
    "pricing",
    "next-step",
    "quote",
    "risk",
    "highlight",
]


class ExtractedInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: InsightKind
    text: str = Field(description="Verbatim or close paraphrase from transcript")
    segment_idx: int | None = Field(
        description="Index of the most relevant segment, or null"
    )
    weight: float = Field(description="Importance 0.0–2.0")


class ExtractedActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    owner: str | None = Field(description="Person responsible, or null if unclear")
    due_date: str | None = Field(
        description="ISO date string (YYYY-MM-DD) if mentioned, else null"
    )


class InsightExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    insights: list[ExtractedInsight]
    action_items: list[ExtractedActionItem]
