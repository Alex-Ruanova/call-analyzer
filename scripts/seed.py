#!/usr/bin/env python3
"""
Seed the database with demo data only.

Inserts sample clients, calls, transcripts, analyses, insights and action items
so the dashboard renders something on first load. Purely illustrative — skip it
if you want to upload your own audio against a clean DB.

System tags are NOT seeded here; they are upserted by Alembic migration 0007
(see backend/app/llm/system_tags.py for the canonical list).

Idempotent: checks for existence per-table before inserting; re-running is safe.

Run inside the api container: python /app/scripts/seed.py
Or locally (with DATABASE_URL set): python scripts/seed.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

# Ensure app is importable when running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/altur")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("OPENAI_API_KEY", "sk-placeholder")
os.environ.setdefault("AUDIO_STORAGE_DIR", "/tmp/seed-audio")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.llm.system_tags import SYSTEM_TAG_NAMES
from app.models.analysis import Analysis
from app.models.call import Call
from app.models.client import Client
from app.models.insight import ActionItem, Insight
from app.models.tag import CallTag, Tag
from app.models.transcript import Transcript, TranscriptSegment


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

CLIENTS = [
    {"name": "Northwind Co", "industry": "Retail", "owner": "Alex Chen"},
    {"name": "Acme Corp", "industry": "Manufacturing", "owner": "Jordan Lee"},
    {"name": "Summit Labs", "industry": "Healthcare", "owner": "Morgan Kim"},
]

now = datetime.utcnow()

CALLS_DATA = [
    {
        "title": "Northwind — Initial Discovery",
        "client_idx": 0,
        "duration_seconds": 1824.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=14),
        "sentiment": "positive",
        "talk_rep": 0.52,
        "talk_client": 0.48,
        "headline": "Strong buying signals — decision maker engaged throughout",
        "summary": "Maya from Northwind expressed significant interest in the analytics module. She highlighted pain points around manual reporting and mentioned a 30-day decision window. Deal looks promising.",
        "tag_idxs": [0, 2],
        "insights": [
            {"kind": "buying-signal", "text": "We're spending 12 hours a week on manual reports — this would eliminate that entirely.", "segment_idx": 3, "weight": 2.0},
            {"kind": "pain-point", "text": "Current system requires manual data exports every Friday — slows down the whole team.", "segment_idx": 1, "weight": 1.5},
            {"kind": "next-step", "text": "Schedule demo for the full analytics suite next week.", "segment_idx": 8, "weight": 1.0},
        ],
        "action_items": [
            {"text": "Send product overview deck", "owner": "rep", "due_date": date.today() + timedelta(days=2)},
            {"text": "Schedule technical demo with IT team", "owner": "rep", "due_date": date.today() + timedelta(days=7)},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 45.2, "speaker": "SPEAKER_00", "role": "rep", "text": "Thanks for joining today, Maya. I wanted to start by understanding your current workflow before we dive into the product.", "mood": "neutral"},
            {"idx": 1, "start": 45.2, "end": 120.5, "speaker": "SPEAKER_01", "role": "client", "text": "Sure. We have a really manual process right now. Every Friday the ops team exports data from three different systems and compiles it into a spreadsheet. It takes about twelve hours a week.", "mood": "frustrated"},
            {"idx": 2, "start": 120.5, "end": 200.0, "speaker": "SPEAKER_00", "role": "rep", "text": "That's a significant time investment. How much of that is actually value-generating versus just data wrangling?", "mood": "neutral"},
            {"idx": 3, "start": 200.0, "end": 310.8, "speaker": "SPEAKER_01", "role": "client", "text": "Honestly? Maybe two of those twelve hours produce actual insights. The rest is just moving numbers around. If we could automate the pipeline, that team could focus on analysis.", "mood": "positive"},
            {"idx": 4, "start": 310.8, "end": 450.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Let me show you how our analytics module handles exactly that. You connect your data sources once and the system builds the dashboard automatically.", "mood": "positive"},
            {"idx": 5, "start": 450.0, "end": 580.3, "speaker": "SPEAKER_01", "role": "client", "text": "That's interesting. How long does the initial setup take? We have a pretty strict IT approval process.", "mood": "hesitant"},
            {"idx": 6, "start": 580.3, "end": 700.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Typically three to five business days for the connectors. We have pre-built integrations for most ERPs. I can send you our security documentation for the IT review.", "mood": "neutral"},
            {"idx": 7, "start": 700.0, "end": 850.0, "speaker": "SPEAKER_01", "role": "client", "text": "That would help. Our IT team reviews everything within two weeks, so if we started now we could potentially be live by end of month.", "mood": "positive"},
            {"idx": 8, "start": 850.0, "end": 1000.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Perfect. I'll set up a technical demo with your IT team next week. Does Thursday work?", "mood": "positive"},
        ],
    },
    {
        "title": "Acme Corp — Renewal Check-in",
        "client_idx": 1,
        "duration_seconds": 2340.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=7),
        "sentiment": "neutral",
        "talk_rep": 0.45,
        "talk_client": 0.55,
        "headline": "Renewal at risk — pricing objection and low adoption",
        "summary": "The Acme team is happy with the core product but raised concerns about adoption across their 200-person sales org. Pricing for additional seats was flagged as a blocker.",
        "tag_idxs": [1, 4, 5],
        "insights": [
            {"kind": "objection", "text": "The per-seat pricing at scale makes this a hard budget conversation.", "segment_idx": 2, "weight": 2.0},
            {"kind": "pain-point", "text": "Only 40 of the 200 licensed users log in weekly — adoption is the real problem.", "segment_idx": 4, "weight": 1.8},
            {"kind": "buying-signal", "text": "The reps who do use it consistently are closing 15% faster according to our data.", "segment_idx": 6, "weight": 1.5},
        ],
        "action_items": [
            {"text": "Prepare volume discount proposal", "owner": "rep", "due_date": date.today() + timedelta(days=3)},
            {"text": "Schedule enablement session for Acme sales managers", "owner": "rep", "due_date": date.today() + timedelta(days=14)},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 60.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Hey Daniel, good to catch up. Contract renews in 45 days — wanted to check in on how things are going.", "mood": "neutral"},
            {"idx": 1, "start": 60.0, "end": 180.0, "speaker": "SPEAKER_01", "role": "client", "text": "Honestly, the product works well for the reps who use it. But adoption is our big challenge. We licensed 200 seats and maybe 40 people use it regularly.", "mood": "neutral"},
            {"idx": 2, "start": 180.0, "end": 340.0, "speaker": "SPEAKER_01", "role": "client", "text": "And looking at renewal pricing, especially if we want to add the coaching module for the whole team, it's a significant number. The CFO is going to ask hard questions.", "mood": "hesitant"},
            {"idx": 3, "start": 340.0, "end": 480.0, "speaker": "SPEAKER_00", "role": "rep", "text": "That's fair. What would make the adoption story stronger for your internal renewal pitch?", "mood": "neutral"},
            {"idx": 4, "start": 480.0, "end": 620.0, "speaker": "SPEAKER_01", "role": "client", "text": "We need to show ROI. Right now I can tell you the 40 active users love it but I don't have the data to show what it's doing to their numbers.", "mood": "frustrated"},
            {"idx": 5, "start": 620.0, "end": 780.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Our analytics module can generate that report automatically. Let me pull your account data after this call and show you the before-and-after for those 40 active users.", "mood": "positive"},
            {"idx": 6, "start": 780.0, "end": 940.0, "speaker": "SPEAKER_01", "role": "client", "text": "That would actually be really helpful. If I can show the reps who use it are closing 15% faster, that's a compelling case.", "mood": "positive"},
        ],
    },
    {
        "title": "Summit Labs — Platform Demo",
        "client_idx": 2,
        "duration_seconds": 3120.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=3),
        "sentiment": "positive",
        "talk_rep": 0.60,
        "talk_client": 0.40,
        "headline": "High-intent demo — HIPAA compliance is the key unlocker",
        "summary": "Summit Labs is evaluating for a 50-seat pilot across their clinical sales team. HIPAA compliance and data residency were the primary technical concerns raised.",
        "tag_idxs": [0, 3],
        "insights": [
            {"kind": "buying-signal", "text": "We'd love to pilot with the clinical team — they're our biggest pain point right now.", "segment_idx": 5, "weight": 2.5},
            {"kind": "objection", "text": "HIPAA compliance is non-negotiable for anything touching patient-adjacent conversations.", "segment_idx": 2, "weight": 2.0},
            {"kind": "feature-req", "text": "Can the system flag when a rep accidentally mentions specific patient categories?", "segment_idx": 7, "weight": 1.5},
        ],
        "action_items": [
            {"text": "Send HIPAA BAA and SOC 2 Type II report", "owner": "rep", "due_date": date.today() + timedelta(days=1)},
            {"text": "Loop in security team for compliance review", "owner": "rep", "due_date": date.today() + timedelta(days=5)},
            {"text": "Draft pilot proposal for 50-seat clinical team", "owner": "rep", "due_date": date.today() + timedelta(days=10)},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 90.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Welcome to the demo. I'll walk you through the full platform today, focused on your clinical sales use case.", "mood": "neutral"},
            {"idx": 1, "start": 90.0, "end": 200.0, "speaker": "SPEAKER_01", "role": "client", "text": "Great. Our main use case is coaching our clinical reps — they're selling into hospital systems and the conversations are complex.", "mood": "neutral"},
            {"idx": 2, "start": 200.0, "end": 380.0, "speaker": "SPEAKER_01", "role": "client", "text": "Before we go further — HIPAA. We can't use any tool that isn't fully compliant. Our conversations often happen near patient discussions.", "mood": "hesitant"},
            {"idx": 3, "start": 380.0, "end": 520.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Absolutely understood. We're HIPAA compliant — BAA ready. All audio is processed and stored in US-East, encrypted at rest and in transit. I'll send you the full security package.", "mood": "positive"},
            {"idx": 4, "start": 520.0, "end": 680.0, "speaker": "SPEAKER_01", "role": "client", "text": "Good. And data residency — can we specify the region? Our legal team will want everything in US-East.", "mood": "neutral"},
            {"idx": 5, "start": 680.0, "end": 850.0, "speaker": "SPEAKER_01", "role": "client", "text": "This looks really promising. We'd love to pilot this with the clinical team — they're where we're losing the most opportunities right now.", "mood": "excited"},
            {"idx": 6, "start": 850.0, "end": 1020.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Perfect. A 50-seat pilot gives you enough coverage to see meaningful data. I'll draft a pilot proposal with pricing this week.", "mood": "positive"},
            {"idx": 7, "start": 1020.0, "end": 1180.0, "speaker": "SPEAKER_01", "role": "client", "text": "One more thing — can the system detect when a rep accidentally brings up specific patient categories they shouldn't? We had a compliance incident last quarter.", "mood": "neutral"},
        ],
    },
    {
        "title": "Northwind — Technical Demo Follow-up",
        "client_idx": 0,
        "duration_seconds": 1560.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=1),
        "sentiment": "positive",
        "talk_rep": 0.48,
        "talk_client": 0.52,
        "headline": "IT approved — moving to commercial terms",
        "summary": "IT review went smoothly. Maya has sign-off to move forward and is now working with procurement on timeline. Target go-live is end of month.",
        "tag_idxs": [3, 2],
        "insights": [
            {"kind": "buying-signal", "text": "IT gave us the green light. I can move this to procurement today.", "segment_idx": 1, "weight": 2.5},
            {"kind": "next-step", "text": "Send commercial proposal by Friday for procurement review.", "segment_idx": 4, "weight": 1.5},
        ],
        "action_items": [
            {"text": "Draft commercial proposal", "owner": "rep", "due_date": date.today() + timedelta(days=3)},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 60.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Hi Maya, how did the IT review go?", "mood": "neutral"},
            {"idx": 1, "start": 60.0, "end": 200.0, "speaker": "SPEAKER_01", "role": "client", "text": "Really well — IT gave us the green light yesterday. Your security docs were exactly what they needed. I can move this to procurement today.", "mood": "excited"},
            {"idx": 2, "start": 200.0, "end": 360.0, "speaker": "SPEAKER_00", "role": "rep", "text": "That's great news! What does the procurement timeline look like?", "mood": "positive"},
            {"idx": 3, "start": 360.0, "end": 500.0, "speaker": "SPEAKER_01", "role": "client", "text": "Typically two weeks for a standard vendor approval. If we target end of month go-live that means we need commercial terms by Friday.", "mood": "neutral"},
            {"idx": 4, "start": 500.0, "end": 640.0, "speaker": "SPEAKER_00", "role": "rep", "text": "I'll have the proposal to you by Thursday. Are there any specific terms your procurement team typically flags?", "mood": "positive"},
        ],
    },
    {
        "title": "Acme Corp — Adoption Workshop Prep",
        "client_idx": 1,
        "duration_seconds": 2700.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=10),
        "sentiment": "neutral",
        "talk_rep": 0.50,
        "talk_client": 0.50,
        "headline": "Adoption plan agreed — 8-week rollout with manager champions",
        "summary": "Acme and the team agreed on an 8-week adoption program. Six sales managers will champion the rollout. Monthly scorecard will track active users and close-rate impact.",
        "tag_idxs": [5],
        "insights": [
            {"kind": "next-step", "text": "Identify 6 manager champions for the first enablement cohort.", "segment_idx": 3, "weight": 1.5},
            {"kind": "pain-point", "text": "Previous tool rollout failed because there was no manager accountability.", "segment_idx": 1, "weight": 1.8},
        ],
        "action_items": [
            {"text": "Share adoption playbook template", "owner": "rep", "due_date": date.today() - timedelta(days=3), "done": True},
            {"text": "Set up monthly scorecard dashboard for Acme managers", "owner": "rep", "due_date": date.today() + timedelta(days=4)},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 80.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Let's talk about the adoption plan. What worked in previous software rollouts at Acme?", "mood": "neutral"},
            {"idx": 1, "start": 80.0, "end": 240.0, "speaker": "SPEAKER_01", "role": "client", "text": "Honestly the last tool we rolled out failed because there was no manager accountability. Reps just ignored it. We need the managers bought in first.", "mood": "frustrated"},
            {"idx": 2, "start": 240.0, "end": 400.0, "speaker": "SPEAKER_00", "role": "rep", "text": "That's exactly the pattern we see. We recommend starting with six manager champions who do the first two weeks themselves, then cascade to their teams.", "mood": "positive"},
            {"idx": 3, "start": 400.0, "end": 560.0, "speaker": "SPEAKER_01", "role": "client", "text": "I like that. I can identify six managers who are already data-driven — they'll be natural advocates.", "mood": "positive"},
        ],
    },
    {
        "title": "Summit Labs — Pricing Discussion",
        "client_idx": 2,
        "duration_seconds": 900.0,
        "status": "done",
        "language": "en",
        "created_at": now - timedelta(days=21),
        "sentiment": "neutral",
        "talk_rep": 0.55,
        "talk_client": 0.45,
        "headline": "Budget approved for pilot — awaiting legal sign-off on BAA",
        "summary": "Summit's VP of Sales confirmed budget for the 50-seat pilot. Legal is reviewing the BAA — expected to complete within 5 business days.",
        "tag_idxs": [4, 0],
        "insights": [
            {"kind": "buying-signal", "text": "Budget is approved at VP level — this is now a legal/procurement process.", "segment_idx": 2, "weight": 2.0},
            {"kind": "risk", "text": "Legal review could extend beyond the quarter close — flagging for forecast.", "segment_idx": 4, "weight": 1.5},
        ],
        "action_items": [
            {"text": "Follow up with legal on BAA status", "owner": "rep", "due_date": date.today() - timedelta(days=10), "done": True},
        ],
        "segments": [
            {"idx": 0, "start": 0.0, "end": 70.0, "speaker": "SPEAKER_00", "role": "rep", "text": "Quick update call — where are we on the pilot decision?", "mood": "neutral"},
            {"idx": 1, "start": 70.0, "end": 200.0, "speaker": "SPEAKER_01", "role": "client", "text": "We got budget sign-off from the VP of Sales yesterday. The 50-seat pilot is approved from a business perspective.", "mood": "positive"},
            {"idx": 2, "start": 200.0, "end": 340.0, "speaker": "SPEAKER_01", "role": "client", "text": "Now it's in legal's hands. They're reviewing the BAA. Our legal team usually takes 5 to 7 business days.", "mood": "neutral"},
            {"idx": 3, "start": 340.0, "end": 480.0, "speaker": "SPEAKER_00", "role": "rep", "text": "That timeline works. I'll check in on Friday. Is there anything legal usually flags that I should prepare materials for?", "mood": "neutral"},
            {"idx": 4, "start": 480.0, "end": 620.0, "speaker": "SPEAKER_01", "role": "client", "text": "Sometimes they want sub-processor documentation. Also they might push back on the data retention period — we'd want longer than your default 90 days.", "mood": "hesitant"},
        ],
    },
]


async def seed_demo(session: AsyncSession) -> None:
    """Insert sample clients/calls/transcripts/analyses for dashboard demos."""
    # System tags must already exist (upserted by Alembic migration 0007).
    result = await session.execute(select(Tag))
    tag_map: dict[str, Tag] = {t.name: t for t in result.scalars().all()}
    missing = [n for n in SYSTEM_TAG_NAMES if n not in tag_map]
    if missing:
        raise RuntimeError(
            f"System tags missing from DB: {missing}. "
            "Run `make migrate` to apply migration 0007 before seeding demo data."
        )

    # ---- Clients (upsert by name) ----
    client_objs: list[Client] = []
    for cd in CLIENTS:
        result = await session.execute(select(Client).where(Client.name == cd["name"]))
        client = result.scalar_one_or_none()
        if client is None:
            client = Client(name=cd["name"], industry=cd["industry"], owner=cd["owner"])
            session.add(client)
            await session.flush()
        client_objs.append(client)

    # ---- Calls ----
    tag_names = SYSTEM_TAG_NAMES

    for call_data in CALLS_DATA:
        # Idempotency: skip if a call with this title for this client already exists
        client = client_objs[call_data["client_idx"]]
        result = await session.execute(
            select(Call).where(Call.title == call_data["title"], Call.client_id == client.id)
        )
        if result.scalar_one_or_none() is not None:
            continue

        created_at = call_data["created_at"]
        filename = f"seed-{call_data['title'].lower().replace(' ', '-')[:40]}.mp3"

        call = Call(
            title=call_data["title"],
            client_id=client.id,
            filename=filename,
            original_filename=filename,
            content_type="audio/mpeg",
            size_bytes=int(call_data["duration_seconds"] * 16000),
            duration_seconds=call_data["duration_seconds"],
            status=call_data["status"],
            language=call_data["language"],
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(call)
        await session.flush()

        # Tags
        for tidx in call_data["tag_idxs"]:
            tname = tag_names[tidx]
            tag = tag_map[tname]
            session.add(CallTag(call_id=call.id, tag_id=tag.id, source="llm"))

        # Insights
        for ins_data in call_data["insights"]:
            session.add(Insight(
                call_id=call.id,
                kind=ins_data["kind"],
                text=ins_data["text"],
                segment_idx=ins_data["segment_idx"],
                weight=ins_data["weight"],
            ))

        # Action items
        for ai_data in call_data["action_items"]:
            session.add(ActionItem(
                call_id=call.id,
                text=ai_data["text"],
                owner=ai_data.get("owner"),
                due_date=ai_data.get("due_date"),
                done=ai_data.get("done", False),
            ))

        # Transcript + segments
        transcript = Transcript(
            call_id=call.id,
            language=call_data["language"],
            raw_payload_json={"seeded": True},
        )
        session.add(transcript)
        await session.flush()

        for seg in call_data["segments"]:
            session.add(TranscriptSegment(
                transcript_id=transcript.id,
                idx=seg["idx"],
                start_seconds=seg["start"],
                end_seconds=seg["end"],
                speaker_label=seg["speaker"],
                speaker_role=seg["role"],
                text=seg["text"],
                mood=seg["mood"],
            ))

        # Analysis
        cost_breakdown = {"stt": 0.002, "mood": 0.001, "tags": 0.001, "insights": 0.002, "synthesis": 0.001}
        session.add(Analysis(
            call_id=call.id,
            summary=call_data["summary"],
            headline=call_data["headline"],
            overall_sentiment=call_data["sentiment"],
            talk_ratio_rep=Decimal(str(call_data["talk_rep"])),
            talk_ratio_client=Decimal(str(call_data["talk_client"])),
            llm_model_used="gpt-4o-mini",
            prompt_version="v1",
            cost_usd_breakdown=cost_breakdown,
            cost_usd_total=Decimal(str(round(sum(cost_breakdown.values()), 4))),
        ))

    await session.commit()
    print(f"Demo seeded: {len(CLIENTS)} clients, {len(CALLS_DATA)} calls")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await seed_demo(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
