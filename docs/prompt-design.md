# Prompt Design & Evaluation Strategy

This doc reflects what is actually in the code. Each stage section quotes the real prompt and links to the file. Versions and schemas are kept in lockstep with `backend/app/llm/`.

---

## Tag Taxonomy

10 system tags. The canonical list lives in `backend/app/llm/system_tags.py` (`SYSTEM_TAGS`) and is the single source of truth: the prompt builder reads it for the constrained taxonomy, and Alembic migration `0007` upserts the rows into the `tags` table with their colors so the UI can render them. Curating the taxonomy is a one-line edit + new migration, not a SQL operation.

| Tag | Sales funnel stage | Why it matters | Detection signal |
|---|---|---|---|
| **discovery** | Early qualification | Prospect is new; rep is still learning pain points | "Tell me about your current setup…" |
| **demo** | Qualification | Feature walkthrough; signals buying interest | "Can you show me how X works?" |
| **objection-handling** | Mid-cycle | Real blocker (price, timing, fit); rep must address | "We're locked into vendor X for 3 years…" |
| **pricing-discussion** | Late cycle | Money talk; either blocker or buying signal | "What's the cost per seat?" |
| **follow-up-agreed** | Post-call action | Commitment to next step; closes the loop | "I'll send the comparison by Friday." |
| **positive-outcome** | Late cycle | Explicit positive close (signed, agreed in principle, going to procurement) | "We're ready to move forward." |
| **feature-request** | Demo / spec | Prospect asks for or validates specific capability | "Do you support SCIM provisioning?" |
| **onboarding** | Post-sale | Existing customer being implemented | "Walking through the deployment plan…" |
| **renewal** | Account expansion | Existing customer; upsell or churn risk | "We need to renew in Q3…" |
| **other** | Escape hatch | None of the above fits cleanly | — |

**Why these and not, say, `pain-point` / `buying-signal` / `competitor` as tags?** Those concepts are first-class but extracted by the **insights stage**, not the tags stage. Tags answer "*what kind of call was this?*" — a coarse, multi-label classification that powers list filters and funnel analytics. Insights answer "*what specific things were said?*" — fine-grained, with exact quotes and segment indices. Same call can be tagged `discovery` + `objection-handling` and produce ten distinct insights of kinds `pain-point`, `objection`, `buying-signal`, `competitor`, etc.

**`other` is intentional.** Forcing one of the nine specific tags onto a poor match degrades downstream filters. The prompt explicitly tells the LLM to use `other` rather than over-fit (`tags.py:22-27`).

---

## Per-Stage Prompt Strategy

Four stateless LLM stages, each driven by a Pydantic schema with `response_format=schema` (OpenAI structured outputs — the API guarantees the response validates against the schema). Each stage has its own version constants tracked in two places: `PROMPT_VERSION` in `backend/app/llm/prompts/<stage>.py` (the prompt text) and `<STAGE>_VERSION` in `backend/app/llm/schemas/<stage>.py` (the output shape).

| Stage | Prompt version | Schema version | Model env var | File |
|---|---|---|---|---|
| Mood | `v1` | `MOOD_VERSION = "v1"` | `LLM_MODEL_MOOD` | `llm/prompts/mood.py` |
| Tags | `v3` | `TAGS_VERSION = "v1"` | `LLM_MODEL_TAGGING` | `llm/prompts/tags.py` |
| Insights | `v2` | `INSIGHTS_VERSION = "v2"` | `LLM_MODEL_INSIGHTS` | `llm/prompts/insights.py` |
| Synthesis | `v2` | `SYNTHESIS_VERSION = "v2"` | `LLM_MODEL_SYNTHESIS` | `llm/prompts/synthesis.py` |

Only `SYNTHESIS_VERSION` is persisted on `Analysis.prompt_version` today. The other three are observable in code but not on a row. Tracked as a follow-up in `docs/improvements.md` — moving `Analysis.prompt_version` to a JSONB `{stage: version}` map gives per-stage drift correlation when running `make eval` over time.

### 1. Mood (`PROMPT_VERSION="v1"`)

**Input:** batches of 20 transcript segments (`pipeline.py::mood_stage`).
**Output:** `MoodLabels { segments: list[SegmentMood{idx, mood}] }`.
**Mood enum:** `positive | neutral | negative | frustrated | enthusiastic | concerned | confused`.
**Why 7 values, not 3?** Categorical sentiment for the whole call (`positive/neutral/negative`) lives on the synthesis stage. Per-segment we want finer granularity — distinguishing `frustrated` from `negative` lets the UI surface high-friction moments without ambiguity.

