"""
End-to-end pipeline tests using in-memory SQLite + fake providers.
No real OpenAI calls, no real DB or Redis connections.
"""

from __future__ import annotations

import os

# Set required env vars before any app imports attempt to read them
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("OPENAI_API_KEY", "sk-fake-key-for-tests")
os.environ.setdefault("AUDIO_STORAGE_DIR", "/tmp/test-audio")

from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Register JSONB → JSON compiler shim so SQLite accepts the schema
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")  # type: ignore[misc]
def _jsonb_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "JSON"


from app.core.db import Base  # noqa: E402
from app.core.errors import DomainError  # noqa: E402
from app.llm.schemas.insights import ExtractedActionItem, ExtractedInsight, InsightExtraction  # noqa: E402
from app.llm.schemas.mood import MoodLabels, SegmentMood  # noqa: E402
from app.llm.schemas.synthesis import Synthesis  # noqa: E402
from app.llm.schemas.tags import TagSuggestion  # noqa: E402
from app.models.analysis import Analysis  # noqa: E402
from app.models.call import Call  # noqa: E402
from app.models.insight import Insight  # noqa: E402
from app.models.tag import CallTag  # noqa: E402
from app.models.transcript import Transcript, TranscriptSegment  # noqa: E402
from app.providers.base import (  # noqa: E402
    DiarizedSegment,
    DiarizedTranscript,
    LLMResult,
    LLMUsage,
    STTResult,
)
from app.tasks.process_call import _run_pipeline  # noqa: E402


# ---------------------------------------------------------------------------
# Fake providers
# ---------------------------------------------------------------------------


class FakeSTTProvider:
    async def transcribe(self, path: Path, language: str | None = None) -> STTResult:
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
            usage=LLMUsage(
                prompt_tokens=0,
                completion_tokens=0,
                model="fake-stt",
                cost_usd=0.001,
            ),
        )


class FakeSTTProviderFailure:
    async def transcribe(self, path: Path, language: str | None = None) -> STTResult:
        raise DomainError("stt_error", "Fake STT failure", 500)


class FakeLLMProviderFailure:
    async def complete_structured(
        self,
        prompt: str,
        schema: type,
        model: str,
        system_prompt: str | None = None,
    ) -> LLMResult:
        raise DomainError("llm_error", "Fake LLM failure", 500)


