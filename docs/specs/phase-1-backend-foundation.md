# Phase 1: Backend Foundation — Technical Specification

## Goal

Stand up the runnable backend shell: FastAPI app, async SQLAlchemy session factory, Alembic config, Celery app + Redis broker, settings via `pydantic-settings`, Dockerfiles for `api` and `worker`, and `docker-compose.yml` for all services.

## File Scope

- `backend/`
- `docker/`
- `alembic/`

## Directory Layout

```
backend/
  pyproject.toml
  uv.lock
  .dockerignore
  alembic/
    alembic.ini
    env.py
    versions/            # empty for now
  app/
    __init__.py
    main.py              # FastAPI app + CORS + routers + exception handlers
    celery_app.py        # Celery instance
    core/
      __init__.py
      config.py          # Settings(BaseSettings)
      db.py              # engine, async_session_maker, get_session
      errors.py          # DomainError, error-envelope handlers
    tasks/
      __init__.py        # empty stub — celery autodiscover needs this
    api/
      __init__.py        # empty stub — Phase 5 populates this
docker/
  api.Dockerfile
  worker.Dockerfile
.env.example
docker-compose.yml
```

## Data Structures

### Settings (`app/core/config.py`)

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str
    OPENAI_API_KEY: str
    AUDIO_STORAGE_DIR: str = "./storage/audio"

    # Per-stage model overrides
    LLM_MODEL_TAGGING: str = "gpt-4o-mini"
    LLM_MODEL_MOOD: str = "gpt-4o-mini"
    LLM_MODEL_INSIGHTS: str = "gpt-4o-mini"
    LLM_MODEL_SYNTHESIS: str = "gpt-4.1-mini"
    STT_MODEL: str = "gpt-4o-transcribe-diarize"

    # Cost protection (env-gated)
    AUTH_ENABLED: bool = False
    API_KEY: str = ""
    DAILY_BUDGET_USD: float = 10.0
    RATE_LIMIT_UPLOADS_PER_HOUR: int = 10
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]
```

### Database (`app/core/db.py`)

```python
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

### Celery (`app/celery_app.py`)

```python
celery_app = Celery(
    "altur",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.config_from_object({
    "task_serializer": "json",
    "result_serializer": "json",
    "accept_content": ["json"],
    "task_track_started": True,
    "worker_concurrency": 4,
})
celery_app.autodiscover_tasks(["app.tasks"])
```

### Error Envelope (`app/core/errors.py`)

The global error shape — defined here so Phase 5 doesn't have to retrofit:

```python
class DomainError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

# FastAPI exception handlers registered in main.py:
# ValidationError  → 422 {"error": {"code": "validation_error", "message": ..., "details": [...]}}
# DomainError      → status_code {"error": {"code": ..., "message": ..., "details": null}}
# Exception        → 500 {"error": {"code": "internal_error", "message": "An unexpected error occurred", "details": null}}
```

### FastAPI App (`app/main.py`)

