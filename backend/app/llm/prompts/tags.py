from app.llm.system_tags import SYSTEM_TAG_NAMES

PROMPT_VERSION = "v3"


def build_prompt(transcript_text: str, taxonomy: list[str] | None = None) -> str:
    """Build the tagging prompt.

    `taxonomy` defaults to the canonical system tag list. The pipeline can pass
    an explicit list (e.g. read from the DB) to keep historical behaviour, but
    the source of truth is `SYSTEM_TAG_NAMES`.
    """
    names = taxonomy if taxonomy is not None else SYSTEM_TAG_NAMES
    tags_str = ", ".join(names)
    return (
        f"Taxonomy: {tags_str}\n\n"
        "Select 1–5 tags that best describe this sales call. "
        "You MUST use exact names from the taxonomy above. Do not invent new tags. "
        "If none of the specific tags fit well, use 'other' instead of forcing "
        "a poor match.\n\n"
        f"Transcript:\n{transcript_text}"
    )