class FakeLLMProvider:
    def __init__(self) -> None:
        self.calls: list[tuple[str, type, str]] = []

    async def complete_structured(
        self,
        prompt: str,
        schema: type,
        model: str,
        system_prompt: str | None = None,
    ) -> LLMResult:
        self.calls.append((prompt, schema, model))

        if schema is MoodLabels:
            parsed = MoodLabels(segments=[SegmentMood(idx=0, mood="positive"), SegmentMood(idx=1, mood="neutral")])
        elif schema is TagSuggestion:
            parsed = TagSuggestion(tags=["discovery"])
        elif schema is InsightExtraction:
            parsed = InsightExtraction(
                insights=[
                    ExtractedInsight(
                        kind="buying-signal",
                        text="Client expressed interest",
                        segment_idx=1,
                        weight=1.5,
                    )
                ],
                action_items=[
                    ExtractedActionItem(text="Send proposal", owner="rep", due_date=None)
                ],
            )
        elif schema is Synthesis:
            parsed = Synthesis(
                headline="Positive discovery call with interested client",
                summary="The call went well. Client showed buying signals. Rep should send proposal. No blockers identified. Follow-up agreed.",
                overall_sentiment="positive",
                language="en",
            )
        else:
            parsed = schema()  # type: ignore[call-arg]

        return LLMResult(
            parsed=parsed,
            usage=LLMUsage(
                prompt_tokens=10,
                completion_tokens=10,
                model=model,
                cost_usd=0.001,
            ),
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def call_row(db_session_factory):
    async with db_session_factory() as session:
        call = Call(
            title="Test Call",
            filename="test.mp3",
            original_filename="test.mp3",
            content_type="audio/mpeg",
            size_bytes=1024,
            status="pending",
            language="en",
        )
        session.add(call)
        await session.commit()
        await session.refresh(call)
        return call.id


def _make_fake_redis() -> MagicMock:
    redis_mock = MagicMock()
    redis_mock.incrbyfloat = AsyncMock(return_value=1.0)
    redis_mock.expire = AsyncMock(return_value=True)
    redis_mock.script_load = AsyncMock(return_value="fake-sha")
    redis_mock.evalsha = AsyncMock(return_value=1)
    return redis_mock


def _make_fake_bucket() -> MagicMock:
    bucket = MagicMock()
    bucket.acquire = AsyncMock(return_value=None)
    return bucket


def _make_audio_file(tmp_path: Path) -> Path:
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "test.mp3"
    audio_file.write_bytes(b"fake audio data")
    return audio_dir


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path(db_session_factory, call_row, tmp_path, monkeypatch):
    audio_dir = _make_audio_file(tmp_path)
    monkeypatch.setattr("app.core.config.settings.AUDIO_STORAGE_DIR", str(audio_dir))

    fake_stt = FakeSTTProvider()
    fake_llm = FakeLLMProvider()
    redis_mock = _make_fake_redis()
    bucket = _make_fake_bucket()

    await _run_pipeline(
        call_id=call_row,
        session_factory=db_session_factory,
        redis_client=redis_mock,
        stt_provider=fake_stt,
        llm_provider=fake_llm,
        bucket=bucket,
        task_self=MagicMock(),
    )

    from sqlalchemy import select

    async with db_session_factory() as session:
        call = await session.get(Call, call_row)
        assert call is not None
        assert call.status == "done", f"Expected 'done', got '{call.status}'"

        transcript_result = await session.execute(
            select(Transcript).where(Transcript.call_id == call_row)
        )
        transcript = transcript_result.scalar_one_or_none()
        assert transcript is not None

        seg_result = await session.execute(
            select(TranscriptSegment).where(TranscriptSegment.transcript_id == transcript.id)
        )
        segments = seg_result.scalars().all()
        assert len(segments) >= 1

        tag_result = await session.execute(
            select(CallTag).where(CallTag.call_id == call_row)
        )
        call_tags = tag_result.scalars().all()
        assert len(call_tags) >= 1

        insight_result = await session.execute(
            select(Insight).where(Insight.call_id == call_row)
        )
        insights = insight_result.scalars().all()
        assert len(insights) >= 1

        analysis_result = await session.execute(
            select(Analysis).where(Analysis.call_id == call_row)
        )
        analysis = analysis_result.scalar_one_or_none()
        assert analysis is not None
        assert float(analysis.cost_usd_total) > 0

        from app.core.config import settings
        assert analysis.llm_model_used == settings.LLM_MODEL_SYNTHESIS


@pytest.mark.asyncio
async def test_stt_failure_sets_failed_status(db_session_factory, call_row, tmp_path, monkeypatch):
    audio_dir = _make_audio_file(tmp_path)
    monkeypatch.setattr("app.core.config.settings.AUDIO_STORAGE_DIR", str(audio_dir))

    fake_stt = FakeSTTProviderFailure()
    fake_llm = FakeLLMProvider()
    redis_mock = _make_fake_redis()
    bucket = _make_fake_bucket()

    await _run_pipeline(
        call_id=call_row,
        session_factory=db_session_factory,
        redis_client=redis_mock,
        stt_provider=fake_stt,
        llm_provider=fake_llm,
        bucket=bucket,
        task_self=MagicMock(),
    )

    from sqlalchemy import select

    async with db_session_factory() as session:
        call = await session.get(Call, call_row)
        assert call is not None
        assert call.status == "failed"
        assert call.error_message is not None
        assert len(call.error_message) > 0

        transcript_result = await session.execute(
            select(Transcript).where(Transcript.call_id == call_row)
        )
        transcript = transcript_result.scalar_one_or_none()
        assert transcript is None


@pytest.mark.asyncio
async def test_llm_model_env_override(db_session_factory, call_row, tmp_path, monkeypatch):
    audio_dir = _make_audio_file(tmp_path)
    monkeypatch.setattr("app.core.config.settings.AUDIO_STORAGE_DIR", str(audio_dir))
    monkeypatch.setattr("app.core.config.settings.LLM_MODEL_TAGGING", "gpt-4.1-mini")

    fake_stt = FakeSTTProvider()
    fake_llm = FakeLLMProvider()
    redis_mock = _make_fake_redis()
    bucket = _make_fake_bucket()

    await _run_pipeline(
        call_id=call_row,
        session_factory=db_session_factory,
        redis_client=redis_mock,
        stt_provider=fake_stt,
        llm_provider=fake_llm,
        bucket=bucket,
        task_self=MagicMock(),
    )

    from sqlalchemy import select

    async with db_session_factory() as session:
        call = await session.get(Call, call_row)
        assert call is not None
        assert call.status == "done"

        analysis_result = await session.execute(
            select(Analysis).where(Analysis.call_id == call_row)
        )
        analysis = analysis_result.scalar_one_or_none()
        assert analysis is not None

        from app.core.config import settings
        assert analysis.llm_model_used == settings.LLM_MODEL_SYNTHESIS

    tag_calls = [(prompt, schema, model) for prompt, schema, model in fake_llm.calls if schema is TagSuggestion]
    assert len(tag_calls) >= 1
    _, _, model_used = tag_calls[0]
    assert model_used == "gpt-4.1-mini", f"Expected 'gpt-4.1-mini', got '{model_used}'"


@pytest.mark.asyncio
async def test_status_transitions(db_session_factory, call_row, tmp_path, monkeypatch):
    """Status must progress: transcribing → analyzing → done (in that order)."""
    audio_dir = _make_audio_file(tmp_path)
    monkeypatch.setattr("app.core.config.settings.AUDIO_STORAGE_DIR", str(audio_dir))

    fake_stt = FakeSTTProvider()
    fake_llm = FakeLLMProvider()
    redis_mock = _make_fake_redis()
    bucket = _make_fake_bucket()

    recorded_statuses: list[str] = []

    async def recording_set_status(session_factory, call_id, status, error_message=None):
        recorded_statuses.append(status)
        from app.tasks import process_call as pc_module
        await pc_module._real_set_status(session_factory, call_id, status, error_message)

    import app.tasks.process_call as pc_module

    # Save the original and patch
    pc_module._real_set_status = pc_module._set_status
    monkeypatch.setattr("app.tasks.process_call._set_status", recording_set_status)

    await _run_pipeline(
        call_id=call_row,
        session_factory=db_session_factory,
        redis_client=redis_mock,
        stt_provider=fake_stt,
        llm_provider=fake_llm,
        bucket=bucket,
        task_self=MagicMock(),
    )

    assert recorded_statuses == ["transcribing", "analyzing", "done"], (
        f"Unexpected status sequence: {recorded_statuses}"
    )


@pytest.mark.asyncio
async def test_llm_failure_sets_failed_status(db_session_factory, call_row, tmp_path, monkeypatch):
    """A DomainError from any LLM stage must set status=failed and leave no Analysis row."""
    audio_dir = _make_audio_file(tmp_path)
    monkeypatch.setattr("app.core.config.settings.AUDIO_STORAGE_DIR", str(audio_dir))

    fake_stt = FakeSTTProvider()
    fake_llm = FakeLLMProviderFailure()
    redis_mock = _make_fake_redis()
    bucket = _make_fake_bucket()

    await _run_pipeline(
        call_id=call_row,
        session_factory=db_session_factory,
        redis_client=redis_mock,
        stt_provider=fake_stt,
        llm_provider=fake_llm,
        bucket=bucket,
        task_self=MagicMock(),
    )

    from sqlalchemy import select

    async with db_session_factory() as session:
        call = await session.get(Call, call_row)
        assert call is not None
        assert call.status == "failed", f"Expected 'failed', got '{call.status}'"
        assert call.error_message is not None and len(call.error_message) > 0

        # Transcript may or may not exist depending on which stage failed — that's fine.
        # But no Analysis row must be present.
        analysis_result = await session.execute(
            select(Analysis).where(Analysis.call_id == call_row)
        )
        analysis = analysis_result.scalar_one_or_none()
        assert analysis is None, "Analysis row must not exist after LLM failure"
