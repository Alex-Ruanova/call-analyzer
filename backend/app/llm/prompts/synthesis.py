PROMPT_VERSION = "v1"


def build_prompt(transcript_text: str, insight_summary: str) -> str:
    return (
        "Write an executive summary of this sales call.\n"
        "headline: one sentence max 100 chars.\n"
        "summary: 3–5 sentences covering outcome, key concerns, and next steps.\n"
        "overall_sentiment: positive | neutral | negative.\n\n"
        f"Key insights:\n{insight_summary}\n\n"
        f"Transcript:\n{transcript_text}"
    )
