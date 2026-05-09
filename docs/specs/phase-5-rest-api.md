# Phase 5 Technical Specification — REST API Endpoints

## Goal

Implement every REST endpoint required by the existing frontend (and the frontend ↔ backend audit table from the PRD). The API must cover: calls CRUD, clients CRUD, tag management, dashboard aggregation, taxonomy endpoints, a consistent error model, and optional cost-protection middleware.

---

## Existing Infrastructure (from Phases 1–3)

- **FastAPI app:** `backend/app/main.py` — CORS configured, exception handlers for `DomainError`, `RequestValidationError`, `Exception`. Has `# Phase 5 adds routers` comments ready.
- **DB session:** `get_session` dependency from `app/core/db.py`.
- **Models:** `Call`, `Client`, `Tag`, `CallTag`, `Transcript`, `TranscriptSegment`, `Analysis`, `Insight`, `ActionItem`.
- **Schemas:** `CallCreate`, `CallUpdate`, `CallSummary`, `CallDetail`, `CallStatusOut`, `TagOverrideRequest`, `ClientCreate`, `ClientOut`, `TagOut`, `InsightOut`, `ActionItemOut`, `DashboardOut`, `AnalysisOut`, `TranscriptSegmentOut`.
- **Error class:** `DomainError(code, message, status_code)`.
- **Settings:** `AUTH_ENABLED`, `API_KEY`, `DAILY_BUDGET_USD`, `RATE_LIMIT_UPLOADS_PER_HOUR`, `ALLOWED_ORIGINS`.
- **Celery task:** `process_call` (Phase 4) — enqueued via `.delay(call_id)`.

---

## Files to Create

```
backend/app/api/__init__.py          # already exists (empty)
backend/app/api/calls.py
backend/app/api/clients.py
backend/app/api/tags.py
backend/app/api/dashboard.py
backend/app/api/taxonomy.py
backend/app/api/middleware.py        # auth, budget, rate-limit (env-gated)
backend/tests/api/__init__.py
backend/tests/api/conftest.py        # AsyncClient fixture, test DB setup
backend/tests/api/test_calls.py
backend/tests/api/test_clients.py
backend/tests/api/test_dashboard.py
backend/tests/api/test_middleware.py
```

**Update:** `backend/app/main.py` — mount routers + middleware.

---

## Router Design

All routers use prefix `/api`. `main.py` includes them via `app.include_router()`.

### `app/api/calls.py`

```
POST   /api/calls                   → 202 {call_id}
GET    /api/calls                   → list[CallSummary]
GET    /api/calls/{id}              → CallDetail
GET    /api/calls/{id}/status       → CallStatusOut
PATCH  /api/calls/{id}              → CallDetail
PATCH  /api/calls/{id}/tags         → CallDetail
DELETE /api/calls/{id}              → 204
POST   /api/calls/bulk-delete       → {deleted: int}
GET    /api/calls/{id}/export       → JSONResponse (inline download)
```

#### `POST /api/calls`

- Accept multipart: `file: UploadFile`, `client_id: int | None = Form(None)`, `title: str | None = Form(None)`.
- Validate extension: only `.mp3`, `.wav`. Reject with 400 `DomainError(code="invalid_extension")`.
- Validate content-type header: `audio/mpeg`, `audio/wav`, `audio/x-wav`. Reject with 400.
- **Size validation via streaming:** `file.size` is unreliable for multipart (may be `None`). Stream chunks to disk, count bytes, abort and delete partial file if count exceeds 500 MB:
  ```python
  total = 0
  max_bytes = 500 * 1024 * 1024
  hasher = hashlib.sha256()
  with open(dest_path, "wb") as f:
      async for chunk in file:
          total += len(chunk)
          if total > max_bytes:
              dest_path.unlink(missing_ok=True)
              raise DomainError(code="file_too_large", status_code=413, ...)
          hasher.update(chunk)
          f.write(chunk)
  size_bytes = total
  content_sha256 = hasher.hexdigest()
  ```
- Dedup check: if a `Call` with same `content_sha256` exists and `status == "done"`, return 409 with existing `call_id`.
- Set `original_filename = file.filename`, `size_bytes = total`.
- Insert `Call(status="pending", filename=filename, original_filename=file.filename, size_bytes=size_bytes, content_sha256=content_sha256, ...)`.
- Enqueue `process_call.delay(call.id)`, save `call.celery_task_id`.
- Return `202 {"call_id": call.id}`.

No special uvicorn flags needed — streaming `UploadFile` bypasses starlette's in-memory body limit.

#### `GET /api/calls`

