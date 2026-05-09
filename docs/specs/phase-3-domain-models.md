# Phase 3 Technical Specification — Domain Models, Schemas, and Provider Abstractions

## Current Status

**All tasks are implemented (`[x]`).** One DoD item remains open:

> `alembic upgrade head` creates every table; `alembic downgrade base` reverses cleanly.

The agent's primary task is to run this verification against the compose `db` service and mark the DoD `[x]`. The rest of this spec documents the completed implementation for architect review.

---

## Goal (original)

Define every SQLAlchemy ORM model, Pydantic v2 request/response schema, LLM structured-output schema,
and provider Protocol/implementation needed by Phases 4 and 5. This phase creates the type backbone
the rest of the backend depends on; no business logic is implemented here.

## Existing Foundation (from Phase 1)

- `app/core/db.py` — `Base(DeclarativeBase)`, `async_session_maker`, `get_session`
- `app/core/config.py` — `Settings` with all env vars including per-stage `LLM_MODEL_*` and `STT_MODEL`
- `app/core/errors.py` — `DomainError` + handlers already wired in `main.py`
- `alembic/env.py` — wired to `Base.metadata`; `alembic/versions/` is empty

## File Layout

```
backend/app/
  models/
    __init__.py          # re-exports all models so alembic sees them
    client.py
    call.py
    transcript.py
    analysis.py
    tag.py
    insight.py
  schemas/
    __init__.py
    call.py
    client.py
    tag.py
    dashboard.py
    common.py            # ErrorDetail, ErrorResponse, PaginatedResponse
  providers/
    __init__.py
    base.py              # STTProvider + LLMProvider Protocols + dataclasses
    openai_stt.py
    openai_llm.py
    dependencies.py      # FastAPI Depends factories
  llm/
    __init__.py
    schemas/
      __init__.py
      mood.py
      tags.py
      insights.py
      synthesis.py
backend/alembic/versions/
  0001_initial_schema.py
backend/tests/
  providers/
    test_openai_providers.py
```

## Data Structures

### 1. SQLAlchemy Models (`app/models/`)

All models inherit from `Base` (imported from `app.core.db`). Use `Mapped[T]` + `mapped_column`
(SA 2.0 style). Timestamps use `server_default=func.now()`.

Table name convention: plural snake_case (`clients`, `calls`, `transcripts`, `transcript_segments`,
`analyses`, `tags`, `call_tags`, `insights`, `action_items`).

#### `Client` (`__tablename__ = "clients"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
name: Mapped[str] = mapped_column(String(255), nullable=False)
industry: Mapped[str | None] = mapped_column(String(100))
owner: Mapped[str | None] = mapped_column(String(255))
created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# relationships
calls: Mapped[list["Call"]] = relationship(back_populates="client", passive_deletes=True)
```

#### `Call` (`__tablename__ = "calls"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
client_id: Mapped[int | None] = mapped_column(
    ForeignKey("clients.id", ondelete="SET NULL"), index=True
)
title: Mapped[str] = mapped_column(String(500), nullable=False)
filename: Mapped[str] = mapped_column(String(500), nullable=False)
# stored at: Path(settings.AUDIO_STORAGE_DIR) / filename
original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
content_type: Mapped[str] = mapped_column(String(100), nullable=False)
size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
duration_seconds: Mapped[float | None] = mapped_column(Float)
status: Mapped[str] = mapped_column(
    Enum("pending","transcribing","analyzing","done","failed",
         name="callstatus", native_enum=False, length=20),
    nullable=False,
    default="pending",
    index=True,
)
error_message: Mapped[str | None] = mapped_column(Text)
language: Mapped[str | None] = mapped_column(String(10))
content_sha256: Mapped[str | None] = mapped_column(String(64), index=True)  # dedup/idempotency
celery_task_id: Mapped[str | None] = mapped_column(String(255), index=True)
created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

# relationships
client: Mapped["Client | None"] = relationship(back_populates="calls")
transcript: Mapped["Transcript | None"] = relationship(back_populates="call",
    cascade="all, delete-orphan")
