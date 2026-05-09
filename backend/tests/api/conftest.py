"""
API test conftest.

NOTE: testcontainers-python is not installed in this environment. Tests use SQLite
(via aiosqlite) as the test database. SQLite does not support JSONB or
PostgreSQL-specific SQL (date_trunc, generate_series). The conftest swaps JSONB
column types to JSON on table metadata before create_all.

Limitations:
- `GET /api/dashboard` is skipped because date_trunc/generate_series are Postgres-only.
- JSONB columns use JSON on SQLite.
"""
from __future__ import annotations

import os
from typing import AsyncGenerator
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set env vars BEFORE importing app modules that read settings at import time
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("AUDIO_STORAGE_DIR", "/tmp/test-audio-storage")

from app.core.config import settings
from app.core.db import Base, get_session
from app.main import app  # noqa: E402 — must import after env vars are set

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def _sqlite_safe_metadata(base: type) -> None:
    """Replace JSONB column types with JSON for SQLite compatibility."""
    for table in base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(scope="function")
async def client(tmp_path) -> AsyncGenerator[AsyncClient, None]:
    """Yield an AsyncClient backed by in-memory SQLite."""
    _sqlite_safe_metadata(Base)

    engine = create_async_engine(TEST_DB_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    original_audio_dir = settings.AUDIO_STORAGE_DIR
    settings.AUDIO_STORAGE_DIR = str(tmp_path)

    mock_task = MagicMock()
    mock_task.id = "mock-celery-task-id"
    mock_process_call = MagicMock()
    mock_process_call.delay = MagicMock(return_value=mock_task)

    with patch("app.api.calls.process_call", mock_process_call):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac

    app.dependency_overrides.clear()
    settings.AUDIO_STORAGE_DIR = original_audio_dir

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
