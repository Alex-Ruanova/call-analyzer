# Prompt Design & Evaluation Strategy

## Tag Taxonomy

Altur uses a 10-category tag system to surface sales-relevant moments in call transcripts. Each tag maps directly to discovery, qualification, or closing phases of a deal cycle. Tags are multi-label (one segment can have multiple tags) and user-facing — reps use them to skim calls and find the exact 30-second clip they need.

| Tag | Sales Funnel Stage | Why It Matters | Detection Signal |
|---|---|---|---|
| **discovery** | Early qualification | Prospect is new; rep is still learning pain points | "Tell me about your current situation..." |
| **objection** | Mid-cycle | Real blocker (price, timing, fit) surfaces; rep must address it | "Our system is locked into vendor X for 3 years..." |
| **follow-up** | Post-call action | Commitment to next step; closes the loop | "Let me send you the cost comparison by Friday..." |
| **demo** | Qualification | Feature walkthrough; signals buying interest | "Can you show me how you handle integrations?" |
| **pricing** | Late cycle | Money talk; either blocker or buying signal | "What's the cost per seat?" or "That's within budget." |
| **renewal** | Account expansion | Existing customer; upsell or churn risk | "We need to renew in Q3..." |
| **competitor** | Qualification | Competitive threat named explicitly | "Your tool vs Salesforce..." |
| **pain-point** | Discovery | Core problem the prospect owns | "We spend 8 hours a week on manual reconciliation." |
| **buying-signal** | Late cycle | Positive indicator (urgency, budget approval, champion) | "I'll run this by my CFO..." or "We're ready to move forward." |
| **feature-req** | Demo/spec | Prospect asks for or validates specific capability | "Do you support SCIM provisioning?" |

---

## Per-Stage Prompt Strategy

The analysis pipeline runs 4 LLM stages sequentially. Each is stateless and driven by a Pydantic schema with `response_format={"type": "json_schema", ...}`. Each stage has a `PROMPT_VERSION = "v1"` constant to track prompt drift over time.

### 1. Mood Analysis (PROMPT_VERSION="v1")

**Input:** 10–20 transcript segments (batched for efficiency).  
**Output:** `MoodLabels` schema with per-segment sentiment label.  
**Why:** Reps want to know call tone — was the prospect warm, skeptical, defensive? Early signal of deal health.

**Schema:**
```python
class MoodLabel(str, Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"

class MoodLabels(BaseModel):
    segments: list[dict] = Field(description="Segment ID + mood label")
    overall_tone: str = Field(description="One-sentence summary of emotional arc")
```

**Prompt structure:**
- System: "You are a sales analyst. Analyze the emotional tone of each transcript segment."
- User: Batch of 10–20 segments (timestamp + speaker + text).
- Constraint: Respond only with JSON; schema enforced server-side.

### 2. Tag Suggestion (PROMPT_VERSION="v1")

**Input:** Full call transcript.  
**Output:** `TagSuggestion` schema with detected tags and confidence scores.  
**Why:** Bulk label the call for search and funnel analytics.

**Schema:**
```python
class TagSuggestion(BaseModel):
    tags: list[str] = Field(
        description="Selected from taxonomy; multi-label allowed"
    )
    confidence_per_tag: dict[str, float] = Field(
        description="0.0–1.0 per tag; filter <0.5 client-side if needed"
    )
```

**Prompt structure:**
- System: "Extract sales-relevant tags from this call. Use the exact taxonomy: discovery, objection, follow-up, demo, pricing, renewal, competitor, pain-point, buying-signal, feature-req."
- User: Full transcript + context (call length, participant count).
- Constraint: Multi-label; confidence scores required for filtering weak signals.

### 3. Insights Extraction (PROMPT_VERSION="v1")

**Input:** Full transcript.  
**Output:** `InsightExtraction` schema with structured business data.  
**Why:** Populate deal board fields automatically; enable sales manager dashboards.

**Schema:**
```python
class InsightExtraction(BaseModel):
    pain_points: list[str] = Field(description="Top 3 customer problems mentioned")
    objections_raised: list[str] = Field(description="Blockers or concerns")
    buying_signals: list[str] = Field(description="Positive indicators")
    next_steps: list[str] = Field(description="Commitments and follow-ups")
    decision_timeline: str | None = Field(description=""Q2 budget cycle", "next Monday", etc.")
    budget_band: str | None = Field(description="Estimated deal size if mentioned")
```