analysis: Mapped["Analysis | None"] = relationship(back_populates="call",
    cascade="all, delete-orphan")
call_tags: Mapped[list["CallTag"]] = relationship(back_populates="call",
    cascade="all, delete-orphan")
tags: Mapped[list["Tag"]] = relationship(
    secondary="call_tags", viewonly=True,
    primaryjoin="Call.id == CallTag.call_id",
    secondaryjoin="CallTag.tag_id == Tag.id",
)
insights: Mapped[list["Insight"]] = relationship(back_populates="call",
    cascade="all, delete-orphan")
action_items: Mapped[list["ActionItem"]] = relationship(back_populates="call",
    cascade="all, delete-orphan")
```

`CallStatus` is a Python `enum.Enum(str, Enum)` with values `pending | transcribing | analyzing | done | failed`.
Stored as `Enum(..., native_enum=False, length=20)` — avoids `ALTER TYPE` migration pain when adding values.
Python validates at write time; the ORM column double-checks via the allowed-values list.

**Audio path resolution**: `Path(settings.AUDIO_STORAGE_DIR) / call.filename` — Phase 4 must use this
exact pattern to locate files. `filename` is a UUID-based name assigned at upload, not the original.

**`Call.tags` viewonly proxy**: This is the readable path for schema assembly. To mutate tags, go through
`CallTag` directly (Phase 5 `PATCH /api/calls/{id}/tags` does a delete-and-reinsert on `call_tags`).

#### `Transcript` (`__tablename__ = "transcripts"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
call_id: Mapped[int] = mapped_column(
    ForeignKey("calls.id", ondelete="CASCADE"), unique=True
)
language: Mapped[str | None] = mapped_column(String(10))
raw_payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# relationships
call: Mapped["Call"] = relationship(back_populates="transcript")
segments: Mapped[list["TranscriptSegment"]] = relationship(
    back_populates="transcript", cascade="all, delete-orphan",
    order_by="TranscriptSegment.idx"
)
```

#### `TranscriptSegment` (`__tablename__ = "transcript_segments"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
transcript_id: Mapped[int] = mapped_column(
    ForeignKey("transcripts.id", ondelete="CASCADE")
)
idx: Mapped[int] = mapped_column(Integer, nullable=False)
start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
speaker_label: Mapped[str] = mapped_column(String(100), nullable=False)
speaker_role: Mapped[str | None] = mapped_column(String(50))  # "rep" | "client" | None
text: Mapped[str] = mapped_column(Text, nullable=False)
mood: Mapped[str | None] = mapped_column(String(50))

# relationships
transcript: Mapped["Transcript"] = relationship(back_populates="segments")

# indexes
__table_args__ = (Index("ix_segment_transcript_idx", "transcript_id", "idx"),)
```

#### `Analysis` (`__tablename__ = "analyses"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
call_id: Mapped[int] = mapped_column(
    ForeignKey("calls.id", ondelete="CASCADE"), unique=True
)
summary: Mapped[str] = mapped_column(Text, nullable=False)
headline: Mapped[str] = mapped_column(String(500), nullable=False)
overall_sentiment: Mapped[str] = mapped_column(String(50), nullable=False)
talk_ratio_rep: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
talk_ratio_client: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
llm_model_used: Mapped[str] = mapped_column(String(100), nullable=False)
prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
cost_usd_breakdown: Mapped[dict] = mapped_column(
    JSONB, nullable=False, default=lambda: {}
)
# shape: {"stt": 0.004, "mood": 0.001, "tags": 0.001, "insights": 0.002, "synthesis": 0.002}
cost_usd_total: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False, default=0.0)
created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# relationships
call: Mapped["Call"] = relationship(back_populates="analysis")
```

#### `Tag` (`__tablename__ = "tags"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
# name must be stored lower-cased — enforce at write time in service layer, not DB constraint
color: Mapped[str] = mapped_column(String(50), nullable=False, default="#6b7280")
is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

