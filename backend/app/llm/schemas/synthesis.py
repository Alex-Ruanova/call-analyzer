from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SYNTHESIS_VERSION = "v1"

SentimentValue = Literal["positive", "neutral", "negative"]


class Synthesis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str = Field(description="One-sentence summary, max 100 chars")
    summary: str = Field(description="3–5 sentence executive summary of the call")
    overall_sentiment: SentimentValue