Query params:
- `search: str | None` — ILIKE on `Call.title` and `Client.name`.
- `tag: str | None` — filter by tag name (join `CallTag → Tag`).
- `assigned: Literal["all", "assigned", "unassigned"] = "all"`.
- `client_id: int | None`.
- `sort: Literal["date", "title", "duration", "status"] = "date"`.
- `order: Literal["asc", "desc"] = "desc"`.
- `limit: int = 50` (max 200).
- `offset: int = 0`.

Returns `list[CallSummary]`. `CallSummary.client_name` computed via join. `CallSummary.cost_usd_total` via join to `Analysis`.

`CallSummary` doesn't have `cost_usd_total` yet in the existing schema — add it (optional float).

#### `GET /api/calls/{id}`

Returns `CallDetail`. Eager load: `transcript.segments`, `insights`, `action_items`, `analysis`, `call_tags.tag`. 404 if not found.

`CallDetail.segments` sorted by `idx`. `CallDetail.client_name` from join. Tags include `source` field from `CallTag.source`.

#### `GET /api/calls/{id}/status`

Returns `CallStatusOut(status, progress_step, error_message)`.

`progress_step` mapping:
```
pending       → 0
transcribing  → 1
analyzing     → 2  (but UI shows multiple steps — let frontend map)
done          → 5
failed        → -1
```

Actually, the PRD says "5 visible UI steps (Decoding/Transcribing/Identifying/Analyzing/Extracting)". Map:
```
pending       → step 0
transcribing  → step 1  (Decoding + Transcribing)
analyzing     → step 3  (Identifying + Analyzing)
done          → step 5
failed        → step -1
```

#### `PATCH /api/calls/{id}`

Body: `CallUpdate(client_id, title)`. Returns updated `CallDetail`.

#### `PATCH /api/calls/{id}/tags`

Body: `TagOverrideRequest(tag_ids: list[int])`. Full-replace semantics:
- Delete all `CallTag` where `call_id = id`.
- Insert `CallTag(call_id, tag_id, source="user")` for each `tag_id`.
- Returns updated `CallDetail`.

#### `DELETE /api/calls/{id}`

Cascade deletes via FK (`ondelete="CASCADE"`). Returns 204. Deletes audio file from disk (`AUDIO_STORAGE_DIR / call.filename`) — catch `FileNotFoundError` and continue (file may already be gone).

#### `POST /api/calls/bulk-delete`

Body: `{ids: list[int]}`. DELETE WHERE `Call.id IN (ids)`. Returns `{deleted: int}`. Audio files deleted from disk similarly.

**Router order matters:** Register `POST /api/calls/bulk-delete` before `GET /api/calls/{id}` to avoid path collision with FastAPI routing.

#### `GET /api/calls/{id}/export`

Returns JSON download:
```json
{
  "call": { ...CallDetail fields... },
  "transcript": { "segments": [...] },
  "tags": [{"name": ..., "source": ..., "color": ...}],
  "insights": [...],
  "action_items": [...],
  "analysis": {...},
  "exported_at": "ISO datetime"
}
```

As `JSONResponse` with header `Content-Disposition: attachment; filename="call-{id}-export.json"`.

---

### `app/api/clients.py`

```
GET    /api/clients         → list[ClientOut]
POST   /api/clients         → ClientOut (201)
GET    /api/clients/{id}    → ClientOut (with recent_calls: list[CallSummary])
```

`ClientOut` computed fields:
- `calls`: COUNT of `Call.client_id = client.id`
- `last_call`: MAX `Call.created_at` for that client
- `sentiment`: most common `Analysis.overall_sentiment` among the client's done calls (or None)

`GET /api/clients/{id}` returns extended schema `ClientDetail(ClientOut + recent_calls: list[CallSummary])` — last 10 calls ordered by `created_at desc`.

---

### `app/api/tags.py`

```
GET /api/tags    → list[TagOut]
```

Returns all tags (system + user-created), ordered by `is_system DESC, name ASC`.

---

### `app/api/dashboard.py`

```
GET /api/dashboard    → DashboardOut
```

All aggregations are SQL queries — no per-row Python loops.

- `calls_this_week`: COUNT calls `created_at >= current_week_start`. Delta vs prior week.
- `avg_sentiment`: percent positive calls last 30 days. Delta vs prior 30 days. (0.0–1.0 float)
- `conversion_rate`: placeholder `{value: 0.0, delta: null}` — no data to compute.
- `talk_listen_ratio`: AVG `Analysis.talk_ratio_rep` across done calls last 30 days.
- `sentiment_trend`: 12 weeks × positive/neutral/negative counts. `week` field = ISO week string (`"2025-W01"`).
- `calls_per_day`: 14 days. `date` field = ISO date string.
- `pipeline`: GROUP BY `Call.status`, return stage counts.
- `top_pain_points`: SELECT `Insight.text`, `kind="pain-point"`, GROUP BY text, ORDER BY SUM(weight) DESC, LIMIT 10.

