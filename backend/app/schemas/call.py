from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.tag import TagOut


class CallCreate(BaseModel):
    client_id: int | None = None
    title: str | None = None


class CallUpdate(BaseModel):
    client_id: int | None = None
    title: str | None = None


class TagOverrideRequest(BaseModel):
    tag_names: list[str]


class ParticipantIn(BaseModel):
    speaker_label: str
    display_name: str | None = None
    role: str | None = None
    side: str | None = None  # 'rep' | 'client'


class ParticipantOut(ParticipantIn):
    model_config = ConfigDict(from_attributes=True)


class ParticipantsRequest(BaseModel):
    participants: list[ParticipantIn]


class TranscriptSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idx: int
    start_seconds: float
    end_seconds: float
    speaker_label: str
    speaker_role: str | None
    text: str
    mood: str | None
    needs_review: bool = False


class SegmentUpdate(BaseModel):
    speaker_label: str | None = None
    text: str | None = None


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    text: str
    segment_idx: int | None
    weight: float


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    headline: str
    overall_sentiment: str
    talk_ratio_rep: float
    talk_ratio_client: float
    llm_model_used: str
    cost_usd_breakdown: dict[str, float]
    cost_usd_total: float


class CallSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    client_id: int | None
    client_name: str | None
    created_at: datetime
    duration_seconds: float | None
    tags: list[TagOut]
    cost_usd_total: float | None
    overall_sentiment: str | None = None
    sentiment_score: float | None = None


class CallDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    client_id: int | None
    client_name: str | None
    created_at: datetime
    updated_at: datetime
    duration_seconds: float | None
    language: str | None
    original_filename: str
    size_bytes: int
    tags: list[TagOut]
    segments: list[TranscriptSegmentOut]
    insights: list[InsightOut]
    analysis: AnalysisOut | None
    error_message: str | None
    sentiment_score: float | None = None
    participants: list[ParticipantOut] = []


class CallStatusOut(BaseModel):
    status: str
    progress_step: int
    error_message: str | None
    size_bytes: int
    duration_seconds: float | None
    transcription_ratio: float | None
