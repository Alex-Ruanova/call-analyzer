# Phase 4 Technical Specification — Analysis Pipeline

## Goal

Implement the end-to-end async pipeline that processes a sales call from audio file to structured insights. The entry point is `process_call(call_id)` — a single Celery task that runs STT, mood, tagging, insight extraction, and synthesis stages sequentially, tracking cost across all calls to OpenAI.

---

## Existing Infrastructure (from Phases 1–3)

- **Celery app:** `backend/app/celery_app.py` — `celery_app` singleton, autodiscovery of `app.tasks`, worker concurrency=4.
- **DB session factory:** `backend/app/core/db.py` — `async_session_maker`.
- **Models:** `Call`, `Transcript`, `TranscriptSegment`, `Analysis`, `Tag`, `CallTag`, `Insight`, `ActionItem` — all exist with correct columns including `Analysis.cost_usd_breakdown` (JSONB) and `Analysis.cost_usd_total`.
- **Providers:**
  - `STTProvider` Protocol, impl `OpenAISTT` — returns `STTResult(transcript: DiarizedTranscript, usage: LLMUsage)`.
  - `LLMProvider` Protocol, impl `OpenAILLM` — returns `LLMResult(parsed: BaseModel, usage: LLMUsage)`.
  - DI factories in `app/providers/dependencies.py`: `get_stt_provider()`, `get_llm_provider()`.
- **LLM schemas:** `MoodLabels`, `TagSuggestion`, `InsightExtraction`, `Synthesis` — all in `app/llm/schemas/`.
- **Settings:** `LLM_MODEL_TAGGING`, `LLM_MODEL_MOOD`, `LLM_MODEL_INSIGHTS`, `LLM_MODEL_SYNTHESIS`, `STT_MODEL` from `app/core/config.py`.
- **Error class:** `DomainError(code, message, status_code)`.
- **Call.status** enum values: `pending | transcribing | analyzing | done | failed`.

---

## Files to Create

```
backend/app/tasks/process_call.py    # Celery task entry + stage orchestration
backend/app/llm/prompts/__init__.py
backend/app/llm/prompts/mood.py
backend/app/llm/prompts/tags.py
backend/app/llm/prompts/insights.py
backend/app/llm/prompts/synthesis.py
backend/app/services/pipeline.py     # Stage functions (pure async, no Celery coupling)
backend/tests/test_pipeline.py       # End-to-end integration tests with fakes
```

---

## Data Flow

```
process_call(call_id)
  │  status → transcribing
  ├─ transcribe_stage(call, session, stt) → Transcript (persisted)
  │    ├─ chunk audio if > 24 MB (ffmpeg silencedetect)
  │    ├─ STTProvider.transcribe() per chunk (bounded asyncio concurrency)
  │    ├─ stitch segments (offset timestamps)
  │    └─ LLM speaker re-anchoring pass (if >1 chunk)
  │  status → analyzing
  ├─ mood_stage(transcript, session, llm) → updates TranscriptSegment.mood
  ├─ tag_stage(transcript, session, llm) → persists CallTag rows (source="llm")
  ├─ insight_stage(transcript, session, llm) → persists Insight + ActionItem rows
  └─ synthesis_stage(transcript, insights, session, llm) → persists Analysis
  │  status → done (or failed with error_message)
```

---

## Implementation Details

### `app/tasks/process_call.py`

```python
@celery_app.task(
    bind=True,
    name="app.tasks.process_call",
    max_retries=3,
    default_retry_delay=30,
)
def process_call(self, call_id: int) -> None:
    asyncio.run(_run(self, call_id))
```

Key contract:
- Wraps `_run()` which opens a single `async_session_maker()` session for the whole pipeline.
- Sets `Call.status = "transcribing"` before STT, `"analyzing"` before LLM stages.
- On `OpenAIBadRequest` / `DomainError(code="llm_*")` / `DomainError(code="stt_*")` → set `status="failed"`, `error_message=str(exc)`, **do not retry**.
- On infrastructure errors (Redis dropped, `asyncpg.exceptions.*`, `celery.exceptions.*`) → `self.retry(exc=exc)` — up to `max_retries`.
- Never swallow silently — every branch either flips status or re-raises.
- After status flip, always `await session.commit()` before the next stage so the frontend's polling endpoint sees real-time progress.

### `app/services/pipeline.py`

Five async stage functions. Each takes `(session: AsyncSession, ...)` and the appropriate provider:

