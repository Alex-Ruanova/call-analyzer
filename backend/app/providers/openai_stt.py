from pathlib import Path

import openai

from app.core.errors import DomainError
from app.providers.base import DiarizedSegment, DiarizedTranscript, LLMUsage, STTResult

STT_COST_PER_MINUTE: dict[str, float] = {
    "gpt-4o-transcribe-diarize": 0.006,
}


class OpenAISTT:
    def __init__(self, client: openai.AsyncOpenAI, model: str) -> None:
        self._client = client
        self._model = model

    async def transcribe(
        self, audio_path: Path, language: str | None = None
    ) -> STTResult:
        with audio_path.open("rb") as f:
            response = await self._client.audio.transcriptions.create(
                model=self._model,
                file=f,
                response_format="diarized_json",
                language=language,
                chunking_strategy="auto",
            )

        if not hasattr(response, "model_dump"):
            raise DomainError(
                code="stt_unexpected_response",
                message=f"STT response has unexpected type: {type(response)}",
                status_code=502,
            )

        raw = response.model_dump()
        raw_segments: list[dict[str, object]] = raw.get("segments") or []
        segments = [
            DiarizedSegment(
                speaker=str(seg.get("speaker") or "A"),
                start=float(seg.get("start") or 0.0),  # type: ignore[arg-type]
                end=float(seg.get("end") or 0.0),  # type: ignore[arg-type]
                text=str(seg.get("text") or ""),
            )
            for seg in raw_segments
        ]

        raw_duration = raw.get("duration")
        duration_seconds: float | None = float(raw_duration) if isinstance(raw_duration, (int, float)) else None
        cost_per_minute = STT_COST_PER_MINUTE.get(self._model, 0.0)
        cost_usd = ((duration_seconds or 0.0) / 60.0) * cost_per_minute

        transcript = DiarizedTranscript(
            segments=segments,
            language=getattr(response, "language", None),
            raw_payload=raw,
            duration_seconds=duration_seconds,
        )
        usage = LLMUsage(
            prompt_tokens=0,
            completion_tokens=0,
            model=self._model,
            cost_usd=cost_usd,
        )
        return STTResult(transcript=transcript, usage=usage)