---

### `app/api/taxonomy.py`

```
GET /api/taxonomy/emotions      → list[{name: str, color: str}]
GET /api/taxonomy/highlights    → list[{name: str, label: str}]
```

Hard-coded Python lists matching the values in the existing frontend's `scripts/data.js`. These exist so the frontend can drop its hardcoded copies.

Emotions: `["positive", "neutral", "negative", "frustrated", "enthusiastic", "confused", "concerned"]` with hex colors.

Highlights: same set as `InsightKind` values with human-readable labels.

---

## Error Model

Every 4xx/5xx from a business endpoint returns:
```json
{"error": {"code": "string", "message": "string", "details": null}}
```

Already wired via `app/core/errors.py` exception handlers. No changes needed — just raise `DomainError` and let the handler format it.

---

## Cost-Protection Middleware (`app/api/middleware.py`)

All middleware is **env-gated** — when `AUTH_ENABLED=False` (default), none of the checks apply.

### API-key check

`APIKeyMiddleware(BaseHTTPMiddleware)`:
- Applies to `path.startswith("/api/")` and `path != "/api/health"`.
- Check `request.headers.get("X-API-Key")` vs `secrets.compare_digest(settings.API_KEY, provided)`.
- On mismatch: return `JSONResponse(401, {"error": {"code": "unauthorized", ...}})`.
- `AUTH_ENABLED=False` or `API_KEY=""`: pass through.

### Redis key namespace

All Phase 5 Redis keys use distinct prefixes. Never collide with Celery internals or Phase 4 token bucket:

```
spend:{YYYY-MM-DD}     → BudgetGuard reads; Phase 4 pipeline writes via INCRBYFLOAT + EXPIRE 48h
ratelimit:{ip}:{date}:{hour}  → RateLimitMiddleware
bucket:*               → Phase 4 RedisBucket (never touch from Phase 5)
celery*, _kombu*       → Celery internals (never touch)
```

### Budget circuit breaker

`BudgetGuard` — a FastAPI `Depends` dependency on `POST /api/calls`:
- `redis_client.get(f"spend:{date.today().isoformat()}")` → parse as float (may be `None` → treat as 0.0).
- If ≥ `settings.DAILY_BUDGET_USD`: raise `DomainError(code="budget_exceeded", status_code=429)`.
- Budget is written by the Phase 4 pipeline task via `INCRBYFLOAT spend:{date} {cost_total}` with 48h TTL.
- `BudgetGuard` runs even if `AUTH_ENABLED=False`, as long as `DAILY_BUDGET_USD > 0`.

Wait — PRD says "All four levers are independent — `BudgetGuard` and rate-limiter run even if `AUTH_ENABLED=false` *if* their env vars are set". So `BudgetGuard` runs if `DAILY_BUDGET_USD > 0`.

### Per-IP rate limit

`RateLimitMiddleware(BaseHTTPMiddleware)` or a dependency on `POST /api/calls`:
- Key: `ratelimit:{client_ip}:{date}:{hour}`.
- `redis_client.incr(key)`, set TTL 3600 if new key.
- If count > `settings.RATE_LIMIT_UPLOADS_PER_HOUR`: return 429.
- Applies only to `POST /api/calls`.

### CORS lock

When `AUTH_ENABLED=True`, `allow_origins` in `CORSMiddleware` reads from `settings.allowed_origins_list` instead of `["*"]`. Already implemented in `main.py` — CORS uses `settings.allowed_origins_list` which parses `ALLOWED_ORIGINS` env var. No wildcard fallback — correct as-is.

### Mount order in `main.py`

```python
# middleware (before routers)
if settings.AUTH_ENABLED:
    app.add_middleware(APIKeyMiddleware)   # excludes OPTIONS (see §CORS below)
app.add_middleware(RateLimitMiddleware)    # noop unless RATE_LIMIT_UPLOADS_PER_HOUR > 0

# routers
app.include_router(calls_router, prefix="/api")
app.include_router(clients_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(taxonomy_router, prefix="/api")
```

**CORS + APIKeyMiddleware ordering:** Starlette adds middleware outermost-last, so `APIKeyMiddleware` added after `CORSMiddleware` wraps the app *before* CORS headers are set. CORS `OPTIONS` preflight requests will get 401 responses without CORS headers — browsers will reject them.

