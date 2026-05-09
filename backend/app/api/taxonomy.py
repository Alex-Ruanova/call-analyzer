from fastapi import APIRouter

router = APIRouter()

EMOTIONS = [
    {"name": "positive", "color": "#22c55e"},
    {"name": "neutral", "color": "#6b7280"},
    {"name": "negative", "color": "#ef4444"},
    {"name": "frustrated", "color": "#f97316"},
    {"name": "enthusiastic", "color": "#3b82f6"},
    {"name": "confused", "color": "#a855f7"},
    {"name": "concerned", "color": "#eab308"},
]

HIGHLIGHTS = [
    {"name": "pain-point", "label": "Pain Point"},
    {"name": "objection", "label": "Objection"},
    {"name": "buying-signal", "label": "Buying Signal"},
    {"name": "feature-req", "label": "Feature Request"},
    {"name": "competitor", "label": "Competitor Mention"},
    {"name": "pricing", "label": "Pricing Discussion"},
    {"name": "next-step", "label": "Next Step"},
    {"name": "quote", "label": "Quote"},
    {"name": "risk", "label": "Risk"},
    {"name": "highlight", "label": "Highlight"},
]


@router.get("/taxonomy/emotions", summary="List emotion taxonomy")
async def list_emotions() -> list[dict]:
    return EMOTIONS


@router.get("/taxonomy/highlights", summary="List highlight taxonomy")
async def list_highlights() -> list[dict]:
    return HIGHLIGHTS
