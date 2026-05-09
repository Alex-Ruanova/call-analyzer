from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.call import CallSummary


class ClientCreate(BaseModel):
    name: str
    industry: str | None = None
    owner: str | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    industry: str | None
    owner: str | None
    created_at: datetime
    calls: int = 0
    last_call: datetime | None = None
    sentiment: str | None = None
    sentiment_score: float | None = None


class ClientDetail(ClientOut):
    recent_calls: list[CallSummary] = []
