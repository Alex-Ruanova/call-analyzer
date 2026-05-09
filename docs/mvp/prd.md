# Call Analyzer — MVP

## Overview

Altur is a sales-call intelligence app: users upload sales-call recordings (MP3 / WAV, up to 30 minutes, batches up to ~1k), the backend transcribes with diarization, the LLM extracts structured insights (summary, tags, mood per segment, action items, pain points, buying signals), and the existing React frontend renders dashboard / list / detail / clients screens against the data.

The frontend already exists as Babel-standalone React with mocked `window.ALTUR` data. This MVP (a) ports it to a real Vite + React + TypeScript app, (b) builds the FastAPI + Celery backend that fulfils every requirement in `docs/altur-instructions.md` (must-haves + selected bonuses), and (c) wires the two together so every screen renders real data. The goal is a digestible, defensible codebase a single engineer can explain end-to-end in interview — no code-volume for its own sake.

## Architecture (one-pager)

Three-tier with an async work queue. Five containerized processes (api, worker, db, redis, frontend).

```
        Browser (React SPA — Vite + TS + TanStack Query)
                        │
               HTTP / JSON  (polls /status)
                        ▼
                 FastAPI api
            ┌──────┴──────┐
   audio    │             │ enqueue(call_id)
   write    ▼             ▼
         Disk         Redis (broker + result backend + token bucket)
                          │
                          ▼
                 Celery worker(s)
                  pipeline stages:
                   chunk → STT → mood → tags → insights → synthesis
                          │                                │
                          └───────► OpenAI ◄───────────────┘
                          │
                          ▼
                     PostgreSQL
```

**Backend layering (hexagonal-ish):**
`api/` (HTTP) → `services/` (business logic) → `tasks/` (Celery orchestration) → `providers/` (Protocols + OpenAI impls) — with `llm/`, `models/`, `schemas/`, `core/` as crosscutting. Providers are injected via DI; swapping OpenAI → Deepgram is one new class.

