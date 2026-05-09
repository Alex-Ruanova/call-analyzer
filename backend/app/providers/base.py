from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


@dataclass
class DiarizedSegment:
    speaker: str
    start: float
    end: float
    text: str


@dataclass
class DiarizedTranscript:
    segments: list[DiarizedSegment]
    language: str | None
    raw_payload: dict[str, object]
    duration_seconds: float | None = None


@dataclass
class LLMUsage:
    prompt_tokens: int
    completion_tokens: int
    model: str
    cost_usd: float


@dataclass
class LLMResult:
    parsed: BaseModel
    usage: LLMUsage


@dataclass
class STTResult:
    transcript: DiarizedTranscript
    usage: LLMUsage


@runtime_checkable
class STTProvider(Protocol):
    async def transcribe(
        self, audio_path: Path, language: str | None = None
    ) -> STTResult: ...


@runtime_checkable
class LLMProvider(Protocol):
    async def complete_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        model: str,
        system_prompt: str | None = None,
    ) -> LLMResult: ...