#### `CallTag` (`__tablename__ = "call_tags"`)
```python
call_id: Mapped[int] = mapped_column(
    ForeignKey("calls.id", ondelete="CASCADE"), primary_key=True
)
tag_id: Mapped[int] = mapped_column(
    ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
)
source: Mapped[str] = mapped_column(String(10), nullable=False)
# "llm" = LLM-assigned, "user" = user-assigned or user-overridden
# Override semantics: PATCH /api/calls/{id}/tags deletes all rows for the call
# and reinserts with source="user". There is no "llm-overridden" state; the
# tag list is authoritative after override, regardless of origin.

# relationships
call: Mapped["Call"] = relationship(back_populates="call_tags")
tag: Mapped["Tag"] = relationship()

# extra index for reverse lookup (tag_id is second in PK, so needs its own index)
__table_args__ = (Index("ix_call_tag_tag_id", "tag_id"),)
```

#### `Insight` (`__tablename__ = "insights"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
call_id: Mapped[int] = mapped_column(
    ForeignKey("calls.id", ondelete="CASCADE"), index=True
)
kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
# validated at LLM-schema boundary via Literal[...], not CHECK constraint
text: Mapped[str] = mapped_column(Text, nullable=False)
segment_idx: Mapped[int | None] = mapped_column(Integer)
weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

# relationships
call: Mapped["Call"] = relationship(back_populates="insights")
```

#### `ActionItem` (`__tablename__ = "action_items"`)
```python
id: Mapped[int] = mapped_column(primary_key=True)
call_id: Mapped[int] = mapped_column(
    ForeignKey("calls.id", ondelete="CASCADE"), index=True
)
text: Mapped[str] = mapped_column(Text, nullable=False)
owner: Mapped[str | None] = mapped_column(String(255))
due_date: Mapped[date | None] = mapped_column(Date)
done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

# relationships
call: Mapped["Call"] = relationship(back_populates="action_items")
```

### 2. Pydantic v2 Schemas (`app/schemas/`)

All response schemas: `model_config = ConfigDict(from_attributes=True)`.

**`common.py`**
```python
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict | None = None

class ErrorResponse(BaseModel):
    error: ErrorDetail

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
```

**`tag.py`**
```python
class TagOut(BaseModel):
    id: int
    name: str
    color: str
    is_system: bool
    source: str | None = None   # populated when emitted from CallTag join
```

**`call.py`**
```python
class CallCreate(BaseModel):
    client_id: int | None = None
    title: str | None = None   # defaults to original_filename if omitted

class CallSummary(BaseModel):
    id: int
    title: str
    status: str
    client_id: int | None
    client_name: str | None    # from joined Client.name; populated by service layer
    created_at: datetime
    duration_seconds: float | None
    tags: list[TagOut]         # assembled from Call.call_tags in service layer
    cost_usd_total: float | None  # from Analysis if status==done

class TranscriptSegmentOut(BaseModel):
    idx: int
    start_seconds: float
    end_seconds: float
    speaker_label: str
    speaker_role: str | None
    text: str
    mood: str | None

class InsightOut(BaseModel):
    id: int
    kind: str
    text: str
    segment_idx: int | None
    weight: float

class ActionItemOut(BaseModel):
    id: int
    text: str
    owner: str | None
    due_date: date | None
    done: bool

class CostBreakdown(BaseModel):
    stt: float = 0.0
    mood: float = 0.0
    tags: float = 0.0
    insights: float = 0.0
    synthesis: float = 0.0

class AnalysisOut(BaseModel):
    summary: str
    headline: str
    overall_sentiment: str
    talk_ratio_rep: float
    talk_ratio_client: float
    llm_model_used: str
    cost_usd_breakdown: CostBreakdown
    cost_usd_total: float

class CallDetail(BaseModel):
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
    progress_step: int   # mapping: pending=1, transcribing=2, analyzing=3, done=5, failed=0
    error_message: str | None

class CallUpdate(BaseModel):
    client_id: int | None = None
    title: str | None = None

class TagOverrideRequest(BaseModel):
    tag_ids: list[int]
```

**`client.py`**
```python
class ClientCreate(BaseModel):
    name: str
    industry: str | None = None
    owner: str | None = None

class ClientOut(BaseModel):
    id: int
    name: str
    industry: str | None
    owner: str | None
    created_at: datetime
    calls: int = 0
    last_call: datetime | None = None
    sentiment: str | None = None   # computed by service layer
