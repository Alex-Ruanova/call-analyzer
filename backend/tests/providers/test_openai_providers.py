from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors import DomainError
from app.llm.schemas.mood import MoodLabels, SegmentMood
from app.providers.base import DiarizedTranscript, LLMResult
from app.providers.openai_llm import OpenAILLM
from app.providers.openai_stt import OpenAISTT


class FakeSegment:
    def __init__(self, speaker: str, start: float, end: float, text: str) -> None:
        self.speaker = speaker
        self.start = start
        self.end = end
        self.text = text


class FakeTranscriptionResponse:
    segments = [FakeSegment(speaker="A", start=0.0, end=2.5, text="Hello")]
    language = "en"
    duration = 2.5

    def model_dump(self) -> dict:
        return {
            "segments": [{"speaker": "A", "start": 0.0, "end": 2.5, "text": "Hello"}],
            "language": "en",
            "duration": 2.5,
        }


class FakeUsage:
    prompt_tokens = 100
    completion_tokens = 50
    total_tokens = 150


class FakeMessage:
    def __init__(self, parsed: MoodLabels | None, refusal: str | None = None) -> None:
        self.parsed = parsed
        self.refusal = refusal


class FakeChoice:
    def __init__(self, message: FakeMessage) -> None:
        self.message = message


class FakeParsedCompletion:
    def __init__(self, parsed: MoodLabels | None, refusal: str | None = None) -> None:
        self.choices = [FakeChoice(FakeMessage(parsed=parsed, refusal=refusal))]
        self.usage = FakeUsage()


class FakeAudio:
    def __init__(self, transcription_response: FakeTranscriptionResponse) -> None:
        self.transcriptions = MagicMock()
        self.transcriptions.create = AsyncMock(return_value=transcription_response)


class FakeChat:
    def __init__(self, completion: FakeParsedCompletion) -> None:
        self.completions = MagicMock()
        self.completions.parse = AsyncMock(return_value=completion)


class FakeOpenAIClient:
    def __init__(
        self,
        transcription_response: FakeTranscriptionResponse | None = None,
        llm_completion: FakeParsedCompletion | None = None,
    ) -> None:
        if transcription_response is not None:
            self.audio = FakeAudio(transcription_response)
        if llm_completion is not None:
            self.chat = FakeChat(llm_completion)


@pytest.mark.asyncio
async def test_openai_stt_returns_diarized_transcript(tmp_path: Path) -> None:
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    fake_response = FakeTranscriptionResponse()
    client = FakeOpenAIClient(transcription_response=fake_response)
    stt = OpenAISTT(client=client, model="gpt-4o-transcribe-diarize")  # type: ignore[arg-type]

    result = await stt.transcribe(audio_file)

    assert isinstance(result, DiarizedTranscript)
    assert len(result.segments) == 1
    assert result.segments[0].speaker == "A"
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 2.5
    assert result.segments[0].text == "Hello"
    assert result.language == "en"


@pytest.mark.asyncio
async def test_openai_llm_returns_typed_model() -> None:
    mood_labels = MoodLabels(segments=[SegmentMood(idx=0, mood="positive")])
    completion = FakeParsedCompletion(parsed=mood_labels)
    client = FakeOpenAIClient(llm_completion=completion)
    llm = OpenAILLM(client=client)  # type: ignore[arg-type]

    result = await llm.complete_structured(
        prompt="Label moods",
        schema=MoodLabels,
        model="gpt-4o-mini",
    )

    assert isinstance(result, LLMResult)
    assert isinstance(result.parsed, MoodLabels)
    assert result.parsed.segments[0].mood == "positive"


@pytest.mark.asyncio
async def test_openai_llm_returns_usage() -> None:
    mood_labels = MoodLabels(segments=[SegmentMood(idx=0, mood="neutral")])
    completion = FakeParsedCompletion(parsed=mood_labels)
    client = FakeOpenAIClient(llm_completion=completion)
    llm = OpenAILLM(client=client)  # type: ignore[arg-type]

    result = await llm.complete_structured(
        prompt="Label moods",
        schema=MoodLabels,
        model="gpt-4o-mini",
    )

    assert result.usage.prompt_tokens == 100
    assert result.usage.completion_tokens == 50
    assert result.usage.cost_usd > 0


@pytest.mark.asyncio
async def test_openai_llm_raises_on_refusal() -> None:
    completion = FakeParsedCompletion(parsed=None, refusal="I cannot help with that.")
    client = FakeOpenAIClient(llm_completion=completion)
    llm = OpenAILLM(client=client)  # type: ignore[arg-type]

    with pytest.raises(DomainError) as exc_info:
        await llm.complete_structured(
            prompt="Label moods",
            schema=MoodLabels,
            model="gpt-4o-mini",
        )

    assert exc_info.value.code == "llm_refusal"
