from functools import lru_cache

import openai
import redis.asyncio as aioredis

from app.core.config import settings
from app.providers.base import LLMProvider, STTProvider
from app.providers.openai_llm import OpenAILLM
from app.providers.openai_stt import OpenAISTT


@lru_cache(maxsize=1)
def _openai_client() -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


@lru_cache(maxsize=1)
def get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def get_stt_provider() -> STTProvider:
    return OpenAISTT(client=_openai_client(), model=settings.STT_MODEL)


def get_llm_provider() -> LLMProvider:
    return OpenAILLM(client=_openai_client())