```

**`dashboard.py`**
```python
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
    conversion_rate: KPIItem
    talk_listen_ratio: KPIItem
    sentiment_trend: list[SentimentPoint]
    calls_per_day: list[DailyCallsPoint]
    pipeline: list[PipelineStage]
    top_pain_points: list[TopPainPoint]
```

**Note on `from_attributes` and eager loading**: `CallDetail` assembles `segments`, `insights`,
`action_items`, and `analysis` from relationships. The Phase 5 service layer **must** eager-load
these with `selectinload` to avoid N+1 queries. The schemas themselves are assembled from ORM objects
in the service layer, not via `model_validate` directly on `Call` — this gives explicit control.

### 3. LLM Structured-Output Schemas (`app/llm/schemas/`)

All schemas use `model_config = ConfigDict(extra="forbid")` so OpenAI strict mode gets
`additionalProperties: false` in the generated JSON schema. All fields are either required
or `... | None` with no defaults — required by OpenAI strict json_schema.

Use `Literal[...]` for every closed-set string field so the generated JSON schema includes an `enum`
and OpenAI rejects invalid values server-side.

**`mood.py`**
```python
MOOD_VERSION = "v1"

MoodValue = Literal["positive", "neutral", "negative", "frustrated", "enthusiastic", "confused", "concerned"]

class SegmentMood(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idx: int = Field(description="Segment index from input")
    mood: MoodValue = Field(description="Emotional tone of this segment")

class MoodLabels(BaseModel):
    model_config = ConfigDict(extra="forbid")
    segments: list[SegmentMood]
```

**`tags.py`**
```python
TAGS_VERSION = "v1"

class TagSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = Field(description="1-5 tags from the taxonomy. Use exact lower-cased taxonomy names.")
```

**`insights.py`**
```python
INSIGHTS_VERSION = "v1"

InsightKind = Literal["pain-point", "objection", "buying-signal", "feature-req",
                      "competitor", "pricing", "next-step", "quote", "risk", "highlight"]

class ExtractedInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: InsightKind
    text: str = Field(description="Verbatim or close paraphrase from transcript")
    segment_idx: int | None = Field(description="Index of the most relevant segment, or null")
    weight: float = Field(description="Importance 0.0–2.0")

class ExtractedActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    owner: str | None = Field(description="Person responsible, or null if unclear")
    due_date: str | None = Field(description="ISO date string (YYYY-MM-DD) if mentioned, else null")
    # Service layer parses due_date to date; unparseable values silently become None

class InsightExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    insights: list[ExtractedInsight]
    action_items: list[ExtractedActionItem]
```

**`synthesis.py`**
```python
SYNTHESIS_VERSION = "v1"

SentimentValue = Literal["positive", "neutral", "negative"]

class Synthesis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    headline: str = Field(description="One-sentence summary, max 100 chars")
    summary: str = Field(description="3–5 sentence executive summary of the call")
    overall_sentiment: SentimentValue
```

### 4. Provider Protocols (`app/providers/`)

**`base.py`**
```python
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

@dataclass
class DiarizedSegment:
    speaker: str   # "A", "B", etc. from OpenAI response
    start: float
    end: float
    text: str

@dataclass
class DiarizedTranscript:
    segments: list[DiarizedSegment]
    language: str | None
    raw_payload: dict

@dataclass
class LLMUsage:
    prompt_tokens: int
    completion_tokens: int
    model: str
    cost_usd: float   # computed by provider from pricing table

@dataclass
class LLMResult:
    parsed: BaseModel
    usage: LLMUsage

@runtime_checkable
class STTProvider(Protocol):
    async def transcribe(self, audio_path: Path, language: str | None = None) -> DiarizedTranscript: ...

@runtime_checkable
class LLMProvider(Protocol):
    async def complete_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        model: str,
        system_prompt: str | None = None,
    ) -> LLMResult: ...
