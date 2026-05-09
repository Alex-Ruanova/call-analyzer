from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.tag import TagOut


class CallCreate(BaseModel):
    client_id: int | None = None
    title: str | None = None


class CallUpdate(BaseModel):
    client_id: int | None = None
    title: str | None = None


class TagOverrideRequest(BaseModel):
    tag_ids: list[int]


class TranscriptSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idx: int
    start_seconds: float
    end_seconds: float
    speaker_label: str
    speaker_role: str | None
    text: str
    mood: str | None


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    text: str
    segment_idx: int | None
    weight: float


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    owner: str | None
    due_date: date | None
    done: bool


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
    action_items: list[ActionItemOut]
    analysis: AnalysisOut | None
    error_message: str | None


class CallStatusOut(BaseModel):
    status: str
    progress_step: int
    error_message: str | None