#### `transcribe_stage(call, session, stt_provider) -> Transcript`

1. `audio_path = Path(settings.AUDIO_STORAGE_DIR) / call.filename`
2. If `audio_path.stat().st_size > 24 * 1024 * 1024`: chunk with ffmpeg.
   - Command: `ffmpeg -i <path> -af silencedetect=noise=-30dB:d=0.5 -f null -` to detect silence boundaries.
   - Parse stderr for `silence_end` timestamps; build chunk intervals of ≤10 min / ≤24 MB.
   - Split each chunk: `ffmpeg -ss <start> -to <end> -i <input> -c copy <chunk_path>`
   - Chunks written to a `tempfile.TemporaryDirectory()` — cleaned up via `finally`.
3. For single file: call `await stt_provider.transcribe(audio_path, call.language)`.
4. For multiple chunks: `asyncio.gather(*[stt_provider.transcribe(c, call.language) for c in chunks], ...)` with `asyncio.Semaphore(3)` for bounded concurrency.
5. Stitch: for each chunk beyond the first, offset all `DiarizedSegment.start/end` by the chunk's start second in the original file.
6. Speaker re-anchoring (when >1 chunk): single LLM call with `LLMProvider.complete_structured()` — prompt takes first 30s of each chunk, returns a JSON mapping `{chunk_idx: {SPEAKER_00: "A", SPEAKER_01: "B"}}`. Apply the mapping to canonicalize labels across chunks.
7. Persist `Transcript(call_id, language, raw_payload_json=combined_raw)`.
8. Persist `TranscriptSegment` rows (idx, start, end, speaker_label, text) — speaker_role left None here, set later if needed.
9. Update `call.duration_seconds` from transcript if not already set.
10. Accumulate `usage.cost_usd` → return alongside `Transcript` for cost tracking.

#### `mood_stage(transcript, session, llm_provider) -> LLMUsage`

- Load all `TranscriptSegment` rows for the transcript.
- Batch in groups of 20 segments.
- For each batch: call `llm_provider.complete_structured(prompt, MoodLabels, settings.LLM_MODEL_MOOD)`.
- Prompt: system = brief role, user = numbered segment texts formatted as `[{idx}] {text}`.
- Map `MoodLabels.segments[i].mood` back by `idx`, update `TranscriptSegment.mood`.
- Commit after all batches.
- Return cumulative `LLMUsage`.

#### `tag_stage(transcript, session, llm_provider) -> LLMUsage`

- Build full transcript text (all segments concatenated, truncated to 6000 tokens max).
- Call `llm_provider.complete_structured(prompt, TagSuggestion, settings.LLM_MODEL_TAGGING)`.
- For each tag name in `TagSuggestion.tags`:
  - `SELECT Tag WHERE name = tag_name` — create if not found (is_system=False).
  - Upsert `CallTag(call_id, tag_id, source="llm")` — use INSERT ... ON CONFLICT DO NOTHING.
- Commit.

#### `insight_stage(transcript, session, llm_provider) -> LLMUsage`

- Build transcript text (same truncation).
- Call `llm_provider.complete_structured(prompt, InsightExtraction, settings.LLM_MODEL_INSIGHTS)`.
- Persist `Insight` rows from `InsightExtraction.insights`.
- For `ActionItem` rows: parse `due_date` string → `date` if present (catch parse errors, set None).
- Commit.

#### `synthesis_stage(transcript, insights, session, llm_provider) -> tuple[Analysis, LLMUsage]`

- Build transcript text + insight summaries as context.
- Call `llm_provider.complete_structured(prompt, Synthesis, settings.LLM_MODEL_SYNTHESIS)`.
- Compute talk ratios from segment durations:
  - Group segments by speaker_label. Sum durations per speaker.
  - Assign `talk_ratio_rep` = rep's share, `talk_ratio_client` = client's share.
  - Heuristic for which speaker is rep: speaker with more total talk time is assumed rep.
- `llm_model_used = settings.LLM_MODEL_SYNTHESIS`.
- `prompt_version = SYNTHESIS_VERSION` from `app/llm/schemas/synthesis.py`.

### Cost aggregation

In `process_call._run()`, maintain a `cost: dict[str, float]` = `{stt, mood, tags, insights, synthesis}`. Include the speaker re-anchoring LLM call cost under `stt` (it is part of transcription). Each stage returns an `LLMUsage`; accumulate `.cost_usd`. After synthesis_stage, persist on `Analysis`:

