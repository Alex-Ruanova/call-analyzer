# Phase 7 — Tests, Model Comparison, Docs, Makefile

## Goal

Round out the test surface, build the model-comparison eval script, write all docs
(README, architecture, prompt-design), and ship the root `Makefile` + `scripts/seed.py`.

---

## File Scope

```
backend/tests/
frontend/src/__tests__/
scripts/
docs/
Makefile
README.md
```

---

## 7.1 Backend Tests

### What already exists
- `backend/tests/test_pipeline.py` — full end-to-end with fake STT + LLM (happy path,
  STT failure, LLM failure, status transitions, env override).
- `backend/tests/api/test_calls.py` — upload happy path, bad extension, invalid content
  type, oversized, list empty, and several more.
- `backend/tests/api/test_clients.py`, `test_dashboard.py`, `test_middleware.py` —
  existing coverage.
- `backend/tests/providers/test_openai_providers.py` — provider unit tests.

### What to add (minimal, high-leverage only)

**`backend/tests/api/test_calls.py` — add:**
- `test_json_export_shape` — `GET /api/calls/{id}/export` returns JSON with
  `audio_metadata`, `transcript`, `summary`, `tags`, `insights` keys.
- `test_detail_404` — `GET /api/calls/999999` returns 404 with `error.code`.
- `test_tag_override_source` — `PATCH /api/calls/{id}/tags` sets `source=user` on replaced
  tags.

No new test files needed; extend the existing ones.

---

## 7.2 Frontend Vitest Tests

Create `frontend/src/__tests__/UploadScreen.test.tsx`:
- Happy path: render `UploadScreen`, simulate file selection + client selection, click
  Analyze, assert `useCreateCall` mutation is invoked with a `FormData` containing `file`
  and `client_id`.
- Use `msw` (mock service worker) or vitest `vi.mock` to intercept the mutation. The
  test verifies the hook is called, not the network request.

Create `frontend/src/__tests__/ProcessingView.test.tsx`:
- Render `DetailScreen` with a mocked `useCallStatus` returning `{status: "transcribing"}`.
- Assert the processing UI renders (step label "Transcribing speech" visible).
- Re-render with `{status: "done"}`, assert the processing UI is gone and `useCall` was
  enabled.

Both tests use `MemoryRouter` and `QueryClientProvider` wrappers.

---

## 7.3 `scripts/eval_models.py`

Model comparison script — loads audio fixtures, runs each LLM stage through both models,
writes side-by-side JSON.

```
scripts/eval_models.py
tests/fixtures/audio/        (small WAV fixtures for eval — 30 s each)
docs/model-eval/results.json (output)
```

### Implementation

```python
#!/usr/bin/env python3
"""
Run each LLM stage (mood, tags, insights, synthesis) through gpt-4o-mini
and gpt-4.1-mini on a set of sample transcripts. Write side-by-side JSON
to docs/model-eval/results.json.

Usage: python scripts/eval_models.py [--fixtures-dir tests/fixtures/transcripts]
"""
```

- Read transcript fixtures from `tests/fixtures/transcripts/*.json` (simple JSON files
  with a `segments` array — no audio needed for LLM eval).
- For each fixture × each model × each stage: call the stage function directly (not via
  Celery) with a fake session that returns pre-built `Transcript` + `TranscriptSegment` objects.
- Record: model, stage, input tokens, output tokens, cost_usd, output (parsed schema),
  latency_ms.
- Write to `docs/model-eval/results.json`:
  ```json
  {
    "run_at": "ISO8601",
    "fixtures": [
      {
        "name": "fixture_name",
        "stages": {
          "mood": { "gpt-4o-mini": {...}, "gpt-4.1-mini": {...} },
          ...
        }
      }
    ]
  }
  ```
- Create 2–3 small transcript fixtures in `tests/fixtures/transcripts/`.
- Script exits non-zero if any stage fails (for `make eval`).

---

## 7.4 `docs/prompt-design.md`

