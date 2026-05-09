PROMPT_VERSION = "v2"


def build_prompt(transcript_text: str, insight_summary: str) -> str:
    return (
        "Write an executive summary of this sales call.\n"
        "Detect the dominant language of the transcript first. "
        "Write `headline` and `summary` in that same language as the transcript. "
        "Field names and enum values stay in English.\n\n"
        "headline: one sentence max 100 chars (in transcript language).\n"
        "summary: 3–5 sentences covering outcome, key concerns, and next steps "
        "(in transcript language).\n"
        "overall_sentiment: positive | neutral | negative.\n"
        "language: ISO 639-1 code of the dominant language in the transcript "
        "(e.g. en, es, pt). Lowercase, two letters.\n\n"
        f"Key insights:\n{insight_summary}\n\n"
        f"Transcript:\n{transcript_text}"
    )