**Key invariants:**
- Status lives in **Postgres** (`Call.status`), not in Celery. The frontend polls a real endpoint, decoupling UI from broker choice — when we swap Celery+Redis → Redpanda (architecture doc), no frontend code changes.
- Validation happens at exactly two boundaries: HTTP request (Pydantic) and LLM response (Pydantic via OpenAI's `json_schema` response format). Internal code trusts its types.
- One Celery task per call, stages inside it. Simpler than chaining 5 tasks; failure flips `Call.status=failed` with a useful `error_message`.

**Why no auth in MVP:** Altur's brief classes auth as *"Super extra: only if time allows."* Done properly it's 1.5–2 hours (register/login flows, password hashing, JWT issue/refresh, protected routes FE + BE, `User`/`Org` tables, FK on every owned resource, RBAC for admin, tests for unhappy paths) — ~25–30% of total budget. That time goes instead into diarization quality, prompt design, cost tracking, model comparison, and pipeline failure modes — all heavily-weighted scoring dimensions. Auth done badly creates an interview-attack-surface (CSRF, token storage, refresh rotation); skipping it cleanly with a documented production migration path (Phase 7.5) reads as judgment. Field-level: `Call.owner` is a string for display only.

## Technical Context

- **Frontend:** Vite + React 18 + TypeScript + React Router 6 + TanStack Query v5. Convert existing `.jsx` → `.tsx` keeping current visual design and component structure.
- **Backend:** Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2 (async) + Alembic + Celery 5 + Redis 7 + PostgreSQL 16.
- **STT:** `gpt-4o-transcribe-diarize` (`diarized_json` response → segments with `speaker`, `start`, `end`). Wrapped behind an `STTProvider` Protocol with a `whisper-1`-based fallback class for the README's "swap-in-one-line" claim.
- **LLM:** OpenAI `gpt-4o-mini` and `gpt-4.1-mini`, both wrapped behind an `LLMProvider` Protocol. Model is selected per-stage via env vars (`LLM_MODEL_TAGGING`, `LLM_MODEL_MOOD`, `LLM_MODEL_INSIGHTS`, `LLM_MODEL_SYNTHESIS`). All structured calls use `response_format={"type": "json_schema", ...}` driven by a Pydantic schema per stage.
- **Storage:** Audio files on local disk under `./storage/audio/{call_id}.{ext}` (S3 swap is one Protocol away — note in README, do not implement).
- **Infra:** docker-compose with `db`, `redis`, `api`, `worker`, `frontend` services. Single `Makefile` at repo root drives every workflow.
- **Tests:** pytest + httpx AsyncClient for API; pytest with provider fakes for the LLM/STT pipeline (no live OpenAI calls in CI); vitest + Testing Library for 1–2 critical React components (upload flow, polling).
- **Frontend ↔ backend coverage requirement:** every `ALTUR.*` access in the existing frontend must resolve to a real backend endpoint. The audit list lives in Phase 4.

## Implementation Plan

*Each phase carries `<!-- orchestration: -->` metadata so `/build` can run independent phases in parallel. Phases sharing a `parallel_group` touch disjoint directories and run simultaneously.*

---

### Phase 1: Backend foundation (FastAPI + DB + Celery skeleton)
<!-- orchestration:
parallel_group: 1
depends_on: []
agent_role: fastapi-developer
file_scope:
  - backend/
  - docker/
  - alembic/
-->
- **Description:** Stand up the runnable backend shell — FastAPI app, async SQLAlchemy session factory, Alembic config, Celery app + Redis broker, settings via `pydantic-settings`, Dockerfiles for `api` and `worker`, `docker-compose.yml` for `db` + `redis` + `api` + `worker`.
- **Tasks:**
  - [x] 1.1 Create `backend/pyproject.toml` (uv or poetry — pick uv) with: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `celery[redis]`, `redis`, `pydantic-settings`, `python-multipart`, `openai`, `pytest`, `pytest-asyncio`, `httpx`, `aiosqlite` (test DB).
  - [x] 1.2 `backend/app/core/config.py` — `Settings(BaseSettings)` reading env (DB_URL, REDIS_URL, OPENAI_API_KEY, AUDIO_STORAGE_DIR, LLM_MODEL_* per stage, STT_MODEL).
  - [x] 1.3 `backend/app/core/db.py` — async `engine`, `async_session_maker`, `get_session` dependency.
  - [x] 1.4 `backend/app/main.py` — FastAPI app, CORS for `localhost:5173`, health endpoint `GET /health`.
  - [x] 1.5 `backend/app/celery_app.py` — Celery instance reading `REDIS_URL`, `task_serializer="json"`, autodiscovery of `app.tasks`.
  - [x] 1.6 `alembic/` initialised, `env.py` wired to async engine.
  - [x] 1.7 `docker/api.Dockerfile`, `docker/worker.Dockerfile`, root `docker-compose.yml` with named volume for `./storage/audio` and Postgres data.
- **Definition of Done (DoD):**
  - [x] `docker compose up` brings up all 4 services without crashing.
  - [x] `curl localhost:8000/health` returns `{"status":"ok"}`.
  - [x] `celery -A app.celery_app inspect ping` responds from worker container.
  - [x] `alembic upgrade head` runs cleanly against the compose Postgres.

---

### Phase 2: Frontend scaffold + TS port
<!-- orchestration:
parallel_group: 1
depends_on: []
agent_role: react-specialist
file_scope:
  - frontend/
-->
- **Description:** Replace the Babel-standalone setup with Vite + TS. Port every existing screen and component, preserving look & behavior. Replace `window.ALTUR` reads with a typed `api` client (mocked in this phase, real in Phase 4). Set up routing.
- **Tasks:**
  - [x] 2.1 Initialize Vite TS project at `frontend/` (preserve existing `stylesheets/styles.css` and `pages/index.html` content; move to Vite layout).
  - [x] 2.2 Add deps: `react-router-dom@6`, `@tanstack/react-query@5`, `@tanstack/react-query-devtools`. Dev deps: `typescript`, `@types/react`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `prettier`.
  - [x] 2.3 Convert all `.jsx` → `.tsx` (`screens/`, `components/`). Define shared types in `src/types.ts` mirroring backend Pydantic schemas (Call, CallDetail, TranscriptSegment, Client, Insight, DashboardKPIs, etc.).
  - [x] 2.4 Replace `useState`-based routing in `App` with React Router routes: `/`, `/calls`, `/calls/:id`, `/upload`, `/clients`, `/clients/:id`. Keep sidebar/topbar shell.
  - [x] 2.5 Create `src/api/client.ts` (typed fetch wrapper, base URL from `VITE_API_BASE_URL`) and `src/api/hooks.ts` (one TanStack Query hook per backend endpoint, returning fully typed data). Stub implementations return mocked data inline so the UI still renders.
  - [x] 2.6 Vite dev server proxies `/api` → `http://api:8000` in compose, `http://localhost:8000` in local dev.
  - [x] 2.7 `frontend/Dockerfile` (multi-stage: build → nginx static), wire into compose.
- **Definition of Done (DoD):**
  - [x] `npm run dev` serves the app and every existing screen renders identically to the pre-port version.
  - [x] `tsc --noEmit` passes with zero errors.
  - [x] React Router URLs change as the user navigates (no more `setRoute`).
  - [x] `docker compose up frontend` serves the built bundle.

---

### Phase 3: Domain models, schemas, and provider abstractions
<!-- orchestration:
parallel_group: 2
depends_on: ["Phase 1"]
agent_role: python-pro
file_scope:
  - backend/app/models/
  - backend/app/schemas/
  - backend/app/providers/
  - backend/alembic/versions/
-->
- **Description:** Define the SQLAlchemy models, the Pydantic schemas (request/response + LLM structured-output schemas), and the `STTProvider` / `LLMProvider` Protocols with concrete OpenAI implementations.
- **Tasks:**
  - [x] 3.1 SQLAlchemy models in `app/models/`:
    - `Client(id, name, industry, owner, created_at)`
    - `Call(id, client_id, title, filename, original_filename, content_type, size_bytes, duration_seconds, status, error_message, language, created_at, updated_at)` — `status` enum: `pending|transcribing|analyzing|done|failed`.
    - `Transcript(id, call_id, language, raw_payload_json, created_at)`
    - `TranscriptSegment(id, transcript_id, idx, start_seconds, end_seconds, speaker_label, speaker_role, text, mood)`
    - `Analysis(id, call_id, summary, headline, overall_sentiment, talk_ratio_rep, talk_ratio_client, llm_model_used, prompt_version, created_at)`
    - `Tag(id, name, color, is_system)` + `CallTag(call_id, tag_id, source)` where `source` = `llm|user`.
    - `Insight(id, call_id, kind, text, segment_idx, weight)` — `kind` ∈ `pain-point|objection|buying-signal|feature-req|competitor|pricing|next-step|quote|risk|highlight`.
    - `ActionItem(id, call_id, text, owner, due_date, done)`.
  - [x] 3.2 Alembic migration covering all of the above.
  - [x] 3.3 Pydantic v2 schemas in `app/schemas/`: `CallCreate`, `CallSummary` (list-row), `CallDetail` (full), `TranscriptSegmentOut`, `ClientCreate`, `ClientOut`, `TagOut`, `TagOverrideRequest`, `DashboardOut`, `InsightOut`, `ActionItemOut`. All `from_attributes=True`.
  - [x] 3.4 LLM structured-output schemas (also Pydantic) in `app/llm/schemas/`: `MoodLabels`, `TagSuggestion`, `InsightExtraction`, `Synthesis`. Each has a docstring + field descriptions used to feed `json_schema` to OpenAI.
  - [x] 3.5 Provider Protocols in `app/providers/`:
    - `STTProvider(Protocol)` with `async def transcribe(audio_path: Path, language: str | None) -> DiarizedTranscript`.
    - `LLMProvider(Protocol)` with `async def complete_structured(prompt: str, schema: type[BaseModel], model: str) -> BaseModel`.
  - [x] 3.6 Concrete impls: `OpenAISTT(STTProvider)` calling `gpt-4o-transcribe-diarize` with `diarized_json`; `OpenAILLM(LLMProvider)` using the latest `openai` SDK and `response_format={"type":"json_schema",...}`.
  - [x] 3.7 Provider DI wiring: FastAPI `Depends` factories returning configured singletons; same factories importable by Celery tasks.
- **Definition of Done (DoD):**
  - [ ] `alembic upgrade head` creates every table; `alembic downgrade base` reverses cleanly.
  - [x] `OpenAISTT` and `OpenAILLM` can be instantiated and have one passing unit test each using a `FakeOpenAIClient` (no network).
  - [ ] `mypy --strict app/providers app/schemas` passes (or `pyright` equivalent).

---

### Phase 4: Analysis pipeline (Celery tasks + prompts)
<!-- orchestration:
parallel_group: 3
depends_on: ["Phase 3"]
agent_role: python-pro
file_scope:
  - backend/app/tasks/
  - backend/app/llm/prompts/
  - backend/app/services/
-->
- **Description:** The end-to-end async pipeline: on upload the API enqueues `process_call`, which orchestrates STT → mood → tags → insights → synthesis using the providers from Phase 3. Each stage is its own Celery task so it can retry / be observed independently. Prompts live as plain Python strings with version constants.
- **Tasks:**
  - [ ] 4.1 `app/tasks/process_call.py` — top-level Celery task `process_call(call_id)`. Updates `Call.status` at every stage (`transcribing → analyzing → done|failed`), writes `error_message` on exceptions, swallows nothing silently.
  - [ ] 4.2 Stage functions (called inside the task, not separate Celery tasks — keeps the pipeline simple while preserving stage isolation):
    - `transcribe_stage(call) -> Transcript` — handles audio chunking + STT + stitching:
      - **Chunking:** if file > 24 MB, split with `ffmpeg` at silence boundaries (`silencedetect` filter, ~500 ms threshold) — never split mid-word, that wrecks diarization. Cap chunks at ~10 min / 24 MB whichever first.
      - **Per-chunk transcribe:** call `STTProvider` for each chunk in parallel (bounded concurrency).
      - **Segment stitching:** offset each chunk's segment timestamps by the chunk's start-second so the final transcript has monotonic timestamps.
      - **Cross-chunk speaker re-anchoring:** diarization labels (`SPEAKER_00`, `SPEAKER_01`) are per-chunk and don't carry across. Run one cheap LLM pass that takes the first 30 s of each chunk and maps `chunk_N.SPEAKER_X → canonical_speaker_id` so "Maya" stays "Maya" across the call.
      - Persist `Transcript` + `TranscriptSegment` rows with the canonicalised speaker labels.
    - `mood_stage(transcript) -> list[Mood]` — batches segments (~20 at a time), calls `LLMProvider` with `MoodLabels` schema, updates `TranscriptSegment.mood`.
    - `tag_stage(transcript) -> list[Tag]` — `TagSuggestion` schema, multi-label; persists `CallTag` rows with `source="llm"`.
    - `insight_stage(transcript) -> list[Insight]` + `list[ActionItem]` — `InsightExtraction` schema; persists rows.
    - `synthesis_stage(transcript, insights) -> Analysis` — `Synthesis` schema, computes overall sentiment + headline + summary + talk ratio (talk ratio is computable from segment durations, not the LLM).
  - [ ] 4.3 Prompts in `app/llm/prompts/` — one file per stage (`mood.py`, `tags.py`, `insights.py`, `synthesis.py`). Each exports `PROMPT_VERSION = "v1"` and a `build_prompt(...)` function. Prompt design and the proposed tag taxonomy (with justification) is captured in `docs/prompt-design.md` (Phase 7).
  - [ ] 4.4 Configurable retry: `process_call` retries the *whole* call on infrastructure errors (Redis dropped, DB blip) but does not retry on `OpenAIBadRequest`/validation errors — those flip the call to `failed` with a useful message.
  - [ ] 4.5 Concurrency: Celery worker `--concurrency=4` (configurable). Per-stage rate-limit guard for OpenAI implemented as a **Redis-backed token bucket** on the provider class (so it caps total in-flight calls *across* all worker processes, not per-process) — prevents 1k-batch stampedes.
  - [ ] 4.6 **Per-call cost tracking:** capture `usage` tokens (prompt + completion) returned by every OpenAI call inside the providers, sum per stage, persist on `Analysis` as `cost_usd_breakdown` (JSON: `{stt, mood, tags, insights, synthesis}`) and `cost_usd_total`. Pricing table is a config constant per model — easy to update when prices change. Surface on `CallDetail` so the UI can show "this call cost $0.0123 to analyze."
- **Definition of Done (DoD):**
  - [ ] End-to-end pytest with fake STT + LLM providers: insert one fake audio path → run `process_call` synchronously → assert `Call.status == done`, transcript persisted with N segments, ≥1 tag, ≥1 insight, `Analysis` row exists.
  - [ ] Failure pytest: fake STT raises → `Call.status == failed`, `error_message` populated, no partial transcript persisted.
  - [ ] `LLM_MODEL_TAGGING=gpt-4.1-mini` env override is reflected in the `Analysis.llm_model_used` field.

---

### Phase 5: REST API endpoints (full frontend coverage)
<!-- orchestration:
parallel_group: 3
depends_on: ["Phase 3"]
agent_role: fastapi-developer
file_scope:
  - backend/app/api/
  - backend/tests/api/
-->
- **Description:** Implement every endpoint required by the existing frontend. Each endpoint maps to a specific UI need, listed below.
- **Tasks:**
  - [ ] 5.1 Calls:
    - `POST /api/calls` — multipart `file` + `client_id` (or `client` body for create-on-the-fly). Validates extension (`.mp3`/`.wav`), content-type, max size (cap at 500 MB to match upload UI). Uvicorn / ASGI app configured for 500 MB body and 5-minute upload timeout. Persists file, creates `Call(status=pending)`, enqueues `process_call.delay(call_id)`, returns `202 {call_id}` immediately.
    - `GET /api/calls` — list with query params: `search`, `tag`, `assigned` (all|assigned|unassigned), `client_id`, `sort`, `order`, `limit`, `offset`. Returns `CallSummary[]` matching the columns the list view actually uses.
    - `GET /api/calls/{id}` — full `CallDetail` (transcript segments, tags, insights, action items, analysis, participants derived from diarization).
    - `GET /api/calls/{id}/status` — lightweight `{status, progress_step, error_message}` for polling from `ProcessingScreen`.
    - `PATCH /api/calls/{id}` — assign client, update title.
    - `PATCH /api/calls/{id}/tags` — full-replace tag list, marks new tags as `source="user"` (override semantics, satisfies "allow users to override tags" bonus).
    - `DELETE /api/calls/{id}` — single delete.
    - `POST /api/calls/bulk-delete` — `{ids: [...]}` for the list-view bulk action.
    - `GET /api/calls/{id}/export` — JSON export (audio metadata + transcript + summary + tags w/ source + insights + overrides). Satisfies "downloading/exporting JSON" bonus.
  - [ ] 5.2 Clients:
    - `GET /api/clients` — list with computed fields (`calls`, `lastCall`, `sentiment`, `arr` placeholder, `health`).
    - `POST /api/clients` — name (required), industry, owner.
    - `GET /api/clients/{id}` — detail + recent calls.
  - [ ] 5.3 Tags:
    - `GET /api/tags` — full taxonomy (`ALL_TAGS` source).
  - [ ] 5.4 Dashboard:
    - `GET /api/dashboard` — KPIs (calls this week + delta, avg sentiment + delta, conversion rate placeholder, talk:listen ratio), `sentimentTrend` (12 weeks), `callsPerDay` (14 days), `pipeline` (stage counts), `topPainPoints` (aggregated from `Insight` rows where kind=pain-point, weighted), `topPerformers` (placeholder until owner-tracking is real). Spec everything aggregable; mock the placeholders behind the same shape.
  - [ ] 5.5 Static taxonomy endpoints (`emotions`, `highlight_types`, `tag_colors`) — return the same data the frontend currently has hard-coded, so the frontend can drop its hardcoded copies.
  - [ ] 5.6 Error model: every endpoint returns `{"error": {"code", "message", "details"}}` on 4xx/5xx. Custom exception handlers for `ValidationError`, `IntegrityError`, our own `DomainError`.
  - [ ] 5.7 OpenAPI: every endpoint has `summary`, `description`, `response_model`, example payloads.
  - [ ] 5.8 **Optional cost-protection middleware (env-gated, OFF locally, ON when deployed):**
    - `AUTH_ENABLED=false` (default) → all middlewares below are no-ops; reviewer runs `make up` and uploads with zero friction.
    - When `AUTH_ENABLED=true`:
      - **API-key check** (`X-API-Key` header) on every `/api/*` route except `/health`. Key from `API_KEY` env var, compared with `secrets.compare_digest`. Frontend reads `VITE_API_KEY` at build time and attaches the header automatically via the `api/client.ts` wrapper.
      - **Daily budget circuit breaker** — Redis `INCRBYFLOAT spend:YYYY-MM-DD <cost_usd>` updated by the providers (Phase 4.6) on every OpenAI call. A `BudgetGuard` dependency on `POST /api/calls` rejects with `429 {"error": {"code": "budget_exceeded", ...}}` when today's spend ≥ `DAILY_BUDGET_USD`.
      - **Per-IP upload rate limit** — Redis token bucket keyed on `client_ip:date_hour`, cap = `RATE_LIMIT_UPLOADS_PER_HOUR` (default 10). Returns `429 {"error": {"code": "rate_limited"}}`. Applies only to `POST /api/calls`.
      - **CORS lock** — when `AUTH_ENABLED=true`, `allow_origins` reads from `ALLOWED_ORIGINS` env (comma-separated), no wildcard fallback.
    - All four levers are independent — `BudgetGuard` and rate-limiter run even if `AUTH_ENABLED=false` *if* their env vars are set, so you can budget-cap a local run for safety without API-key friction.
    - Tests: one pytest each for (a) missing API key → 401, (b) budget exceeded → 429, (c) rate limit exceeded → 429, (d) all middlewares off when `AUTH_ENABLED=false`.
- **Definition of Done (DoD):**
  - [ ] Every entry in the **Frontend ↔ Backend audit table** below has a matching endpoint that returns the right shape.
  - [ ] `pytest backend/tests/api/` covers: upload happy-path, upload rejects bad extension, upload rejects oversized, list with each filter combination, detail returns 404 for missing call, tag override flips `source`, bulk-delete, JSON export.
  - [ ] `/docs` (Swagger UI) renders every endpoint with examples.

#### Frontend ↔ Backend audit table

| Frontend usage | Source file | Endpoint |
|---|---|---|
| `ALTUR.CALLS` (list) | `screens/list.jsx`, `components/app.jsx` | `GET /api/calls` |
| `ALTUR.CALLS.filter(c => c.client === client.name)` | `screens/clients.jsx` | `GET /api/clients/{id}` (recent_calls) or `GET /api/calls?client_id=` |
| `ALTUR.CALLS.slice(0, 5)` (recent on dashboard) | `screens/dashboard.jsx` | `GET /api/calls?limit=5&sort=date&order=desc` |
| `ALTUR.SAMPLE_CALL` | `screens/detail.jsx` | `GET /api/calls/{id}` |
| `ALTUR.SAMPLE_TRANSCRIPT` | `screens/detail.jsx` | included in `GET /api/calls/{id}` payload as `segments` |
| `ALTUR.CLIENTS` | `screens/clients.jsx`, `screens/upload.jsx`, `screens/list.jsx`, `components/components.jsx` (sidebar pinned) | `GET /api/clients` |
| Create-new-client modal | `screens/upload.jsx` (`NewClientModal`) | `POST /api/clients` |
| `ALTUR.DASHBOARD` (kpis, sentimentTrend, callsPerDay, pipeline, topPainPoints, topPerformers) | `screens/dashboard.jsx` | `GET /api/dashboard` |
| `ALTUR.EMOTIONS` (taxonomy) | `screens/detail.jsx`, `components/components.jsx` | `GET /api/taxonomy/emotions` |
| `ALTUR.HIGHLIGHT_TYPES` | `scripts/data.js` | `GET /api/taxonomy/highlights` |
| `ALTUR.ALL_TAGS` | `screens/list.jsx`, `screens/detail.jsx` | `GET /api/tags` |
| `ALTUR.tagColor(t)` | `components/components.jsx` | colour included in `GET /api/tags` response (one source of truth) |
| Inline tag edit on list row | `screens/list.jsx` `updateTags` | `PATCH /api/calls/{id}/tags` |
| Bulk-delete selected calls | `screens/list.jsx` `deleteSelected` | `POST /api/calls/bulk-delete` |
| Single delete from row menu | `screens/list.jsx` `deleteOne` | `DELETE /api/calls/{id}` |
| Assign client to unassigned call | `screens/list.jsx` `assignClient` | `PATCH /api/calls/{id}` |
| Upload (file + client) | `screens/upload.jsx` → `onAnalyze` | `POST /api/calls` |
| Processing screen ticking through 5 steps | `screens/upload.jsx` `ProcessingScreen` | `GET /api/calls/{id}/status` polled by TanStack Query |
| Pinned-clients persistence | `components/app.jsx` (currently `localStorage`) | keep on `localStorage` (UI preference, not server state) |

---

### Phase 6: Frontend ↔ backend wiring (kill all mocks)
<!-- orchestration:
parallel_group: 4
depends_on: ["Phase 2", "Phase 5"]
agent_role: react-specialist
file_scope:
  - frontend/src/
-->
- **Description:** Replace every stub in `src/api/hooks.ts` with real fetches. Wire the upload flow to poll status. Delete `scripts/data.js` (the static `ALTUR` mock).
- **Tasks:**
  - [ ] 6.1 Real hooks: `useCalls(filters)`, `useCall(id)`, `useCallStatus(id)` (refetch every 1.5s while status ∈ `pending|transcribing|analyzing`), `useClients`, `useClient(id)`, `useTags`, `useEmotions`, `useDashboard`, mutations: `useCreateCall`, `useCreateClient`, `useUpdateTags`, `useAssignClient`, `useDeleteCall`, `useBulkDeleteCalls`.
  - [ ] 6.2 Upload screen: `useCreateCall` mutation using XHR-with-progress (not plain `fetch`) so the existing upload card can show a real progress bar (0–100%) during the network transfer for large files. On success, navigate to `/calls/:id` with `ProcessingScreen` reading real status.
  - [ ] 6.3 Processing screen: replace fake `setInterval` with `useCallStatus`; map backend status → 5 visible UI steps (Decoding/Transcribing/Identifying/Analyzing/Extracting).
  - [ ] 6.4 Detail screen: render real `segments` (from diarization), real `mood` per segment, real tags with `source` indicator (badge "manual" vs "AI"), real insights and action items. Add a small **cost footer** ("Analysis cost: $0.0123 · gpt-4o-mini") reading `cost_usd_total` and `llm_model_used` from `CallDetail`.
  - [ ] 6.5 List screen: filters/sort/search go to backend (no client-side filtering of mock data).
  - [ ] 6.6 Dashboard: every chart/widget reads from `useDashboard`.
  - [ ] 6.7 Error UI: a shared `ErrorBoundary` + `useToast` for mutation failures with the backend error `message`.
  - [ ] 6.8 Delete `frontend/scripts/data.js` and any remaining `window.ALTUR` references.
- **Definition of Done (DoD):**
  - [ ] `grep -r "ALTUR" frontend/src` returns nothing.
  - [ ] Uploading a real WAV produces a `done` call whose detail screen renders with real diarized transcript, real mood ribbon, real tags, real insights.
  - [ ] List filters (`assigned=unassigned`, `tag=Discovery`, `search=cobalt`) round-trip to the backend.
  - [ ] Dashboard renders without any `ALTUR.DASHBOARD` reference.

---

### Phase 7: Tests, model comparison, docs, Makefile
<!-- orchestration:
parallel_group: 5
depends_on: ["Phase 4", "Phase 5", "Phase 6"]
agent_role: qa-expert
file_scope:
  - backend/tests/
  - frontend/src/__tests__/
  - scripts/
  - docs/
  - Makefile
  - README.md
-->
- **Description:** Round out the test surface, build the model-comparison eval, write the README + architecture doc + prompt-design doc, and ship the root `Makefile`.
- **Tasks:**
  - [ ] 7.1 Backend tests (keep the count low, pick high-leverage cases per CLAUDE.md):
    - Pipeline integration: fake STT + fake LLM, end-to-end, assert persisted state.
    - Provider contract: `OpenAISTT` + `OpenAILLM` against a recorded fixture (use `respx` or a hand-rolled fake `httpx` transport — no live network).
    - API: tests already in Phase 5 DoD; add one for JSON export shape.
    - Validation: oversized upload, wrong extension, missing client.
  - [ ] 7.2 Frontend tests (vitest): `UploadScreen` happy path (file + client → mutation called) and `ProcessingScreen` polling-to-detail transition. That's it — don't chase coverage.
  - [ ] 7.3 `scripts/eval_models.py` — load 5 sample calls (audio fixtures in `tests/fixtures/audio/`), run each LLM stage through both `gpt-4o-mini` and `gpt-4.1-mini`, write side-by-side JSON to `docs/model-eval/results.json`. README links to it.
  - [ ] 7.4 `docs/prompt-design.md` — proposed tag taxonomy with justification, prompt-by-stage with version, evaluation strategy ("how would you measure tagging quality over time": per-stage labelled fixtures, agreement rate vs. human labels, drift detection by tracking new tag emergence per week).
  - [ ] 7.5 `docs/architecture-and-scale.md` — answers to the 4 mandatory questions in `altur-instructions.md` §5 (10k calls/day scaling, bottlenecks, prod changes, PII handling). Must also document the following concrete production-evolution paths (none implemented in MVP, all framed as "what I'd change for production" with the trigger condition that justifies the change):

    - **Semantic search + embeddings layer.** `text-embedding-3-small` on every transcript chunk, stored in Postgres with `pgvector` (HNSW index). Unlocks (a) global search across calls/clients/transcripts (exactly the "search for client X and find every transcript that mentions them" feature in `docs/ideas/ideas.md`), (b) similarity-based tag suggestion as a cheaper alternative to per-call LLM tagging at scale, (c) clustering pain points / objections across thousands of calls without re-running the LLM, (d) RAG into the synthesis prompt with top-k similar past calls. Trade-offs: extra storage, embed-on-write latency, HNSW vs IVFFlat index choice, re-embedding when the embedding model revs.

    - **Real-time progress via SSE/WebSocket.** Today the frontend polls `GET /api/calls/{id}/status` every 1.5 s. At higher volume that's wasteful. Swap polling for Server-Sent Events backed by Redis pub/sub: the Celery worker `PUBLISH`es stage transitions, the API holds an SSE connection per active call, browsers get push updates. Tradeoff: stickier sessions, harder to scale behind a stateless load balancer.

    - **Event-driven backbone (Redpanda).** Today's Celery+Redis is the right call for a single-consumer job queue: discrete jobs in, single outcome row out, frontend polls. The trigger to migrate is fan-out — when a *second* consumer needs the same event (real-time analytics dashboard fed by `call.tagged`, audit log for compliance, feedback loop that retrains tag classifiers from user overrides, billing service that meters per-call cost). At that point the right move is an event log (Redpanda — Kafka-API, single binary, no Zookeeper). The pipeline stages become event handlers on topics like `call.uploaded → call.transcribed → call.tagged → call.analyzed`; the upload endpoint publishes instead of `.delay()`-ing; Postgres becomes one of N read models built from the event stream. Provider Protocols mean the call sites don't change. Trade-offs gained: replay (re-run the whole corpus through a new prompt version), durable history, cleaner cross-team event bus. Trade-offs paid: lose Celery's batteries (retries, dead-letter, rate-limits — rebuild on top of the consumer framework), heavier ops footprint, higher debugging cost.

    - **Authentication, multi-tenancy, RBAC.** Today there is no auth — `Call.owner` is a string field for display only. Production needs OAuth2 / OIDC (Auth0, Keycloak, or Supabase Auth), `User` / `Org` tables, row-level filters on every list/detail endpoint (a user only sees their own org's calls), and an admin role that can see all owners' calls inside an org (the admin panel from the ideas doc). PII handling intersects here — see PII section.

    - **Voice-based participant identification.** Beyond per-call diarization, identify *who* is speaking across calls — voiceprint matching with `pyannote-audio` or `Resemblyzer`, embeddings stored per known speaker, similarity threshold for auto-tagging the rep on every new call. Trade-offs: false positives are damaging ("we tagged the wrong AE on this call"), needs a human-in-the-loop confirmation flow on first match.

    - **Cloud-storage ingestion (SharePoint / Google Drive).** OAuth-connected source pickers so users select existing recordings without re-uploading. Async pull job copies to local storage, then enters the same pipeline. Removes the browser-upload size cap entirely.

    - **Notifications + sharing.** WebSocket / email / Slack notifications when long-running analyses complete. Public read-only share links per call with a signed-URL expiry (and an explicit *redact-PII* preprocessing step before exposing publicly). Tradeoff to defend: auto-redaction is hard; safer to keep sharing org-internal only.

    - **PII handling and storage.** Audio + transcript = high-PII content. Production checklist: (a) encrypt audio at rest (S3 SSE-KMS); (b) row-level encryption on `Transcript.raw_payload_json` and `TranscriptSegment.text`; (c) explicit retention policy (e.g., delete audio after 90 days, retain only redacted transcripts); (d) PII redaction pass before LLM stages (regex + a small NER pass for names/emails/phones) — currently we send raw transcripts to OpenAI which is acceptable in MVP only if calls are non-sensitive; (e) data residency (EU vs US OpenAI endpoint, regional Postgres); (f) per-row audit log for who viewed which call; (g) right-to-delete handler that cascades through audio + transcript + analysis + embeddings.

    - **Per-call cost & margin metrics.** MVP already tracks token cost per call (Phase 4.6). Production extension: aggregate to per-client / per-rep / per-org dashboards, alert when a single call exceeds N× the median cost, expose as a "cost per dollar of pipeline analyzed" KPI. This is the answer to the brief's scale question — at 10k calls/day, cost-per-call is the difference between "this is profitable" and "this burns the runway."
  - [ ] 7.6 `README.md` at repo root: setup (Docker + local), how to run tests, env vars table, assumptions, architecture summary, "what I'd add with more time" (auth, S3, deployment, reasoning-model fallback, real diarization vendor benchmark).
  - [ ] 7.7 `Makefile` at repo root with at minimum:
    - `make up` → `docker compose up --build`
    - `make down`
    - `make migrate` → run alembic in api container
    - `make seed` → load a few sample calls + clients (uses `scripts/seed.py`)
    - `make test` → backend pytest + frontend vitest
    - `make eval` → run `scripts/eval_models.py`
    - `make logs` / `make shell-api` / `make shell-worker` / `make psql`
    - `make fmt` / `make lint`
    - `make clean`
  - [ ] 7.8 Seed script (`scripts/seed.py`) that pre-populates the DB so a reviewer cloning the repo runs `make up && make seed` and immediately sees populated dashboard/list/clients.
- **Definition of Done (DoD):**
  - [ ] `make up && make migrate && make seed` from a fresh clone produces a working app at `http://localhost:5173` with populated data.
  - [ ] `make test` runs the full test suite (backend + frontend) and exits 0.
  - [ ] `make eval` produces `docs/model-eval/results.json`.
  - [ ] README has a "Run with one command" section showing `make up` as the entry point.
  - [ ] Architecture doc and prompt-design doc are complete and linked from README.
  - [ ] Git history shows meaningful conventional commits per phase (no single "done" commit).
