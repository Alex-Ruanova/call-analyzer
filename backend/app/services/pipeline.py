from __future__ import annotations

import asyncio
import logging
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.storage import get_audio_storage
from app.core.errors import DomainError
from app.llm.prompts import insights as insights_prompts
from app.llm.prompts import mood as mood_prompts
from app.llm.prompts import synthesis as synthesis_prompts
from app.llm.prompts import tags as tags_prompts
from app.llm.schemas.insights import InsightExtraction
from app.llm.schemas.mood import MoodLabels
from app.llm.schemas.synthesis import SYNTHESIS_VERSION, Synthesis
from app.llm.schemas.tags import TagSuggestion
from app.models.analysis import Analysis
from app.models.call import Call
from app.models.insight import Insight
from app.models.participant import Participant
from app.models.tag import Tag
from app.models.transcript import Transcript, TranscriptSegment
from app.providers.base import DiarizedSegment, DiarizedTranscript, LLMProvider, STTProvider
from app.llm.system_tags import SYSTEM_TAG_NAMES
logger = logging.getLogger(__name__)

_BUCKET_LUA = """
local key_tokens = KEYS[1]
local key_ts = KEYS[2]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local tokens = tonumber(redis.call('get', key_tokens) or capacity)
local last_ts = tonumber(redis.call('get', key_ts) or now)
local elapsed = now - last_ts
local refilled = math.min(capacity, tokens + elapsed * refill_rate)
if refilled < 1 then
    return 0
end
redis.call('set', key_tokens, refilled - 1, 'EX', 3600)
redis.call('set', key_ts, now, 'EX', 3600)
return 1
"""

_MAX_TRANSCRIPT_CHARS = 6000 * 4  # approx 6000 tokens at ~4 chars/token


