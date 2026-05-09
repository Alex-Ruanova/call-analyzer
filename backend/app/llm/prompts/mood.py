PROMPT_VERSION = "v1"


def build_prompt(segments: list[dict]) -> str:
    lines = "\n".join(f"[{s['idx']}] {s['text']}" for s in segments)
    return (
        "You are analyzing sales call segments for emotional tone.\n"
        "Return mood for each segment index. Valid moods: "
        "positive, neutral, negative, frustrated, enthusiastic, confused, concerned.\n\n"
        f"{lines}"
    )
