from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class NoteUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    call_id: int
    text: str
    created_at: datetime
    updated_at: datetime