class RedisBucket:
    """Token bucket for rate limiting — shared across all worker processes via Redis."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        capacity: int = 50,
        refill_per_sec: float = 10.0,
    ) -> None:
        self._redis = redis_client
        self._capacity = capacity
        self._refill_per_sec = refill_per_sec
        self._key_tokens = "bucket:openai:tokens"
        self._key_ts = "bucket:openai:ts"
        self._sha: str | None = None

    async def _get_sha(self) -> str:
        if self._sha is None:
            self._sha = await self._redis.script_load(_BUCKET_LUA)
        return self._sha

    async def acquire(self, tokens: int = 1) -> None:
        while True:
            sha = await self._get_sha()
            now = asyncio.get_running_loop().time()
            result = await self._redis.evalsha(
                sha,
                2,
                self._key_tokens,
                self._key_ts,
                str(self._capacity),
                str(self._refill_per_sec),
                str(now),
            )
            if result == 1:
                return
            await asyncio.sleep(0.1)


def _build_transcript_text(segments: list[TranscriptSegment]) -> str:
    full = "\n".join(f"[{s.idx}] {s.speaker_label}: {s.text}" for s in segments)
    return full[:_MAX_TRANSCRIPT_CHARS]


async def transcribe_stage(
    call_id: int,
    session_factory: async_sessionmaker[AsyncSession],
    stt_provider: STTProvider,
    llm_provider: LLMProvider,
) -> tuple[Transcript, float, float | None]:
    async with session_factory() as session:
        call = await session.get(Call, call_id)
        if call is None:
            raise DomainError("call_not_found", f"Call {call_id} not found", 404)

        total_cost = 0.0
        diarized: DiarizedTranscript

        async with get_audio_storage().local_path(call.filename) as audio_path:
            if not audio_path.exists():
                raise DomainError(
                    "stt_file_not_found",
                    f"Audio file not found: {audio_path}",
                    404,
                )

            # Persist duration early so the status endpoint can show an ETA
            # before the (potentially long) STT call completes.
            if call.duration_seconds is None:
                probed = await asyncio.get_running_loop().run_in_executor(
                    None, _probe_duration, audio_path
                )
                if probed is not None:
                    call.duration_seconds = probed
                    await session.commit()

            file_size = audio_path.stat().st_size
            if file_size > 24 * 1024 * 1024:
                diarized, chunk_cost = await _transcribe_chunked(
                    audio_path, call.language, stt_provider, llm_provider
                )
                total_cost += chunk_cost
            else:
                result = await stt_provider.transcribe(audio_path, call.language)
                diarized = result.transcript
                total_cost += result.usage.cost_usd

        review_flags = _flag_minor_speakers(diarized.segments)

        transcript = Transcript(
            call_id=call_id,
            language=diarized.language or call.language,
            raw_payload_json=diarized.raw_payload,
        )
        session.add(transcript)
        await session.flush()

        for idx, seg in enumerate(diarized.segments):
            segment = TranscriptSegment(
                transcript_id=transcript.id,
                idx=idx,
                start_seconds=seg.start,
                end_seconds=seg.end,
                speaker_label=seg.speaker,
                text=seg.text,
                needs_review=review_flags[idx],
            )
            session.add(segment)

        if call.duration_seconds is None:
            if diarized.duration_seconds is not None:
                call.duration_seconds = diarized.duration_seconds
            elif diarized.segments:
                # OpenAI's diarized_json response_format does not include a top-level
                # duration field; fall back to the latest segment end timestamp.
                call.duration_seconds = max(seg.end for seg in diarized.segments)

        await session.commit()
        await session.refresh(transcript)
        return transcript, total_cost, call.duration_seconds


async def _transcribe_chunked(
    audio_path: Path,
    language: str | None,
    stt_provider: STTProvider,
    llm_provider: LLMProvider,
) -> tuple[DiarizedTranscript, float]:
    silence_boundaries = _detect_silence(audio_path)
    chunk_intervals = _build_chunk_intervals(audio_path, silence_boundaries)

    total_cost = 0.0
    chunk_results: list[tuple[float, DiarizedTranscript]] = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        sem = asyncio.Semaphore(3)

        async def _transcribe_one(
            start: float, end: float, idx: int
        ) -> tuple[float, DiarizedTranscript, float]:
            chunk_path = Path(tmp_dir) / f"chunk_{idx}{audio_path.suffix}"
            _split_audio(audio_path, start, end, chunk_path)
            async with sem:
                result = await stt_provider.transcribe(chunk_path, language)
            return start, result.transcript, result.usage.cost_usd

        tasks = [
            _transcribe_one(start, end, i)
            for i, (start, end) in enumerate(chunk_intervals)
        ]
        results = await asyncio.gather(*tasks)

        for chunk_start, diarized, chunk_cost in results:
            chunk_results.append((chunk_start, diarized))
            total_cost += chunk_cost

    chunk_results.sort(key=lambda x: x[0])

    all_segments: list[DiarizedSegment] = []
    raw_payload: dict[str, Any] = {"chunks": []}
    total_duration: float | None = None

    for chunk_start, diarized in chunk_results:
        for seg in diarized.segments:
            all_segments.append(
                DiarizedSegment(
                    speaker=seg.speaker,
                    start=seg.start + chunk_start,
                    end=seg.end + chunk_start,
                    text=seg.text,
                )
            )
        raw_payload["chunks"].append(diarized.raw_payload)
        if diarized.duration_seconds is not None:
            total_duration = (total_duration or 0.0) + diarized.duration_seconds

    if len(chunk_results) > 1:
        all_segments, anchor_cost = await _reanchor_speakers(
            all_segments, chunk_results, llm_provider
        )
        total_cost += anchor_cost

    language_val = chunk_results[0][1].language if chunk_results else None
    if total_duration is None and all_segments:
        total_duration = max(seg.end for seg in all_segments)
    return (
        DiarizedTranscript(
            segments=all_segments,
            language=language_val,
            raw_payload=raw_payload,
            duration_seconds=total_duration,
        ),
        total_cost,
    )


def _flag_minor_speakers(
    segments: list[DiarizedSegment],
    *,
    min_seconds: float = 2.0,
    min_share: float = 0.02,
    min_segments: int = 2,
) -> list[bool]:
    """Return a parallel ``needs_review`` flag list for each input segment.

    OpenAI's diarized transcription occasionally invents speakers for cross-talk,
    breath, or transient noise. We do **not** silently merge those speakers —
    that risks erasing a real third participant who only spoke briefly. Instead
    we flag the segments belonging to suspect speakers so the user can
    confirm/reassign them in the UI (see docs/technical-debt/20).

    A speaker is suspect only when ALL of:
      - total speaking time < ``min_seconds``,
      - share of total duration < ``min_share``,
      - segment count < ``min_segments``.

    The AND is what keeps false positives low: a real participant with a tiny
    voice and rare turns may match 1 or 2 conditions, all 3 simultaneously is
    very unlikely in practice.
    """
    if not segments:
        return []

    durations: dict[str, float] = {}
    counts: dict[str, int] = {}
    for s in segments:
        d = max(0.0, s.end - s.start)
        durations[s.speaker] = durations.get(s.speaker, 0.0) + d
        counts[s.speaker] = counts.get(s.speaker, 0) + 1

    total = sum(durations.values()) or 1.0
    suspect = {
        sp
        for sp, dur in durations.items()
        if dur < min_seconds and dur / total < min_share and counts[sp] < min_segments
    }
    # If everyone qualifies, the heuristic is probably miscalibrated for this
    # call (very short or single-segment transcript). Don't flag anything.
    if not suspect or len(suspect) >= len(durations):
        return [False] * len(segments)
    return [s.speaker in suspect for s in segments]


def _probe_duration(audio_path: Path) -> float | None:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        capture_output=True,
        text=True,
    )
    try:
        return float(probe.stdout.strip())
    except ValueError:
        return None


def _detect_silence(audio_path: Path) -> list[float]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(audio_path),
            "-af",
            "silencedetect=noise=-30dB:d=0.5",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise DomainError(
            "stt_chunking_failed",
            f"ffmpeg silencedetect failed (rc={result.returncode}): {result.stderr[:200]}",
            502,
        )
    boundaries: list[float] = []
    for line in result.stderr.splitlines():
        if "silence_end" in line:
            for part in line.split():
                try:
                    boundaries.append(float(part))
                    break
                except ValueError:
                    continue
    return boundaries


def _build_chunk_intervals(
    audio_path: Path, silence_boundaries: list[float]
) -> list[tuple[float, float]]:
    total_duration = _probe_duration(audio_path) or 3600.0

    max_chunk_seconds = 10 * 60
    intervals: list[tuple[float, float]] = []
    current_start = 0.0

    for boundary in silence_boundaries:
        if boundary - current_start >= max_chunk_seconds:
            intervals.append((current_start, boundary))
            current_start = boundary

    if current_start < total_duration:
        intervals.append((current_start, total_duration))

    return intervals if intervals else [(0.0, total_duration)]


def _split_audio(
    audio_path: Path, start: float, end: float, output_path: Path
) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-ss",
            str(start),
            "-to",
            str(end),
            "-i",
            str(audio_path),
            "-c",
            "copy",
            str(output_path),
            "-y",
        ],
        capture_output=True,
        check=True,
    )


async def _reanchor_speakers(
    segments: list[DiarizedSegment],
    chunk_results: list[tuple[float, DiarizedTranscript]],
    llm_provider: LLMProvider,
) -> tuple[list[DiarizedSegment], float]:

    from pydantic import BaseModel

    class ChunkSpeakerMap(BaseModel):
        mapping: dict[str, dict[str, str]]

    first_30s_texts = {}
    for i, (_, diarized) in enumerate(chunk_results):
        texts = [
            f"{seg.speaker}: {seg.text}"
            for seg in diarized.segments
            if seg.start < 30.0
        ]
        first_30s_texts[str(i)] = " | ".join(texts[:5])

    prompt = (
        "You are re-anchoring speaker labels across audio chunks of the same call.\n"
        "Assign consistent canonical speaker names (A, B, C...) across all chunks.\n"
        "Return JSON: {\"mapping\": {\"0\": {\"SPEAKER_00\": \"A\"}, \"1\": {\"SPEAKER_00\": \"A\"}}}\n\n"
        + "\n".join(f"Chunk {k}: {v}" for k, v in first_30s_texts.items())
    )

    try:
        result = await llm_provider.complete_structured(prompt, ChunkSpeakerMap, settings.LLM_MODEL_SYNTHESIS)
        mapping = result.parsed.mapping

        chunk_start_to_idx: dict[float, int] = {
            chunk_start: i for i, (chunk_start, _) in enumerate(chunk_results)
        }

        remapped: list[DiarizedSegment] = []
        for seg in segments:
            closest_chunk_start = min(
                chunk_start_to_idx.keys(), key=lambda s: abs(s - seg.start)
            )
            chunk_idx = str(chunk_start_to_idx[closest_chunk_start])
            chunk_map = mapping.get(chunk_idx, {})
            new_speaker = chunk_map.get(seg.speaker, seg.speaker)
            remapped.append(
                DiarizedSegment(
                    speaker=new_speaker,
                    start=seg.start,
                    end=seg.end,
                    text=seg.text,
                )
            )
        return remapped, result.usage.cost_usd
    except Exception as exc:
        logger.warning("Speaker re-anchoring failed, keeping original labels: %s", exc)
        return segments, 0.0


async def mood_stage(
    transcript_id: int,
    session_factory: async_sessionmaker[AsyncSession],
    llm_provider: LLMProvider,
) -> float:
    async with session_factory() as session:
        stmt = (
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript_id)
            .order_by(TranscriptSegment.idx)
        )
        result = await session.execute(stmt)
        segments = list(result.scalars().all())

        if not segments:
            return 0.0

        total_cost = 0.0
        batch_size = 20

        for i in range(0, len(segments), batch_size):
            batch = segments[i : i + batch_size]
            seg_dicts = [{"idx": s.idx, "text": s.text} for s in batch]
            prompt = mood_prompts.build_prompt(seg_dicts)

            llm_result = await llm_provider.complete_structured(
                prompt, MoodLabels, settings.LLM_MODEL_MOOD
            )
            total_cost += llm_result.usage.cost_usd

            mood_by_idx = {sm.idx: sm.mood for sm in llm_result.parsed.segments}
            for seg in batch:
                if seg.idx in mood_by_idx:
                    seg.mood = mood_by_idx[seg.idx]

        await session.commit()
        return total_cost


async def tag_stage(
    call_id: int,
    transcript_id: int,
    session_factory: async_sessionmaker[AsyncSession],
    llm_provider: LLMProvider,
) -> float:
    async with session_factory() as session:
        stmt = (
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript_id)
            .order_by(TranscriptSegment.idx)
        )
        result = await session.execute(stmt)
        segments = list(result.scalars().all())

        transcript_text = _build_transcript_text(segments)

        taxonomy = list(SYSTEM_TAG_NAMES)
        prompt = tags_prompts.build_prompt(transcript_text, taxonomy)

        llm_result = await llm_provider.complete_structured(
            prompt, TagSuggestion, settings.LLM_MODEL_TAGGING
        )
        cost = llm_result.usage.cost_usd
        all_tag_names: list[str] = llm_result.parsed.tags
        valid_taxonomy = set(taxonomy)
        tag_names = [t for t in all_tag_names if t in valid_taxonomy]
        if len(tag_names) < len(all_tag_names):
            dropped = set(all_tag_names) - valid_taxonomy
            logger.warning("tag_stage: dropped %d out-of-taxonomy tags: %s", len(dropped), dropped)

        from app.llm.system_tags import SYSTEM_TAGS
        system_tag_colors = dict(SYSTEM_TAGS)

        for tag_name in tag_names:
            tag_stmt = select(Tag).where(Tag.name == tag_name)
            tag_result = await session.execute(tag_stmt)
            tag = tag_result.scalar_one_or_none()

            # Self-heal: if the data migration didn't run (e.g. test DB), insert
            # the canonical row with its curated color rather than a colorless
            # is_system=False orphan.
            if tag is None:
                tag = Tag(
                    name=tag_name,
                    color=system_tag_colors.get(tag_name, "#6b7280"),
                    is_system=True,
                )
                session.add(tag)
                await session.flush()

            await session.execute(
                text(
                    "INSERT INTO call_tags (call_id, tag_id, source) "
                    "VALUES (:call_id, :tag_id, 'llm') "
                    "ON CONFLICT DO NOTHING"
                ),
                {"call_id": call_id, "tag_id": tag.id},
            )

        await session.commit()
        return cost


async def insight_stage(
    call_id: int,
    transcript_id: int,
    session_factory: async_sessionmaker[AsyncSession],
    llm_provider: LLMProvider,
) -> float:
    async with session_factory() as session:
        stmt = (
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript_id)
            .order_by(TranscriptSegment.idx)
        )
        result = await session.execute(stmt)
        segments = list(result.scalars().all())

        transcript_text = _build_transcript_text(segments)
        prompt = insights_prompts.build_prompt(transcript_text)

        llm_result = await llm_provider.complete_structured(
            prompt, InsightExtraction, settings.LLM_MODEL_INSIGHTS
        )
        cost = llm_result.usage.cost_usd
        extraction: InsightExtraction = llm_result.parsed

        for extracted in extraction.insights:
            insight = Insight(
                call_id=call_id,
                kind=extracted.kind,
                text=extracted.text,
                segment_idx=extracted.segment_idx,
                weight=extracted.weight,
            )
            session.add(insight)

        await session.commit()
        return cost


async def synthesis_stage(
    call_id: int,
    transcript_id: int,
    session_factory: async_sessionmaker[AsyncSession],
    llm_provider: LLMProvider,
) -> tuple[Analysis, float]:
    async with session_factory() as session:
        stmt = (
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript_id)
            .order_by(TranscriptSegment.idx)
        )
        seg_result = await session.execute(stmt)
        segments = list(seg_result.scalars().all())

        insight_stmt = select(Insight).where(Insight.call_id == call_id)
        insight_result = await session.execute(insight_stmt)
        insights = list(insight_result.scalars().all())

        transcript_text = _build_transcript_text(segments)
        insight_summary = "\n".join(
            f"- [{i.kind}] {i.text}" for i in insights
        )

        prompt = synthesis_prompts.build_prompt(transcript_text, insight_summary)
        llm_result = await llm_provider.complete_structured(
            prompt, Synthesis, settings.LLM_MODEL_SYNTHESIS
        )
        cost = llm_result.usage.cost_usd
        synth: Synthesis = llm_result.parsed

        # If the user has already labelled who's the rep on this call (from a
        # prior session or via reanalyze), respect it. Otherwise the helper
        # falls back to the dominant-speaker heuristic.
        rep_labels_rows = await session.execute(
            select(Participant.speaker_label).where(
                Participant.call_id == call_id, Participant.side == "rep"
            )
        )
        rep_labels: set[str] = {row[0] for row in rep_labels_rows.fetchall()}
        talk_ratio_rep, talk_ratio_client = _compute_talk_ratios(segments, rep_labels)

        # Persist the LLM-detected language back to the call/transcript so the UI
        # can show it instead of guessing. STT (diarized_json) does not return it.
        call_row = await session.get(Call, call_id)
        if call_row is not None and synth.language:
            call_row.language = synth.language
        transcript_row = await session.get(Transcript, transcript_id)
        if transcript_row is not None and synth.language:
            transcript_row.language = synth.language

        analysis = Analysis(
            call_id=call_id,
            summary=synth.summary,
            headline=synth.headline,
            overall_sentiment=synth.overall_sentiment,
            talk_ratio_rep=talk_ratio_rep,
            talk_ratio_client=talk_ratio_client,
            llm_model_used=settings.LLM_MODEL_SYNTHESIS,
            prompt_version=SYNTHESIS_VERSION,
            cost_usd_breakdown={},
            cost_usd_total=0.0,
        )
        session.add(analysis)
        await session.commit()
        await session.refresh(analysis)
        return analysis, cost


def _compute_talk_ratios(
    segments: list[TranscriptSegment],
    rep_labels: set[str] | None = None,
) -> tuple[float, float]:
    """Return (rep_fraction, client_fraction) of total speaking time.

    If `rep_labels` is provided (from saved Participant.side='rep'), those
    speakers' durations are summed as the rep share. Otherwise we fall back
    to the dominant-speaker heuristic (whoever talked the longest is the
    rep). Same applies if the labels passed don't match any segment.
    """
    if not segments:
        return 0.5, 0.5

    speaker_durations: dict[str, float] = {}
    for seg in segments:
        duration = seg.end_seconds - seg.start_seconds
        speaker_durations[seg.speaker_label] = (
            speaker_durations.get(seg.speaker_label, 0.0) + duration
        )

    if not speaker_durations:
        return 0.5, 0.5

    total = sum(speaker_durations.values())
    if total == 0.0:
        return 0.5, 0.5

    matched_labels = (rep_labels or set()) & set(speaker_durations.keys())
    if matched_labels:
        rep_duration = sum(speaker_durations[label] for label in matched_labels)
    else:
        sorted_speakers = sorted(
            speaker_durations.items(), key=lambda x: x[1], reverse=True
        )
        rep_duration = speaker_durations[sorted_speakers[0][0]]

    client_duration = total - rep_duration
    return round(rep_duration / total, 4), round(client_duration / total, 4)


async def update_analysis_cost(
    analysis_id: int,
    cost: dict[str, float],
    session_factory: async_sessionmaker[AsyncSession],
    redis_client: aioredis.Redis,
) -> None:
    cost_total = float(sum(cost.values()))

    async with session_factory() as session:
        analysis = await session.get(Analysis, analysis_id)
        if analysis is not None:
            analysis.cost_usd_breakdown = cost
            analysis.cost_usd_total = cost_total
            await session.commit()

    spend_key = f"spend:{date.today().isoformat()}"
    await redis_client.incrbyfloat(spend_key, cost_total)
    await redis_client.expire(spend_key, 60 * 60 * 48)
