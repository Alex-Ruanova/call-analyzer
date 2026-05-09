PROMPT_VERSION = "v1"

TAG_TAXONOMY = [
    "discovery",
    "demo",
    "objection-handling",
    "pricing-discussion",
    "competitive-mention",
    "technical-deep-dive",
    "follow-up-agreed",
    "contract-discussion",
    "escalation",
    "positive-outcome",
    "lost-deal",
    "feature-request",
    "onboarding",
    "renewal",
    "stakeholder-intro",
]


def build_prompt(transcript_text: str) -> str:
    tags_str = ", ".join(TAG_TAXONOMY)
    return (
        f"Taxonomy: {tags_str}\n\n"
        "Select 1–5 tags that best describe this sales call. Use exact taxonomy names.\n\n"
        f"Transcript:\n{transcript_text}"
    )