Document the tag taxonomy with justification and per-stage prompt design.

### Sections
1. **Tag taxonomy** — the 10+ tag categories, why each was chosen, how they map to the
   sales funnel stages a rep cares about.
2. **Per-stage prompts** — for mood, tags, insights, synthesis: the prompt strategy,
   version constant, and what the `json_schema` constraint buys us.
3. **Evaluation strategy** — how to measure tagging quality over time:
   - Per-stage labelled fixtures (human-annotated ground truth).
   - Agreement rate vs. human labels (precision/recall per tag).
   - Drift detection: track new tag emergence rate per week (if > X% new tags per week,
     the taxonomy needs rebalancing).
   - Cost per stage as a proxy for prompt efficiency.

---

## 7.5 `docs/architecture-and-scale.md`

Answers to the 4 mandatory questions from `altur-instructions.md §5` plus the 8 production
evolution paths already defined in the PRD (§Phase 7, task 7.5).

### Mandatory questions
1. How would you handle 10k calls/day?
2. What are the bottlenecks?
3. What would you change for production?
4. How do you handle PII?

### Production evolution paths (as documented in PRD 7.5)
- Semantic search + embeddings (pgvector)
- Real-time progress via SSE/WebSocket
- Event-driven backbone (Redpanda)
- Auth, multi-tenancy, RBAC
- Voice-based participant identification
- Cloud-storage ingestion
- Notifications + sharing
- PII handling checklist

---

## 7.6 `README.md`

Root-level README with:
- One-command setup: `make up`
- Prerequisites: Docker + Docker Compose, `.env` file with `OPENAI_API_KEY`
- Env vars table (all `Settings` fields with descriptions and defaults)
- How to run tests: `make test`
- How to run model eval: `make eval`
- Architecture summary (link to `docs/architecture-and-scale.md`)
- Assumptions made during development
- "What I'd add with more time" section (auth, S3, real STT vendor benchmark,
  reasoning-model fallback, deployment)
- Link to `docs/prompt-design.md`

---

## 7.7 `Makefile`

```makefile
up:       docker compose up --build
down:     docker compose down
migrate:  run alembic in api container
seed:     run scripts/seed.py in api container
test:     backend pytest + frontend vitest
eval:     run scripts/eval_models.py
logs:     docker compose logs -f
shell-api: docker compose exec api /bin/bash
shell-worker: docker compose exec worker /bin/bash
psql:     docker compose exec db psql -U altur
fmt:      ruff format backend/ + prettier frontend/src/
lint:     ruff check backend/ + tsc --noEmit
clean:    docker compose down -v --remove-orphans
```

All targets use `@` to suppress echo and `$(MAKE)` for recursive calls. PHONY declared
for every target.

---

## 7.8 `scripts/seed.py`

Pre-populates the DB so `make up && make seed` shows a populated dashboard immediately.

### Data to create
- 3 clients: "Northwind Co", "Acme Corp", "Summit Labs"
- 6–8 calls spread across clients with realistic titles, durations, created_at dates
  (spread over 4 weeks so charts show trends)
- Analysis rows with realistic sentiments, talk ratios, cost data
- Tags (mix of system + user-override)
- 2–3 insights + 1–2 action items per call
- Transcript + segments for at least 2 calls (enough for detail screen to render)

Script uses `asyncio` + `sqlalchemy.ext.asyncio` directly (no Celery, no real audio).
Reads `DATABASE_URL` from env. Idempotent: checks if clients already exist before inserting.

---

## Definition of Done

- `make up && make migrate && make seed` from a fresh clone → working app at
  `http://localhost:5173` with populated data.
- `make test` runs full backend + frontend test suite and exits 0.
- `make eval` produces `docs/model-eval/results.json`.
- `README.md` has a "Run with one command" section showing `make up`.
- `docs/architecture-and-scale.md` and `docs/prompt-design.md` are complete and
  linked from README.
- `tsc --noEmit` passes after adding vitest test files.
