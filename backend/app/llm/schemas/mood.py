from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MOOD_VERSION = "v1"

MoodValue = Literal[
    "positive",
    "neutral",
    "negative",
    "frustrated",
    "enthusiastic",
    "confused",
    "concerned",
]


class SegmentMood(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idx: int = Field(description="Segment index from input")
    mood: MoodValue = Field(description="Emotional tone of this segment")


class MoodLabels(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segments: list[SegmentMood]
