from pathlib import Path

import openai

from app.core.errors import DomainError
from app.providers.base import DiarizedSegment, DiarizedTranscript

# Cost rate exposed for Phase 4 to use when recording STT cost.
# Phase 4: cost_usd = (duration_seconds / 60) * STT_COST_PER_MINUTE[model]
STT_COST_PER_MINUTE: dict[str, float] = {
    "gpt-4o-transcribe-diarize": 0.006,
}


class OpenAISTT:
    def __init__(self, client: openai.AsyncOpenAI, model: str) -> None:
        self._client = client
        self._model = model

    async def transcribe(
        self, audio_path: Path, language: str | None = None
    ) -> DiarizedTranscript:
        with audio_path.open("rb") as f:
            response = await self._client.audio.transcriptions.create(  # type: ignore[call-overload]
                model=self._model,
                file=f,
                response_format="diarized_json",
                language=language,
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

        return DiarizedTranscript(
            segments=segments,
            language=getattr(response, "language", None),
            raw_payload=raw,
        )
