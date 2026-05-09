from pydantic import BaseModel


class KPIItem(BaseModel):
    value: float | int
    delta: float | None = None


class SentimentPoint(BaseModel):
    week: str
    positive: int
    neutral: int
    negative: int


class DailyCallsPoint(BaseModel):
    date: str
    count: int


class PipelineStage(BaseModel):
    stage: str
    count: int


class TopPainPoint(BaseModel):
    text: str
    count: int
    weight: float


class DashboardOut(BaseModel):
    calls_this_week: KPIItem
    avg_sentiment: KPIItem
    total_cost_usd: KPIItem
    talk_listen_ratio: KPIItem
    sentiment_trend: list[SentimentPoint]
    calls_per_day: list[DailyCallsPoint]
    pipeline: list[PipelineStage]
    top_pain_points: list[TopPainPoint]
