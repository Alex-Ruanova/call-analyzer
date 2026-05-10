# Altur: Sales Call Intelligence MVP

Altur is a sales-call analysis system that transcribes audio, detects buyer sentiment and pain points, suggests deal-relevant tags, and surfaces next-step commitments — all via a REST API + React frontend. The path from 1 call/day to 10k/day is described in [docs/architecture-and-scale.md](docs/architecture-and-scale.md).

**Live demo:** https://altur.norvaru.com/ · **Local:** `make up`

**Tech stack:** FastAPI + Celery + Redis + PostgreSQL (backend), Vite + React 18 + TypeScript + TanStack Query (frontend). STT and LLM are accessed through Protocols so providers (OpenAI, Deepgram, Anthropic) can be swapped via config. Every LLM/STT call logs `cost_usd` to the call's analysis row, and a Redis-backed daily budget cap blocks new uploads when exceeded.

---

## Quick Start

### Prerequisites

- Docker + Docker Compose 2.x
- OpenAI API key (or set a compatible STT/LLM provider)

### 1. Configure

```bash
cp .env.example .env
# Edit .env and add OPENAI_API_KEY=sk-... (or use the default stub to demo offline)
```

### 2. Run

```bash
make up
```

This spins up all services. **Migrations run automatically** when the API container starts. If you ever need to run them manually, use `make migrate`.

To also load demo clients, calls, transcripts and analyses so the dashboard renders something on first load:

```bash
make seed-demo
```

The demo dataset is purely illustrative and entirely optional — skip it if you want to upload your own audio against a clean DB.

### 3. Access

- **Frontend:** http://localhost:5173
- **API docs:** http://localhost:8000/docs
- **Database CLI:** `make psql`
- **Live demo:** https://altur.norvaru.com/

### 4. Process a Call

```bash
# Upload audio (or use an example from storage/audio)
curl -F "file=@path/to/call.wav" http://localhost:8000/api/calls

# Returns: { "call_id": 42 }   (HTTP 202 Accepted)

# Poll for completion
curl http://localhost:8000/api/calls/42/status

# When status=done, fetch the full analysis
curl http://localhost:8000/api/calls/42
```

---

## Environment Variables

