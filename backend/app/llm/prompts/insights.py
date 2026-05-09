PROMPT_VERSION = "v1"


def build_prompt(transcript_text: str) -> str:
    return (
        "Extract structured insights from this sales call transcript.\n"
        "Types: pain-point, objection, buying-signal, feature-req, competitor, "
        "pricing, next-step, quote, risk, highlight.\n"
        "Also extract explicit action items (who, what, when if stated).\n"
        "Weight importance 0.0–2.0. Include segment_idx if mappable.\n\n"
        f"Transcript:\n{transcript_text}"
    )
