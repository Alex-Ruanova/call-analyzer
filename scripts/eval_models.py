#!/usr/bin/env python3
"""
Model comparison eval: run each LLM analysis stage through gpt-4o-mini and gpt-4.1-mini
on a set of transcript fixtures, then write side-by-side results to docs/model-eval/results.json.

No audio processing — reads pre-built transcript JSON directly.

Usage:
    python scripts/eval_models.py [--fixtures-dir tests/fixtures/transcripts]

Requirements: OPENAI_API_KEY must be set. Runs against the live OpenAI API.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, UTC
from pathlib import Path
from typing import Any

# Make app importable from repo root
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("AUDIO_STORAGE_DIR", "/tmp/eval-audio")

import openai as _openai

from app.core.config import settings
from app.llm.prompts import insights as insights_prompts
from app.llm.prompts import mood as mood_prompts
from app.llm.prompts import synthesis as synthesis_prompts
from app.llm.prompts import tags as tags_prompts
from app.llm.schemas.insights import InsightExtraction
from app.llm.schemas.mood import MoodLabels
from app.llm.schemas.synthesis import Synthesis
from app.llm.schemas.tags import TagSuggestion
from app.providers.openai_llm import OpenAILLM

MODELS = ["gpt-4o-mini", "gpt-4.1-mini"]


def load_fixture(path: Path) -> dict[str, Any]:
    with open(path) as f:
        return json.load(f)


def _transcript_text(segments: list[dict[str, Any]]) -> str:
    return "\n".join(
        f"[{s['idx']}] {s['speaker_label']} ({s.get('speaker_role','?')}): {s['text']}"
        for s in segments
    )


def _build_prompts_for_fixture(data: dict[str, Any]) -> dict[str, tuple[str, type]]:
    """Return {stage_name: (prompt_str, schema_class)} for each stage."""
    segs = data["segments"]
    text = _transcript_text(segs)

    mood_segs = [{"idx": s["idx"], "text": s["text"]} for s in segs]
    mood_prompt = mood_prompts.build_prompt(mood_segs)

    tags_prompt = tags_prompts.build_prompt(text)
    insights_prompt = insights_prompts.build_prompt(text)

    # For synthesis we need a brief insight summary — use a placeholder for eval purposes
    insight_summary = "pain-point: Manual reporting takes 12h/week. buying-signal: Client asked about deployment timeline."
    synthesis_prompt = synthesis_prompts.build_prompt(text, insight_summary)

    return {
        "mood": (mood_prompt, MoodLabels),
        "tags": (tags_prompt, TagSuggestion),
        "insights": (insights_prompt, InsightExtraction),
        "synthesis": (synthesis_prompt, Synthesis),
    }


async def run_stage(
    provider: OpenAILLM,
    stage_name: str,
    prompt: str,
    schema: type,
    model: str,
) -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        result = await provider.complete_structured(prompt=prompt, schema=schema, model=model)
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {
            "model": model,
            "stage": stage_name,
            "ok": True,
            "latency_ms": latency_ms,
            "prompt_tokens": result.usage.prompt_tokens,
            "completion_tokens": result.usage.completion_tokens,
            "cost_usd": round(result.usage.cost_usd, 6),
            "output": result.parsed.model_dump(mode="json"),
        }
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {
            "model": model,
            "stage": stage_name,
            "ok": False,
            "latency_ms": latency_ms,
            "error": str(exc),
        }


async def eval_fixture(
    provider: OpenAILLM,
    fixture_data: dict[str, Any],
) -> dict[str, Any]:
    stage_prompts = _build_prompts_for_fixture(fixture_data)
    stages_results: dict[str, dict[str, Any]] = {}

    for stage_name, (prompt, schema) in stage_prompts.items():
        model_results: dict[str, Any] = {}
        for model in MODELS:
            result = await run_stage(provider, stage_name, prompt, schema, model)
            model_results[model] = result
            status = "ok" if result["ok"] else "ERROR"
            cost = result.get("cost_usd", 0)
            print(f"  [{fixture_data['name']}] {stage_name}/{model} → {status}  ${cost:.5f}  {result['latency_ms']}ms")

        stages_results[stage_name] = model_results

    return {
        "name": fixture_data["name"],
        "stages": stages_results,
    }


async def main(fixtures_dir: Path, output_path: Path) -> None:
    api_key = settings.OPENAI_API_KEY
    if not api_key or api_key.startswith("sk-placeholder") or api_key == "sk-fake-key-for-tests":
        print("ERROR: OPENAI_API_KEY is not set or is a placeholder.")
        sys.exit(1)

    openai_client = _openai.AsyncOpenAI(api_key=api_key)
    provider = OpenAILLM(client=openai_client)

    fixture_files = sorted(fixtures_dir.glob("*.json"))
    if not fixture_files:
        print(f"No fixture files found in {fixtures_dir}")
        sys.exit(1)

    print(f"Running eval: {len(fixture_files)} fixture(s) × {len(MODELS)} model(s) × 4 stage(s)")
    fixture_results: list[dict[str, Any]] = []
    errors = 0

    for fixture_path in fixture_files:
        data = load_fixture(fixture_path)
        result = await eval_fixture(provider, data)
        fixture_results.append(result)
        for stage_vals in result["stages"].values():
            for model_result in stage_vals.values():
                if not model_result.get("ok"):
                    errors += 1

    output = {
        "run_at": datetime.now(UTC).isoformat(),
        "models": MODELS,
        "stages": ["mood", "tags", "insights", "synthesis"],
        "fixtures": fixture_results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults written to {output_path}")
    if errors:
        print(f"WARNING: {errors} stage(s) failed. See results.json for details.")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Model comparison eval")
    parser.add_argument(
        "--fixtures-dir",
        type=Path,
        default=REPO_ROOT / "tests" / "fixtures" / "transcripts",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "docs" / "model-eval" / "results.json",
    )
    args = parser.parse_args()
    asyncio.run(main(args.fixtures_dir, args.output))