All required vars are in `.env.example`. Here's the reference:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string (async driver: `+asyncpg`) |
| `REDIS_URL` | yes | — | Redis connection string |
| `OPENAI_API_KEY` | yes | — | OpenAI API key (for STT + LLM) |
| `AUDIO_STORAGE_DIR` | no | `/app/storage/audio` | Directory to store uploaded audio files |
| `STT_MODEL` | no | `gpt-4o-transcribe-diarize` | Speech-to-text model; swappable provider |
| `LLM_MODEL_MOOD` | no | `gpt-4o-mini` | Model for mood analysis stage |
| `LLM_MODEL_TAGGING` | no | `gpt-4o-mini` | Model for tag suggestion stage |
| `LLM_MODEL_INSIGHTS` | no | `gpt-4o-mini` | Model for insight extraction stage |
| `LLM_MODEL_SYNTHESIS` | no | `gpt-4o-mini` | Model for call synthesis stage |
| `AUTH_ENABLED` | no | `false` | Enable API key auth (set `true` before public deployment) |
| `API_KEY` | no | — | API key for auth (if `AUTH_ENABLED=true`); frontend embeds at build time |
| `DAILY_BUDGET_USD` | no | `10.0` | Daily spend cap on OpenAI; blocks uploads if exceeded |
| `RATE_LIMIT_UPLOADS_PER_HOUR` | no | `10` | Max uploads per IP address per hour; 0 to disable |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173` | CORS origin (frontend URL) |
| `VITE_API_BASE_URL` | no | `/api` | Frontend API base URL (baked at build time) |
| `ENV` | no | `development` | Runtime environment (`development` or `production`) |

---

## Running Tests

```bash
make test
```

Runs pytest (backend) + Vitest (frontend) in Docker. Tests are minimal and integration-focused; mocking is avoided where possible.

---

## Model Evaluation

```bash
make eval
```

Runs each LLM stage (mood, tags, insights, synthesis) on a fixture set of transcripts side-by-side across `gpt-4o-mini` and `gpt-4.1-mini`. Writes per-stage cost, latency, token usage, and structured outputs to `docs/model-eval/results.json` so the two models can be diffed manually.

This is a model-comparison harness, not a scored benchmark — there is no precision/recall/F1 against ground-truth annotations yet. See [docs/prompt-design.md](docs/prompt-design.md) for the taxonomy and the intended evaluation strategy.

---

## Architecture Overview

The MVP follows a **status-driven** pattern:

1. **Frontend** → `POST /api/calls` with audio.
2. **API** creates a `Call` row (status=`pending`), enqueues Celery task, returns call ID.
3. **Frontend** polls `GET /api/calls/{id}/status` every 1.5 seconds.
4. **Worker** processes: STT → Mood → Tagging → Insights → Synthesis. Logs cost to `Analysis.cost_usd_breakdown`. Updates `Call.status = "done"`.
5. **Frontend** fetches full call data when status changes.

This avoids WebSockets for the MVP. See [docs/architecture-and-scale.md](docs/architecture-and-scale.md) for scaling strategies (horizontal worker scaling, pgBouncer pooling, S3 audio storage, real-time SSE) and production checklists (PII encryption, retention policy, GDPR-compliant deletion).

**Provider abstraction:** All external integrations (STT, LLM, audio storage) are defined as Protocols. Swapping providers is a one-line config change:

```python
# MVP: gpt-4o-transcribe-diarize
stt = OpenAISTT(model="gpt-4o-transcribe-diarize")