```python
app = FastAPI(title="Altur API", version="0.1.0")
# CORS: always use settings.allowed_origins_list (covers both dev and AUTH_ENABLED=true)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Routers mount under /api prefix — /health stays at root (not shadowed by proxy)
# app.include_router(calls_router, prefix="/api")  ← Phase 5 adds these
# app.include_router(clients_router, prefix="/api")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

## Implementation Steps

### 1. `backend/pyproject.toml`

Use `uv` as the package manager. Key dependencies:
- `fastapi>=0.115`, `uvicorn[standard]>=0.30`
- `sqlalchemy[asyncio]>=2.0`, `asyncpg>=0.29`, `alembic>=1.13`
- `celery[redis]>=5.4`, `redis>=5.0`
- `pydantic-settings>=2.3`, `python-multipart>=0.0.9`
- `openai>=1.50`

Dev/test deps:
- `pytest>=8`, `pytest-asyncio>=0.23`, `httpx>=0.27`, `aiosqlite>=0.20`

### 2. Settings (`app/core/config.py`)

- `BaseSettings` with `env_file=".env"`.
- `@lru_cache` on a `get_settings()` factory for FastAPI `Depends`.
- Expose `settings = get_settings()` as module-level singleton for Celery (no DI there).

### 3. Database (`app/core/db.py`)

- `create_async_engine` with `DATABASE_URL` from settings. Include `pool_pre_ping=True` to handle stale connections after container restarts.
- `async_sessionmaker` with `expire_on_commit=False` (safe in async context).
- `get_session` as an `AsyncGenerator` FastAPI dependency.
- `Base = DeclarativeBase()` lives in `app/core/db.py` for now; Phase 3 models import from here. (This keeps the engine and base co-located, which is clean enough at MVP scale.)

### 4. FastAPI App (`app/main.py`)

- CORS: `allow_origins=["http://localhost:5173"]` in dev. When `AUTH_ENABLED=true`, swap to `settings.allowed_origins_list`.
- Health endpoint: `GET /health → {"status": "ok"}`.
- Global exception handler stubs (concrete handlers added in Phase 5).
- Startup event: `AUDIO_STORAGE_DIR` directory creation (`Path(...).mkdir(parents=True, exist_ok=True)`).

### 5. Celery App (`app/celery_app.py`)

- Import `settings` at module level (not via FastAPI DI).
- `autodiscover_tasks(["app.tasks"])` — Phase 4 will populate this package.
- `task_track_started=True` so `Call.status=transcribing` matches visible Celery state.

### 6. Alembic

- Location: `backend/alembic/` (NOT repo root) so `cd backend && alembic upgrade head` resolves `from app.core.db import Base` naturally.
- `env.py`: import `Base` from `app.core.db`, set `target_metadata = Base.metadata`.
- Async migration runner pattern — **spell it out**:
  ```python
  # env.py (async section)
  def do_run_migrations(connection: Connection) -> None:
      context.configure(connection=connection, target_metadata=target_metadata)
      with context.begin_transaction():
          context.run_migrations()

  async def run_async_migrations() -> None:
      connectable = create_async_engine(settings.DATABASE_URL)
      async with connectable.connect() as connection:
          await connection.run_sync(do_run_migrations)
      await connectable.dispose()
  ```
- Alembic also needs a sync URL for offline mode — add `psycopg[binary]` to deps and in env.py rewrite the URL: `settings.DATABASE_URL.replace("+asyncpg", "+psycopg")` for the synchronous offline migration path.
- `alembic.ini`: `script_location = alembic`, `sqlalchemy.url` left empty — env.py reads from `settings.DATABASE_URL`.

### 7. Dockerfiles

**`docker/api.Dockerfile`** (multi-stage):
```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install uv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`docker/worker.Dockerfile`** — same base, different CMD:
```dockerfile
CMD ["celery", "-A", "app.celery_app", "worker", "--loglevel=info", "--concurrency=4"]
```

### 8. `docker-compose.yml`

**Phase 1 owns the entire `docker-compose.yml`** including the `frontend` service definition. Phase 2 only creates `frontend/Dockerfile` and `frontend/nginx.conf`; it does NOT touch compose.

Services: `db` (postgres:16-alpine), `redis` (redis:7-alpine), `api`, `worker`, `frontend`.

Concrete healthchecks:
- `db`: `pg_isready -U $${POSTGRES_USER:-postgres}`
- `redis`: `redis-cli ping`
- `api`: `curl -f http://localhost:8000/health || exit 1` (interval 10s, retries 5, start_period 10s)
- `worker`: no healthcheck (celery inspect ping is too slow for compose startup — note this trade-off in compose comment)

Volumes: named `postgres_data`, bind mount `./storage/audio:/app/storage/audio` on api and worker. `AUDIO_STORAGE_DIR=/app/storage/audio` must match the container-side path.

`api` and `worker` wait on `db` and `redis` via `depends_on: {condition: service_healthy}`.

Environment file: `env_file: .env` on api and worker. Provide `.env.example` with all keys including `VITE_API_BASE_URL` (frontend build arg).

Port table (document in compose comments):
- `db`: 5432 (internal only)
- `redis`: 6379 (internal only)
- `api`: 8000 → 8000
- `frontend`: 80 → 5173 (nginx in compose), dev server on host at 5173

**Phase 1 also creates:** root `.gitignore` including `backend/.venv`, `backend/__pycache__`, `frontend/node_modules`, `frontend/dist`, `storage/audio/*.wav`, `storage/audio/*.mp3`, `.env`.

## Edge Cases

- `DATABASE_URL` with `+asyncpg` driver — Alembic needs the sync URL for migrations (swap `+asyncpg` → `+psycopg2` or use `asyncpg` runner). Use the async migration runner pattern so Alembic can use the same asyncpg engine.
- `audio_storage_dir` creation at startup must be idempotent (`exist_ok=True`).
- Celery broker URL must use `redis://` not `rediss://` (no TLS in compose).
- Worker container needs the same `PYTHONPATH` as the api container so `app.*` imports resolve.

## Testing Plan

This phase has no unit tests — DoD is verified by compose smoke tests:
1. `docker compose up` → all 4 services (db, redis, api, worker) reach healthy state.
2. `curl localhost:8000/health` → `{"status":"ok"}`.
3. `celery -A app.celery_app inspect ping` → pong from worker.
4. `alembic upgrade head` runs cleanly (no tables yet — migrations added in Phase 3).

A minimal `pytest` smoke test can be added later in Phase 5; this phase focuses on structural correctness.