```

`LLMResult` carries usage alongside the parsed model — no mutable state on the provider instance.
This is safe across concurrent Celery workers sharing a process-level singleton.

**`openai_stt.py`** — `OpenAISTT`:
- Constructor: `__init__(self, client: openai.AsyncOpenAI, model: str)`
- Calls `client.audio.transcriptions.create(model=self.model, response_format="diarized_json")`
- Response fields: `segments[].speaker`, `.start`, `.end`, `.text`
- Computes `cost_usd` from `LLM_PRICING["gpt-4o-transcribe-diarize"]` (per-minute constant, derived from `duration_seconds`)
- Returns `DiarizedTranscript`

**`openai_llm.py`** — `OpenAILLM`:
- Constructor: `__init__(self, client: openai.AsyncOpenAI)`
- Uses `client.chat.completions.parse(model=model, messages=[...], response_format=schema)` — the SDK
  handles schema generation, JSON extraction, and validation automatically
- Returns `LLMResult(parsed=result.choices[0].message.parsed, usage=LLMUsage(...))`
- Pricing table: `MODEL_PRICING: dict[str, tuple[float, float]]` — `(input_cost_per_1k, output_cost_per_1k)`

**`dependencies.py`**:
```python
from functools import lru_cache
import openai
from app.core.config import settings
from app.providers.openai_stt import OpenAISTT
from app.providers.openai_llm import OpenAILLM

@lru_cache(maxsize=1)
def _openai_client() -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

def get_stt_provider() -> STTProvider:
    return OpenAISTT(client=_openai_client(), model=settings.STT_MODEL)

def get_llm_provider() -> LLMProvider:
    return OpenAILLM(client=_openai_client())
```

**Celery lifecycle note**: `_openai_client()` is `lru_cache`-cached per process. Celery prefork
workers are separate processes so each gets its own client — safe. The `AsyncOpenAI` client's
`httpx.AsyncClient` binds to the first event loop that uses it. In Celery tasks, always call async
provider methods from within a single `asyncio.run()` call per task; never share a client across
multiple event-loop invocations in the same process (e.g., avoid `gevent` pool with this pattern).

## Alembic Migration

Generate with `alembic revision --autogenerate -m "initial_schema"`. Review to confirm:
- `JSONB` columns (not `JSON`) — autogenerate picks this up from import of `JSONB` in models
- `Enum(native_enum=False)` renders as `VARCHAR(20)` with a server CHECK — verify in generated file
- `Numeric(5,4)` for ratios, `Numeric(10,6)` for cost
- `BigInteger` for `size_bytes`
- All indexes present
- `downgrade()` drops tables in reverse dependency order

## Implementation Steps (Remaining — Migration Verification)

All code is done. The only remaining step is migration verification:

1. Start the compose `db` service if not already running:
   ```bash
   docker compose up -d db
   ```
2. Run `alembic upgrade head` from `backend/` with the compose DB URL.
3. Verify all 9 expected tables exist (`clients`, `calls`, `tags`, `call_tags`, `transcripts`, `transcript_segments`, `analyses`, `insights`, `action_items`).
4. Run `alembic downgrade base` — confirm clean teardown.
5. Re-run `alembic upgrade head` to confirm idempotency.
6. Mark the DoD item `[x]` in `docs/mvp/prd.md`.

## Testing Plan

**`backend/tests/providers/test_openai_providers.py`**

```python
class FakeParsedCompletion:
    # mimics openai.types.chat.ParsedChatCompletion
    ...

class FakeAudioTranscription:
    # mimics diarized_json response
    segments = [{"speaker": "A", "start": 0.0, "end": 2.5, "text": "Hello"}]

class FakeOpenAIClient:
    # inject into OpenAISTT and OpenAILLM constructors
    ...
```

Tests:
- `test_openai_stt_returns_diarized_transcript` — assert `DiarizedTranscript.segments` populated, speaker mapped
- `test_openai_llm_returns_typed_model` — call with `MoodLabels` schema, assert `LLMResult.parsed` is `MoodLabels`
- `test_openai_llm_returns_usage` — assert `LLMResult.usage.cost_usd > 0`
- `test_openai_llm_raises_on_refusal` — fake returns `.refusal` field, assert `DomainError` raised