**Prompt** (`mood.py`):
```
You are analyzing sales call segments for emotional tone.
Return mood for each segment index. Valid moods:
positive, neutral, negative, frustrated, enthusiastic, confused, concerned.

[0] <segment text>
[1] <segment text>
…
```

**Why batched, not one-call-per-segment?** Cost. A 30-min call has ~150 segments; 150 LLM calls × token overhead per call is order-of-magnitude more expensive than 8 batches of 20. Trade-off: a single bad batch loses 20 segments instead of 1, but the schema-enforced output makes that rare.

### 2. Tags (`PROMPT_VERSION="v3"`)

**Input:** truncated transcript text (cap of ~6000 tokens, `_MAX_TRANSCRIPT_CHARS` in `pipeline.py:54`) + the live taxonomy from the DB.
**Output:** `TagSuggestion { tags: list[str] }` — 1 to 5 tag names.
**Why no confidence per tag?** Tried it in v1 of the schema; the LLM's confidences were uncalibrated and added cost without informing decisions. Removed in v2.

**Prompt** (`tags.py`):
```
Taxonomy: discovery, demo, objection-handling, pricing-discussion,
follow-up-agreed, positive-outcome, feature-request, onboarding,
renewal, other

Select 1–5 tags that best describe this sales call. You MUST use
exact names from the taxonomy above. Do not invent new tags. If
none of the specific tags fit well, use 'other' (only if available
in the taxonomy) instead of forcing a poor match.

Transcript:
<truncated transcript>
```

**Validation defense in depth.** Even with `MUST use exact names`, the LLM occasionally returns a near-miss (`pricing` instead of `pricing-discussion`). `pipeline.py:511` filters out-of-taxonomy names with a warning log. Persisted tags are guaranteed to exist in the `tags` table (FK constraint).

### 3. Insights (`PROMPT_VERSION="v2"`)

**Input:** truncated transcript text.
**Output:** `InsightExtraction { insights: list[ExtractedInsight] }`.
**`ExtractedInsight`:** `{ kind, text, segment_idx, weight }` where:
- `kind ∈ { pain-point, objection, buying-signal, feature-req, competitor, pricing, next-step, quote, risk, highlight }`
- `text` is verbatim or close paraphrase
- `segment_idx` is the index of the most relevant transcript segment (nullable)
- `weight ∈ [0.0, 2.0]` — importance signal for ranking on the UI

**Prompt** (`insights.py`):
```
Extract structured insights from this sales call transcript.
Types: pain-point, objection, buying-signal, feature-req,
competitor, pricing, next-step, quote, risk, highlight.
Weight importance 0.0–2.0. Include segment_idx if mappable.

Transcript:
<truncated transcript>
```

**Why kinds and not free-text?** A bounded set is searchable, filterable, and aggregatable across the corpus. Free-text "insights" become a wall of bullet points the rep ignores.

### 4. Synthesis (`PROMPT_VERSION="v2"`, `SYNTHESIS_VERSION="v2"`)