```python
cost_total = float(sum(cost.values()))
analysis.cost_usd_breakdown = cost   # stored as JSONB dict[str, float]
analysis.cost_usd_total = cost_total
```

After committing `Analysis`, write to Redis for the budget circuit breaker:
```python
spend_key = f"spend:{date.today().isoformat()}"
await redis.incrbyfloat(spend_key, cost_total)
await redis.expire(spend_key, 60 * 60 * 48)  # 48h retention
```

The `redis` client must be created inside `_run()` (not at module level) to avoid asyncio event-loop reuse issues across Celery tasks (see §Celery + asyncio below).

### Celery + asyncio + asyncpg (critical)

`asyncio.run(_run(...))` is used because Celery's default prefork pool gives each task a fresh call stack with no running event loop — this is safe. However, asyncpg connection pools hold connections bound to their creation loop. If the engine is created at module import time, the second task in the same worker process will fail with `Event loop is closed`.

**Mandate `NullPool` for the worker engine.** Create a fresh engine per task:

```python
async def _run(self, call_id: int) -> None:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        ...
    finally:
        await engine.dispose()
```

Also pin `worker_pool = "prefork"` in `celery_app.config_from_object()` to prevent accidental use of gevent/eventlet pools (which conflict with `asyncio.run`).

Set `worker_max_tasks_per_child = 50` to bound any resource leakage.

The `RedisBucket` and budget Redis client must also be instantiated inside `_run()` per task (not at module level) for the same reason.

### Session management

One `AsyncSession` per stage, not one session for the whole pipeline. Open, commit, close per stage so that:
1. The frontend's polling endpoint sees status updates immediately.
2. Long-held transactions don't block Postgres VACUUM.

```python
async with async_session() as session:
    transcript = await transcribe_stage(call_id, session, stt_provider)
# session closed

async with async_session() as session:
    await mood_stage(transcript.id, session, llm_provider)
# etc.
```

### Retry logic

```python
INFRA_ERRORS = (
    OSError,
    asyncpg.exceptions.PostgresConnectionError,
    redis.exceptions.ConnectionError,
)

try:
    ...
except (DomainError,) as exc:
    call.status = "failed"
    call.error_message = f"{exc.code}: {exc.message}"
    await session.commit()
    return          # no retry
except INFRA_ERRORS as exc:
    call.status = "failed"
    call.error_message = str(exc)
    await session.commit()
    raise self.retry(exc=exc)
```

### Redis key namespace

All Phase 4 Redis keys use distinct prefixes to avoid collision with Celery internals and Phase 5 keys:

```
bucket:openai:tokens   → RedisBucket (token count)
bucket:openai:ts       → RedisBucket (last refill timestamp)
spend:{YYYY-MM-DD}     → budget accumulator (written here, read by Phase 5 BudgetGuard)
celery*, _kombu*       → Celery internals (never touch)
ratelimit:*            → Phase 5 per-IP rate limiter (never touch from Phase 4)
```

### Redis token bucket (rate limiting)

Implemented as a class `RedisBucket` in `app/services/pipeline.py` or `app/core/rate_limit.py`:

```python
class RedisBucket:
    """Token bucket keyed on a Redis key, shared across all worker processes."""
    def __init__(self, redis_url: str, key: str, capacity: int, refill_per_sec: float): ...
    async def acquire(self, tokens: int = 1) -> None:
        """Blocks until tokens are available. Uses EVALSHA Lua script for atomicity."""
```

The provider classes don't need to know about it — wrap the `stt_provider.transcribe()` and `llm_provider.complete_structured()` calls in `process_call._run()` with a module-level `RedisBucket(capacity=50, refill_per_sec=10)` for OpenAI calls. This caps total in-flight calls across all worker processes.

---

## Prompts (`app/llm/prompts/`)

### `mood.py`

```python
PROMPT_VERSION = "v1"

def build_prompt(segments: list[dict]) -> str:
    lines = "\n".join(f"[{s['idx']}] {s['text']}" for s in segments)
    return (
        "You are analyzing sales call segments for emotional tone.\n"
        "Return mood for each segment index. Valid moods: "
        "positive, neutral, negative, frustrated, enthusiastic, confused, concerned.\n\n"
        f"{lines}"
    )
```

### `tags.py`

