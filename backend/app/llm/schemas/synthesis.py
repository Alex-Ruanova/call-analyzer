from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SYNTHESIS_VERSION = "v2"

SentimentValue = Literal["positive", "neutral", "negative"]

_SENTIMENT_SCORES: dict[str, float] = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}


def sentiment_to_score(value: str | None) -> float | None:
    if value is None:
        return None
    return _SENTIMENT_SCORES.get(value)


class Synthesis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str = Field(description="One-sentence summary, max 100 chars")
    summary: str = Field(description="3–5 sentence executive summary of the call")
    overall_sentiment: SentimentValue
    language: str = Field(
        description="ISO 639-1 code of the dominant language in the transcript "
        "(e.g. 'en', 'es', 'pt', 'fr'). Lowercase, two letters."
    )