**Input:** truncated transcript + bullet list of extracted insights.
**Output:** `Synthesis { headline, summary, overall_sentiment, language }`.
- `headline` — one sentence, max 100 chars, written in the transcript's language.
- `summary` — 3–5 sentences, same language.
- `overall_sentiment ∈ { positive, neutral, negative }` — categorical (see deuda #01 for the trade-off vs continuous score).
- `language` — ISO 639-1 code (`en`, `es`, `pt`, …).

**Prompt** (`synthesis.py`):
```
Write an executive summary of this sales call.
Detect the dominant language of the transcript first. Write
`headline` and `summary` in that same language as the transcript.
Field names and enum values stay in English.

headline: one sentence max 100 chars (in transcript language).
summary: 3–5 sentences covering outcome, key concerns, and next
steps (in transcript language).
overall_sentiment: positive | neutral | negative.
language: ISO 639-1 code of the dominant language (e.g. en, es, pt).
Lowercase, two letters.

Key insights:
- [pain-point] manual reporting takes 8 hrs/week
- [next-step] cost comparison Friday
…

Transcript:
<truncated transcript>
```

**Multilingual.** Transcripts can be in any language OpenAI's STT supports. The synthesis prompt instructs the LLM to **detect** the language and **write headline/summary in that same language** while keeping enum values (`positive`, etc.) and field names in English. The detected `language` is persisted on `Call` and `Transcript` so the UI can show it instead of guessing.

---

## Evaluation Strategy

Honest scope: today the repo has a **model-comparison harness**, not a precision/recall/F1 benchmark. The strategy below is what the harness would grow into once a labelled dataset exists.

### What `make eval` actually does today

`scripts/eval_models.py` runs each LLM stage (mood, tags, insights, synthesis) on a fixture set of pre-built transcripts (no audio, no STT cost) through both `gpt-4o-mini` and `gpt-4.1-mini`, side by side. For each stage × model it captures:

- structured output (full Pydantic-validated payload),
- token usage (prompt + completion),
- cost in USD (computed from `MODEL_PRICING`),
- latency.

Result is written to `docs/model-eval/results.json`. A human reviews the diff between the two models on representative calls and decides whether the cost premium of `gpt-4.1-mini` is worth the quality gain. Use this when changing the default model env var or considering an upgrade.

**This harness measures consistency between models, not absolute correctness.** It cannot tell you the LLM was right — only that two models agreed (or didn't).

### What's missing — the labelled-dataset evaluation

The right next step is `make eval --benchmark`, which requires a ground-truth fixture set:

```
backend/tests/fixtures/labelled/
  calls.json            # transcripts + human-assigned tags + insights
  annotation_guide.md   # tagging rules to keep annotators consistent
```

**Target size:** ~50 calls to start, ~250 to be statistically usable. Annotated by sales managers (the actual end users), not engineers. Update quarterly as the taxonomy evolves.

#### Per-tag metrics (target)

For each of the 10 tags:
- **Precision** — of the calls the LLM tagged with X, what % did humans also tag X?
- **Recall** — of the calls humans tagged with X, what % did the LLM catch?
- **F1** — harmonic mean; single-number quality metric per tag.

Result extension to `results.json`:

```json
{
  "eval_date": "2026-05-15",
  "prompt_versions": { "mood": "v1", "tags": "v3", "insights": "v2", "synthesis": "v2" },
  "model": "gpt-4o-mini",
  "per_tag_metrics": {
    "discovery":           { "precision": 0.91, "recall": 0.88, "f1": 0.89 },
    "objection-handling":  { "precision": 0.84, "recall": 0.79, "f1": 0.81 },
    "buying-signal":       null  // not a tag — measured under insights, see below
  },
  "per_insight_kind_metrics": {
    "pain-point":      { "precision": 0.79, "recall": 0.83, "f1": 0.81 },
    "buying-signal":   { "precision": 0.74, "recall": 0.80, "f1": 0.77 }
  },
  "cost_per_stage_usd": { "mood": 0.0012, "tags": 0.0009, "insights": 0.0021, "synthesis": 0.0008 }
}
```

#### Production feedback loop (zero new fixtures)

The DB already has the signal: `CallTag.source ∈ { 'llm', 'user' }`. When a user overrides a tag in the UI, that's implicit ground truth. The query for "LLM tag precision in production over the last 30 days" is one SQL — group by tag, compare `source='llm'` vs `source='user'` for the same call. Build a Grafana panel from this and you have continuous, free-of-charge calibration without ever annotating a fixture.

#### Drift detection

Two signals worth alerting on:

1. **Catalog churn** — number of unique tags assigned in production / number of system tags. If the LLM keeps falling into `other` it means the taxonomy is too narrow; if power-users keep adding free-text tags, time to promote them to system tags.
2. **Cost-per-stage drift** — if `cost_usd_breakdown.tags` climbs >20% week-over-week without a model change, the prompt is leaking tokens. `Analysis.cost_usd_breakdown` already stores this; the alert is a SQL query.

#### Regression check in CI

Once the labelled fixture exists, fail the build if any of:

- Per-tag F1 drops > 5 points vs the previous baseline.
- Mean cost per stage rises > 10% with no prompt-version bump.
- New tags appear in production at > 5% of total tags assigned that week (taxonomy needs a rebalance, not silent drift).

---

## Roadmap

The follow-ups that touch this doc, in priority:

1. **Build the labelled fixture set** (≥50 calls). Without it, everything above the line "What's missing" is aspirational.
2. **Persist per-stage prompt versions** (`Analysis.prompt_version: JSONB`). Today only synthesis is persisted; per-stage drift correlation is impossible.
3. **Hook `CallTag.source='user'` into a continuous calibration query**. Free ground truth, already in the DB.
4. **Fine-tune** a smaller model (Haiku-class or distilled) once 500+ labelled calls exist. The taxonomy is small and stable; this is where cost wins double-digit percent.

These live in `docs/improvements.md` with effort estimates.
