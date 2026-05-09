# Altur: Sales Call Intelligence MVP

Altur is a sales-call analysis system that transcribes audio, detects buyer sentiment and pain points, suggests deal-relevant tags, and surfaces next-step commitments — all via a REST API + React frontend. It's designed to run end-to-end on a single engineer's laptop and scale to 10k calls/day with zero infrastructure rework.

**Tech stack:** FastAPI + Celery + Redis + PostgreSQL (backend), Vite + React 18 + TypeScript + TanStack Query (frontend). LLM and STT providers are abstracted via Protocols, allowing a one-line swap (OpenAI ↔ Deepgram, gpt-4o-mini ↔ claude-opus, etc.). Cost tracking is first-class: every LLM call logs spend, and a Redis-backed daily budget cap prevents runaway bills.

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
make up && make migrate && make seed
```

This spins up all services, runs DB migrations, and seeds a sample call + user.

### 3. Access

- **Frontend:** http://localhost:5173
- **API docs:** http://localhost:8000/docs
- **Database CLI:** `make psql`

### 4. Process a Call

```bash
# Upload audio (or use example from storage/audio)
curl -F "audio=@path/to/call.wav" http://localhost:8000/api/calls

# Returns: { "id": "uuid", "status": "pending" }

# Poll for completion
curl http://localhost:8000/api/calls/{id}/status

# When status=done, fetch full analysis
curl http://localhost:8000/api/calls/{id}
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

Runs the model evaluation script against a fixture set of human-annotated calls. Outputs precision/recall/F1 per tag, cost per stage, and prompt version tracking to `docs/model-eval/results.json`.

See [docs/prompt-design.md](docs/prompt-design.md) for the evaluation strategy and taxonomy.

---

## Architecture Overview

The MVP follows a **status-driven** pattern:

1. **Frontend** → `POST /api/calls` with audio.
2. **API** creates a `Call` row (status=`pending`), enqueues Celery task, returns call ID.
3. **Frontend** polls `GET /api/calls/{id}/status` every 2 seconds.
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

---

## What I'd Add With More Time

1. **OAuth2 + JWT auth** — Replace API key with email/password + OIDC SSO (Google, Okta). Enable multi-tenancy with row-level security.
2. **S3 + object storage** — Swap local disk for S3 with SSE-KMS encryption. Add 90-day retention + PII redaction.
3. **STT vendor benchmarking** — Add Deepgram, AssemblyAI, Groq-whisper behind abstractions. Run side-by-side on real calls; pick winner by latency/cost/accuracy.
4. **Real-time progress (WebSocket/SSE)** — Swap polling for Redis pub/sub. Push stage transitions to frontend in real-time.
5. **Reasoning-model synthesis** — Use gpt-4-turbo with chain-of-thought for insights. Accept longer latency for higher quality.
6. **Deployment (ECS/Fly.io)** — Package as Terraform + GitHub Actions. One-command deploy to Fly or ECS with managed Postgres/Redis.

---

## Documentation

- [docs/prompt-design.md](docs/prompt-design.md) — Tag taxonomy, per-stage prompts, evaluation strategy.
- [docs/architecture-and-scale.md](docs/architecture-and-scale.md) — Happy path, scaling to 10k/day, PII handling, production evolution.
- [docs/deployment.md](docs/deployment.md) — Deployment checklist, cost protection, Cloudflare + hosting options (private, for deployment only).

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
- **Local audio storage** — Survives container restart but not cluster failover. Production needs S3.
- **Polling, not WebSocket** — Frontend polls every 2s; latency feels like 1–2s. Real-time via Redis pub/sub + SSE is next.
- **Synchronous provider calls** — All STT/LLM calls block the worker. Async httpx client is in place; edge case of a stalled OpenAI request blocks 1/4 worker slots for up to 60s.