# Production: Deepgram (14x cheaper)
stt = DeepgramSTT(model="nova-2")
```

**Cost tracking:** Every LLM/STT call logs `cost_usd` to `Analysis.cost_usd_breakdown`. Frontend displays per-call cost. Budget cap on `DAILY_BUDGET_USD` prevents overspend.

**Data lifecycle:**

- The audio file is stored to disk on upload and **deleted right after the call reaches `status=done`**. The transcript + analysis in Postgres carry everything downstream features need. Reduces disk pressure and PII footprint; the trade-off is that re-running STT on an existing call is not possible without re-uploading.
- Calls are **soft-deleted** (`Call.deleted_at`). User-facing endpoints (list, detail, dedup-on-upload) filter them out. The dashboard splits by intent: cost and volume KPIs keep the soft-deleted rows (the OpenAI bill is real), quality KPIs (Positive rate, Talk:Listen, sentiment trend) hide them. Full lifecycle in [docs/architecture-and-scale.md](docs/architecture-and-scale.md#data-lifecycle).

---

## Submission checklist (Altur brief)

Mapped to `docs/altur-instructions.md`. Where a feature is partial or deliberately stubbed, the link points to the doc that explains the trade-off.

**Required (section 2):**

- [x] Web app to upload audio (WAV / MP3) — `frontend/src/screens/UploadScreen`.
- [x] Backend STT — OpenAI `gpt-4o-transcribe-diarize` via `STTProvider` Protocol.
- [x] LLM analysis: summary, tags, justified taxonomy, prompt design, evaluation strategy — see [docs/prompt-design.md](docs/prompt-design.md) and `make eval`.
- [x] Persistence: filename, upload timestamp, transcript, summary, tags — plus mood-per-segment, sentiment, emotion distribution, talk:listen, cost.
- [x] List + detail UI — `ListScreen`, `DetailScreen`, plus `Dashboard`, `ClientDetail`, `Settings`.
- [x] Coherent API + UI workflows — upload → status polling → detail; tag overrides; export; soft delete; phantom-speaker review queue.
- [x] Testing strategy + tests — pytest (backend integration, real Postgres) + Vitest (frontend); see `Running Tests` below.
- [x] Error handling — Result-style boundaries on provider calls, retry-with-backoff on transient failures, `status=failed` surfaced in UI, daily budget cap, per-IP rate limit.
- [x] README with setup, env, assumptions, architecture, what's next.
- [x] Meaningful Git history (`git log --oneline` shows feature/fix/docs/refactor commits, no "done" mega-commit).
- [x] 30-minute calls — chunked STT (`_build_chunk_intervals`), upload returns 202 in <200 ms, frontend polls.
- [x] 1k recordings burst — Celery horizontally scalable, Redis token bucket on OpenAI, `DAILY_BUDGET_USD` cap, idempotent dedup-on-upload by content hash.

**Bonus (section 3):**

- [x] Speaker / role detection — diarization + `Participant.side` (rep / customer) drives talk:listen and overall sentiment.
- [x] Intent / mood / emotion — per-segment mood, overall sentiment score, emotion distribution.
- [x] Extra insights — pain points, buying signals, next-step commitments, objections (structured JSON via OpenAI `response_format=json_schema`).
- [x] Tag overrides — inline `TagEditor` on `DetailScreen`, persisted as `CallTag(source='user')`.
- [x] Docker-compose — `make up` boots api + worker + db + redis + frontend with auto-migrate.
- [x] Analytics dashboard — total calls, sentiment trend, tag distribution, talk:listen, total spend, per-client rollups.
- [x] Edge-case tests — STT/LLM failures, invalid content-type uploads, budget-exceeded (429), rate-limit-exceeded (429), failed-status rendering in UI.
- [x] **Super extra:** JSON export — `GET /api/calls/{id}/export` (audio metadata + transcript + summary + tags + overrides).
- [x] **Super extra:** Live deployment — [altur.norvaru.com](https://altur.norvaru.com/). Azure Linux VM running the same `docker-compose` stack as local, with images pulled from Azure Container Registry and Cloudflare in front for DNS/TLS. Terraform in `infra/`, design choices and the *why-not-managed-services* trade-off in [docs/infrastructure.md](docs/infrastructure.md).
- [ ] **Super extra (skipped on purpose):** Multi-user auth. Single-tenant API-key gate is wired (`AUTH_ENABLED`) but full OAuth2 + RBAC was a 4–6h scope I traded for depth on the analysis pipeline. See `docs/improvements.md → Auth, multi-tenancy, RBAC` for the design I'd ship.

**Architecture & Scale (section 5):** all four questions answered in [docs/architecture-and-scale.md](docs/architecture-and-scale.md) — 10k/day, bottlenecks, production evolution, PII handling.

---

## What I'd Add With More Time

The full backlog (sized, prioritized) lives in [docs/improvements.md](docs/improvements.md). I'd skip the tactical polish and pick items that materially change what the product can do — and that I can defend in interview:

1. **Reanalyze in place — `POST /api/calls/{id}/reanalyze`.** Reuses `Transcript` rows, only re-runs `tag_stage` + `analyze_stage`. Same call_id, no duplicate rows, no re-paying STT (cents instead of dollars). This is the canonical tool for prompt iteration; without it, every prompt tweak forces a re-upload and creates ghost calls.

2. **Semantic search across calls + clients with `pgvector`.** `text-embedding-3-small` on every transcript chunk, HNSW index in Postgres. Unlocks (a) global search ("show me every call mentioning ACME"), (b) cheap tag suggestion via nearest-neighbours instead of per-call LLM, (c) RAG into the synthesis prompt with top-k similar past calls — sales context the model otherwise hallucinates. The interesting design question is when retrieval-augmented tagging beats prompt-only tagging on cost-per-correct-tag — `make eval` already has the harness.

3. **Voice-print identification across calls.** Per-call diarization gives `SPEAKER_00` / `SPEAKER_01`; voiceprint embeddings (`pyannote-audio` / `Resemblyzer`) collapse those into stable rep / client identities across the corpus. Required for any per-rep coaching dashboard, but the trade-off is a human-in-the-loop confirmation flow on first match — false positives are damaging.

4. **Event-driven backbone (Redpanda / Kafka).** Today Celery is fine. The reason to migrate is the *second* consumer of `call.tagged`: real-time analytics, audit log for compliance, retraining loop on tag overrides, billing. Stages become handlers on `call.uploaded → call.transcribed → call.tagged → call.analyzed`. Different operational profile (offsets, replays, schema registry); only worth it once a second consumer exists.

5. **PII redaction pass before LLM stages.** Regex + small NER for names / emails / phones, applied between STT and the LLM stages. Pairs with retention policy (audio TTL, redacted-only transcripts after 90 days) and per-row audit log. The interesting bit is measuring redaction accuracy — false negatives leak PII, false positives destroy analysis quality.

The tactical wins (cost-by-stage UI, hardcoded copy in `DetailScreen`, conversion-rate KPI, tag management screen) are listed under `docs/improvements.md → Quick wins` — I'd batch them but they're not what I'd lead with.

---

## How I worked

Spec-first: each implementation slice starts with a short technical spec (file scope, contracts, acceptance criteria) committed *before* any code. The spec lives next to the code in `docs/specs/`, and the loop is **spec → code → test → commit → debt entry if a corner was cut**. I used coding agents to write the keystrokes, but the design decisions, the reviewing of every diff, and the test contracts are mine — the brief explicitly asks for engineers who can explain and maintain the code, and that's the bar this loop is built around. `docs/technical-debt/` is the running log of bugs I diagnosed and trade-offs I chose, kept in-tree so the *why* survives outside commit messages.

---

## Documentation

- [docs/mvp/prd.md](docs/mvp/prd.md) — Product brief written before any code: scope, invariants, what's out.
- [docs/specs/](docs/specs/) — Per-phase technical specs (the prompts I gave to coding agents).
- [docs/prompt-design.md](docs/prompt-design.md) — Tag taxonomy, per-stage prompts, evaluation strategy.
- [docs/architecture-and-scale.md](docs/architecture-and-scale.md) — Happy path, scaling to 10k/day, PII handling, production evolution.
- [docs/infrastructure.md](docs/infrastructure.md) — Live deployment on Azure: resource map (`infra/` Terraform), why each service, what's parametrized, production gaps.
- [docs/improvements.md](docs/improvements.md) — Forward-looking backlog (quick wins + strategic).
- [docs/technical-debt/](docs/technical-debt/) — One entry per known gap or design decision worth flagging (sentiment numeric vs categorical, language detection, participants persistence, notes persistence, phantom-speaker review queue, etc.).

---

## Development

```bash
# Format code
make fmt

# Lint (ruff + TypeScript)
make lint

# View logs
make logs

# Shell into API container
make shell-api

# Shell into worker container
make shell-worker

# Drop to Postgres CLI
make psql
```

---

## Known Limitations

- **No auth in MVP** — API key is optional; frontend embeds it. Budget cap + rate limiting provide cost protection; true multi-tenancy requires OAuth2 + row-level filters.
- **Local audio storage** — Survives container restart but not cluster failover. Production needs S3. Audio is also deleted right after each call finishes processing (see Data lifecycle above), so the disk only holds in-flight uploads.
- **No restore for deleted calls** — Soft delete is a one-way trip from the UI. Recovering a deleted call requires `UPDATE calls SET deleted_at = NULL` in psql. Acceptable for a single-user MVP; production should add an N-second undo window.
- **Polling, not WebSocket** — Frontend polls every 1.5s while a call is processing. Real-time via Redis pub/sub + SSE is next (see `docs/improvements.md`).
- **Synchronous provider calls** — All STT/LLM calls block the worker. Async httpx client is in place; edge case of a stalled OpenAI request blocks 1/4 worker slots for up to 60s.