Fix: `APIKeyMiddleware` must check `request.method != "OPTIONS"` before validating the header. Return the request as-is for OPTIONS so CORS middleware can handle it:

```python
async def dispatch(self, request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api/"):
        return await call_next(request)
    # ... key check
```

---

## OpenAPI

Every endpoint decorated with:
```python
@router.get("/calls", summary="List calls", response_model=list[CallSummary], ...)
```

Include `responses={404: {"description": "Not found"}}` where applicable. Use `openapi_extra` or `Body(example=...)` for example payloads on POST endpoints.

---

## Testing Plan (`backend/tests/api/`)

### `conftest.py`

Use a **Postgres testcontainer** (via `testcontainers-python`) for all API tests — no SQLite fallback. This is necessary because `Analysis.cost_usd_breakdown` is JSONB, the list endpoint uses ILIKE, and the dashboard uses SQL aggregations — all of which behave differently or fail on SQLite.

```python
@pytest.fixture(scope="session")
def pg_url():
    with PostgresContainer("postgres:16") as pg:
        yield pg.get_connection_url().replace("postgresql://", "postgresql+asyncpg://")

@pytest.fixture
async def client(pg_url, tmp_path):
    # Override DATABASE_URL → pg_url, AUDIO_STORAGE_DIR → tmp_path
    # Run alembic upgrade head against test DB
    # Yield AsyncClient(app=app, base_url="http://test")
    # Run alembic downgrade base after test
```

Mock `process_call.delay` at import path `app.api.calls.process_call` (patch where it's imported and called, not where it's defined).

### `test_calls.py`

- Upload happy path: POST multipart → 202, `call_id` in response. Assert `Call.status == "pending"` in DB. Mock `process_call.delay` at `app.api.calls.process_call` so no real Celery call.
- Upload rejects bad extension (`.mp4`) → 400.
- Upload rejects oversized (mock file size > 500MB) → 413.
- List: create 3 calls, GET /api/calls → returns all 3.
- List with `search`: only matching calls returned.
- List with `tag`: only tagged calls returned.
- Detail: GET /api/calls/{id} returns full `CallDetail` shape.
- Detail 404: GET /api/calls/99999 → 404.
- Tag override: PATCH /api/calls/{id}/tags with `{tag_ids: [1]}` → `source == "user"`.
- Bulk-delete: POST /api/calls/bulk-delete `{ids: [1,2]}` → `{deleted: 2}`.
- Export: GET /api/calls/{id}/export → 200, Content-Disposition header set.

### `test_clients.py`

- POST client → 201.
- GET clients list → includes computed `calls` count.
- GET client detail → includes `recent_calls`.

### `test_dashboard.py`

- GET /api/dashboard → 200, all keys present, `sentiment_trend` has 12 entries.

### `test_middleware.py`

- `AUTH_ENABLED=false` → all routes accessible without X-API-Key.
- `AUTH_ENABLED=true`, missing key → 401.
- Budget exceeded → 429 with `code="budget_exceeded"`.
- Rate limit exceeded → 429 with `code="rate_limited"`.

---

## Schema additions needed

`CallSummary` needs `cost_usd_total: float | None` — add via join to `Analysis` in the list query. Already defined in `app/schemas/call.py`.

`AnalysisOut.cost_usd_breakdown` should be `dict[str, float]` (not the fixed `CostBreakdown` model) — the breakdown is open-ended (Phase 4 may add new stage keys like `reanchor`). Update `app/schemas/call.py`:
```python
cost_usd_breakdown: dict[str, float]
```

`ClientDetail` (new, not in existing schemas):
```python
class ClientDetail(ClientOut):
    recent_calls: list[CallSummary] = []
```

---

## Edge Cases

- `POST /api/calls` with `client_id` that doesn't exist → 404 `DomainError(code="client_not_found")`.
- `POST /api/clients` with duplicate name → 409 `DomainError(code="client_exists")` (catch `IntegrityError`).
- `PATCH /api/calls/{id}/tags` with non-existent `tag_id` → 404.
- `GET /api/dashboard` with no calls in DB → all counts 0, empty lists.
- `GET /api/calls/{id}/export` for a `pending` call → 200 with empty segments/insights/analysis=null (call is in progress, export what's available).
- Bulk-delete with IDs that don't exist → silently skip, return actual deleted count.
- `POST /api/calls/bulk-delete` router must be registered before `GET /api/calls/{id}` to avoid path shadowing.