Tag taxonomy (15 system tags, chosen to cover sales call lifecycle):
`discovery, demo, objection-handling, pricing-discussion, competitive-mention, technical-deep-dive, follow-up-agreed, contract-discussion, escalation, positive-outcome, lost-deal, feature-request, onboarding, renewal, stakeholder-intro`

```python
PROMPT_VERSION = "v1"
TAG_TAXONOMY = [...]

def build_prompt(transcript_text: str) -> str:
    tags_str = ", ".join(TAG_TAXONOMY)
    return (
        f"Taxonomy: {tags_str}\n\n"
        "Select 1–5 tags that best describe this sales call. Use exact taxonomy names.\n\n"
        f"Transcript:\n{transcript_text}"
    )
```

### `insights.py`

```python
PROMPT_VERSION = "v1"

def build_prompt(transcript_text: str) -> str:
    return (
        "Extract structured insights from this sales call transcript.\n"
        "Types: pain-point, objection, buying-signal, feature-req, competitor, "
        "pricing, next-step, quote, risk, highlight.\n"
        "Also extract explicit action items (who, what, when if stated).\n"
        "Weight importance 0.0–2.0. Include segment_idx if mappable.\n\n"
        f"Transcript:\n{transcript_text}"
    )
```

### `synthesis.py`

```python
PROMPT_VERSION = "v1"

def build_prompt(transcript_text: str, insight_summary: str) -> str:
    return (
        "Write an executive summary of this sales call.\n"
        "headline: one sentence max 100 chars.\n"
        "summary: 3–5 sentences covering outcome, key concerns, and next steps.\n"
        "overall_sentiment: positive | neutral | negative.\n\n"
        f"Key insights:\n{insight_summary}\n\n"
        f"Transcript:\n{transcript_text}"
    )
```

---

## Testing Plan

### `backend/tests/test_pipeline.py`

**Test 1: Happy path end-to-end**

```python
class FakeSTTProvider:
    async def transcribe(self, path, language=None) -> STTResult:
        return STTResult(
            transcript=DiarizedTranscript(
                segments=[
                    DiarizedSegment(speaker="A", start=0.0, end=5.0, text="Hello, how are you?"),
                    DiarizedSegment(speaker="B", start=5.0, end=12.0, text="I am interested in your product."),
                ],
                language="en",
                raw_payload={"segments": []},
                duration_seconds=12.0,
            ),
            usage=LLMUsage(prompt_tokens=0, completion_tokens=0, model="fake-stt", cost_usd=0.001),
        )

class FakeLLMProvider:
    async def complete_structured(self, prompt, schema, model, system_prompt=None) -> LLMResult:
        # Return valid minimal instances per schema type
        ...
```

Assert after `asyncio.run(_run_pipeline(call_id, session, fake_stt, fake_llm))`:
- `call.status == "done"`
- `transcript` row exists with 2 segments
- At least one `CallTag` row persists
- At least one `Insight` row persists
- `Analysis` row exists with `cost_usd_total > 0`
- `Analysis.llm_model_used == settings.LLM_MODEL_SYNTHESIS`

**Test 2: STT failure → failed status**

FakeSTTProvider raises `DomainError(code="stt_error", ...)`. Assert:
- `call.status == "failed"`
- `call.error_message` is not empty
- No `Transcript` row in DB.

**Test 3: LLM model env override**

Set `LLM_MODEL_TAGGING = "gpt-4.1-mini"` via monkeypatch. Run happy-path. Assert `Analysis.llm_model_used` reflects the synthesis model (still `LLM_MODEL_SYNTHESIS`), and tag stage was called with `"gpt-4.1-mini"` (capture via a spy on FakeLLMProvider).

---

## Edge Cases

- Audio file doesn't exist at `AUDIO_STORAGE_DIR/call.filename` → `FileNotFoundError` → maps to `DomainError`, status=failed.
- Transcript has 0 segments (empty audio) → mood/tag/insight stages skip gracefully, synthesis still produces summary.
- LLM returns empty tag list → no CallTag rows created, task continues.
- Duplicate tag name on upsert → INSERT ON CONFLICT DO NOTHING.
- `due_date` parse failure → `ActionItem.due_date = None`, no exception raised.
- Worker killed mid-task (SIGKILL) → Celery marks task as `REVOKED`; `Call.status` stays `transcribing` — the API's status endpoint returns this intermediate state. A manual retry or admin reset is required (acceptable for MVP).
