PROMPT_VERSION = "v3"

# Fallback used only when the DB tag table is empty (e.g. very first call on a
# brand-new install before seed runs). Once tags exist in the DB the pipeline
# pulls the taxonomy from there and ignores this list.
FALLBACK_TAXONOMY: list[str] = [
    "discovery",
    "demo",
    "objection-handling",
    "pricing-discussion",
    "follow-up-agreed",
    "positive-outcome",
    "feature-request",
    "onboarding",
    "renewal",
    "other",
]


def build_prompt(transcript_text: str, taxonomy: list[str]) -> str:
    tags_str = ", ".join(taxonomy)
    return (
        f"Taxonomy: {tags_str}\n\n"
        "Select 1–5 tags that best describe this sales call. "
        "You MUST use exact names from the taxonomy above. Do not invent new tags. "
        "If none of the specific tags fit well, use 'other' (only if available in "
        "the taxonomy) instead of forcing a poor match.\n\n"
        f"Transcript:\n{transcript_text}"
    )
