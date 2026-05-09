import openai
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel

from app.core.errors import DomainError
from app.providers.base import LLMResult, LLMUsage

# (input_cost_per_1k_tokens, output_cost_per_1k_tokens) — approximate, update as pricing changes
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.00015, 0.00060),
    "gpt-4.1-mini": (0.00040, 0.00160),
    "gpt-4o": (0.00250, 0.01000),
    "gpt-4.1": (0.00200, 0.00800),
}

_DEFAULT_PRICING = (0.00015, 0.00060)


def _compute_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    input_per_1k, output_per_1k = MODEL_PRICING.get(model, _DEFAULT_PRICING)
    return (prompt_tokens / 1000.0) * input_per_1k + (
        completion_tokens / 1000.0
    ) * output_per_1k


class OpenAILLM:
    def __init__(self, client: openai.AsyncOpenAI) -> None:
        self._client = client

    async def complete_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        model: str,
        system_prompt: str | None = None,
    ) -> LLMResult:
        messages: list[ChatCompletionMessageParam] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self._client.chat.completions.parse(
            model=model,
            messages=messages,
            response_format=schema,
        )

        choice = response.choices[0]
        message = choice.message

        if message.refusal:
            raise DomainError(
                code="llm_refusal",
                message=f"LLM refused to complete the request: {message.refusal}",
                status_code=422,
            )

        parsed = message.parsed
        if parsed is None:
            raise DomainError(
                code="llm_no_parsed",
                message=f"LLM returned no parsed content (finish_reason={choice.finish_reason})",
                status_code=502,
            )

        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0

        return LLMResult(
            parsed=parsed,
            usage=LLMUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                model=model,
                cost_usd=_compute_cost(model, prompt_tokens, completion_tokens),
            ),
        )