**Prompt structure:**
- System: "Extract actionable sales insights. Focus on pain points, objections, buying signals, and next steps. Be concise."
- User: Transcript + call metadata.
- Constraint: Enforce lists; omit fields if not mentioned (None allowed).

### 4. Synthesis (PROMPT_VERSION="v1")

**Input:** Full transcript + prior stages' outputs (mood, tags, insights).  
**Output:** `Synthesis` schema with executive summary.  
**Why:** One-sentence headline for the call list; full summary for call review.

**Schema:**
```python
class Synthesis(BaseModel):
    headline: str = Field(description="One sentence; max 100 chars. E.g., 'Prospect interested but cost-blocked; revisit in Q2.'")
    summary: str = Field(description="2–3 sentences: who called, what pain, next step")
    overall_sentiment: Literal["positive", "neutral", "negative"]
    confidence: float = Field(description="0.0–1.0; reflects synthesis confidence")
```

**Prompt structure:**
- System: "Write a brief executive summary of this call. Headline first, then 2–3 sentence summary."
- User: Transcript + prior analysis outputs (to avoid duplication).
- Constraint: Concise; sentiment must match mood analysis broadly.

---

## Evaluation Strategy

**Offline evaluation** measures tagging and insight quality over time. Run weekly to detect prompt drift and taxonomy churn.

### 1. Ground Truth Set

Maintain a human-annotated fixture of ~50 calls (production calls with manual labels by sales managers):

```
fixtures/
  calls.json       # Transcripts + human-assigned tags + insights
  annotation_guide.md  # Tagging rules for consistency
```

Store in `backend/tests/fixtures/`. Update quarterly as taxonomy evolves.

### 2. Per-Tag Metrics

For each tag, compute:
- **Precision:** Of all calls tagged by LLM, what % did humans also tag?
- **Recall:** Of all human-tagged calls, what % did LLM catch?
- **F1-score:** Harmonic mean; single-number quality metric.

Run via `make eval`. Output to `docs/model-eval/results.json`:

```json
{
  "eval_date": "2026-05-15",
  "model_versions": {
    "tagging": "v1",
    "mood": "v1",
    "insights": "v1",
    "synthesis": "v1"
  },
  "per_tag_metrics": {
    "objection": { "precision": 0.87, "recall": 0.91, "f1": 0.89 },
    "buying-signal": { "precision": 0.79, "recall": 0.85, "f1": 0.82 }
  },
  "cost_per_stage": {
    "mood": 0.0012,
    "tagging": 0.0025,
    "insights": 0.0018,
    "synthesis": 0.0008
  }
}
```

### 3. Drift Detection

Track new tag emergence:

```python
# Weekly: count unique tags in production calls
new_tags_this_week = production_tags - historical_tags
pct_new = len(new_tags_this_week) / len(historical_tags)
if pct_new > 0.05:  # >5% new tags = taxonomy may need rebalancing
    alert("High tag churn; review prompts")
```

If emerging tags cluster (e.g., "budget-constraint" and "cost-concern" are semantically twins), merge into the 10 canonical categories.

### 4. Cost Efficiency

Each stage logs `cost_usd` per call. Track mean and stddev:

```
mood:       mean=$0.0012, stddev=$0.0003
tagging:    mean=$0.0025, stddev=$0.0008
insights:   mean=$0.0018, stddev=$0.0004
synthesis:  mean=$0.0008, stddev=$0.0002
```

If tagging cost climbs >20% week-over-week while F1 stays flat, the prompt likely drifted (more tokens, same quality). Audit and simplify.

### 5. Automated Regression Checks

In CI, run eval against fixture set. Fail if:
- F1 drops >5% on any tag
- Cost per stage increases >10%
- New tag > 5% of total tags

This catches prompt regressions before production.

---

## Next Steps

With more time:
1. **Human-in-the-loop feedback:** Show reps LLM tags; let them correct. Retrain on corrections.
2. **Fine-tuning:** Once you have 500+ labelled calls, fine-tune a smaller model on your taxonomy.
3. **Reasoning models:** Use gpt-4-turbo with chain-of-thought for insights (trades latency for accuracy).
