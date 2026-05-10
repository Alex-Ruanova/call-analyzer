
from __future__ import annotations

import asyncio
import logging
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.celery_app import celery_app
from app.core.config import settings
from app.core.errors import DomainError
from app.core.storage import get_audio_storage
from app.models.call import Call
from app.providers.dependencies import get_llm_provider, get_stt_provider
from app.services.pipeline import (
    RedisBucket,
    insight_stage,
    mood_stage,
    synthesis_stage,
    tag_stage,
    transcribe_stage,
    update_analysis_cost,
)

logger = logging.getLogger(__name__)

INFRA_ERRORS = (OSError, ConnectionError)

try:
    import asyncpg.exceptions as _asyncpg_exc

    INFRA_ERRORS = INFRA_ERRORS + (_asyncpg_exc.PostgresConnectionError,)
except ImportError:
    pass

try:
    import redis.exceptions as _redis_exc

    INFRA_ERRORS = INFRA_ERRORS + (_redis_exc.ConnectionError,)
except ImportError:
    pass


@celery_app.task(
    bind=True,
    name="app.tasks.process_call",
    max_retries=3,
    default_retry_delay=30,
)
def process_call(self, call_id: int) -> None:
    try:
        asyncio.run(_run(self, call_id))
    except Exception as exc:
        # Guarantee status=failed is written even if _run_pipeline's own handler didn't fire
        logger.error("process_call(%s) unhandled exception: %s", call_id, exc, exc_info=True)
        _mark_failed_sync(call_id, str(exc)[:500])
        raise


def _mark_failed_sync(call_id: int, message: str) -> None:
    async def _do() -> None:
        engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            await _set_status(factory, call_id, "failed", message)
        finally:
            await engine.dispose()
    try:
        asyncio.run(_do())
    except Exception:
        logger.exception("Could not mark call %s as failed after task crash", call_id)


async def _run(task_self: object, call_id: int) -> None:
    # NullPool: prevents asyncpg from reusing connections across asyncio.run() calls.
    # Each task invocation gets a fresh engine and destroys it on completion.
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    redis_client = aioredis.from_url(settings.REDIS_URL)

    try:
        stt_provider = get_stt_provider()
        llm_provider = get_llm_provider()
        bucket = RedisBucket(redis_client, capacity=50, refill_per_sec=10.0)

        await _run_pipeline(
            call_id=call_id,
            session_factory=session_factory,
            redis_client=redis_client,
            stt_provider=stt_provider,
            llm_provider=llm_provider,
            bucket=bucket,
            task_self=task_self,
        )
    finally:
        await redis_client.aclose()
        await engine.dispose()


async def _delete_audio_for_call(
    session_factory: async_sessionmaker, call_id: int
) -> None:
    """Best-effort: remove the on-disk audio after the pipeline finishes."""
    async with session_factory() as session:
        call = await session.get(Call, call_id)
        if call is None or not call.filename:
            return
    try:
        await get_audio_storage().delete(call.filename)
    except Exception as exc:
        logger.warning("Could not delete audio for call %s: %s", call_id, exc)


async def _set_status(
    session_factory: async_sessionmaker,
    call_id: int,
    status: str,
    error_message: str | None = None,
    progress_step: int | None = None,
) -> None:
    async with session_factory() as session:
        call = await session.get(Call, call_id)
        if call is not None:
            call.status = status
            if error_message is not None:
                call.error_message = error_message[:500]
            if progress_step is not None:
                call.progress_step = progress_step
            await session.commit()


async def _set_progress(
    session_factory: async_sessionmaker,
    call_id: int,
    step: int,
) -> None:
    async with session_factory() as session:
        call = await session.get(Call, call_id)
        if call is not None:
            call.progress_step = step
            await session.commit()


_RATIO_KEY = "transcription:ratios"
_RATIO_MAX_SAMPLES = 20


async def _record_transcription_ratio(
    redis_client: aioredis.Redis,
    duration: float | None,
    elapsed_seconds: float,
) -> None:
    if not duration or duration < 10 or elapsed_seconds < 1:
        return
    ratio = elapsed_seconds / duration
    await redis_client.lpush(_RATIO_KEY, str(ratio))
    await redis_client.ltrim(_RATIO_KEY, 0, _RATIO_MAX_SAMPLES - 1)
    await redis_client.expire(_RATIO_KEY, 60 * 60 * 24 * 30)


async def _run_pipeline(
    call_id: int,
    session_factory: async_sessionmaker,
    redis_client: aioredis.Redis,
    stt_provider,
    llm_provider,
    bucket: RedisBucket,
    task_self: object,
) -> None:
    cost: dict[str, float] = {
        "stt": 0.0,
        "mood": 0.0,
        "tags": 0.0,
        "insights": 0.0,
        "synthesis": 0.0,
    }

    try:
        await _set_status(session_factory, call_id, "transcribing", progress_step=1)

        await bucket.acquire()
        stt_start = asyncio.get_running_loop().time()
        transcript, stt_cost, audio_duration = await transcribe_stage(
            call_id, session_factory, stt_provider, llm_provider
        )
        stt_elapsed = asyncio.get_running_loop().time() - stt_start
        cost["stt"] = stt_cost

        await _record_transcription_ratio(redis_client, audio_duration, stt_elapsed)

        # Step 2: transcript ready, about to run LLM analysis
        await _set_status(session_factory, call_id, "analyzing", progress_step=2)

        await bucket.acquire()
        cost["mood"] = await mood_stage(transcript.id, session_factory, llm_provider)

        # Step 3: mood done, now tagging + extracting insights
        await _set_progress(session_factory, call_id, 3)

        await bucket.acquire()
        cost["tags"] = await tag_stage(
            call_id, transcript.id, session_factory, llm_provider
        )

        await bucket.acquire()
        cost["insights"] = await insight_stage(
            call_id, transcript.id, session_factory, llm_provider
        )

        # Step 4: insights done, running final synthesis
        await _set_progress(session_factory, call_id, 4)

        await bucket.acquire()
        analysis, synthesis_cost = await synthesis_stage(
            call_id, transcript.id, session_factory, llm_provider
        )
        cost["synthesis"] = synthesis_cost

        await update_analysis_cost(analysis.id, cost, session_factory, redis_client)

        await _set_status(session_factory, call_id, "done", progress_step=5)

        # Audio is no longer needed after analysis completes — the transcript
        # carries everything downstream features consume. Drop the file to free
        # disk + reduce PII footprint. The Call.filename column is kept as a
        # historical reference; if a future reanalyze flow needs to re-STT,
        # bring back retention via TTL (see docs/improvements.md).
        await _delete_audio_for_call(session_factory, call_id)

    except DomainError as exc:
        logger.warning("DomainError for call %s: %s: %s", call_id, exc.code, exc.message)
        await _set_status(
            session_factory,
            call_id,
            "failed",
            f"{exc.code}: {exc.message}",
        )
        return

    except INFRA_ERRORS as exc:  # type: ignore[misc]
        logger.error("Infrastructure error for call %s: %s", call_id, exc)
        await _set_status(session_factory, call_id, "failed", str(exc))
        raise task_self.retry(exc=exc)  # type: ignore[union-attr]

    except Exception as exc:
        logger.error("Unexpected error for call %s: %s", call_id, exc)
        await _set_status(session_factory, call_id, "failed", str(exc))
        raise task_self.retry(exc=exc)  # type: ignore[union-attr]
