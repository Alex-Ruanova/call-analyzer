from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.analysis import Analysis
from app.models.call import Call
from app.models.insight import Insight
from app.schemas.dashboard import (
    DailyCallsPoint,
    DashboardOut,
    KPIItem,
    PipelineStage,
    SentimentPoint,
    TopPainPoint,
)

router = APIRouter()


@router.get("/dashboard", summary="Dashboard aggregations", response_model=DashboardOut)
async def get_dashboard(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DashboardOut:
    # --- calls_this_week ---
    calls_this_week_row = await session.execute(
        text(
            "SELECT COUNT(*) FROM calls WHERE created_at >= date_trunc('week', now())"
        )
    )
    calls_this_week_val = calls_this_week_row.scalar() or 0

    calls_prior_week_row = await session.execute(
        text(
            "SELECT COUNT(*) FROM calls "
            "WHERE created_at >= date_trunc('week', now()) - INTERVAL '7 days' "
            "AND created_at < date_trunc('week', now())"
        )
    )
    calls_prior_week_val = calls_prior_week_row.scalar() or 0
    calls_this_week_delta = float(calls_this_week_val - calls_prior_week_val)

    # --- avg_sentiment (fraction positive in last 30d) ---
    sentiment_row = await session.execute(
        text(
            "SELECT "
            "  COUNT(*) FILTER (WHERE a.overall_sentiment = 'positive') AS pos, "
            "  COUNT(*) AS total "
            "FROM calls c "
            "JOIN analyses a ON a.call_id = c.id "
            "WHERE c.status = 'done' AND c.created_at >= now() - INTERVAL '30 days'"
        )
    )
    sent = sentiment_row.fetchone()
    sent_pos = sent[0] or 0
    sent_total = sent[1] or 0
    avg_sentiment_val = float(sent_pos) / float(sent_total) if sent_total > 0 else 0.0

    prior_sentiment_row = await session.execute(
        text(
            "SELECT "
            "  COUNT(*) FILTER (WHERE a.overall_sentiment = 'positive') AS pos, "
            "  COUNT(*) AS total "
            "FROM calls c "
            "JOIN analyses a ON a.call_id = c.id "
            "WHERE c.status = 'done' "
            "AND c.created_at >= now() - INTERVAL '60 days' "
            "AND c.created_at < now() - INTERVAL '30 days'"
        )
    )
    prior_sent = prior_sentiment_row.fetchone()
    prior_sent_pos = prior_sent[0] or 0
    prior_sent_total = prior_sent[1] or 0
    prior_avg_sentiment = (
        float(prior_sent_pos) / float(prior_sent_total) if prior_sent_total > 0 else 0.0
    )
    avg_sentiment_delta = avg_sentiment_val - prior_avg_sentiment

    # --- talk_listen_ratio (AVG talk_ratio_rep last 30d) ---
    tlr_row = await session.execute(
        text(
            "SELECT AVG(CAST(a.talk_ratio_rep AS FLOAT)) "
            "FROM calls c "
            "JOIN analyses a ON a.call_id = c.id "
            "WHERE c.status = 'done' AND c.created_at >= now() - INTERVAL '30 days'"
        )
    )
    tlr_val = tlr_row.scalar()
    talk_listen_ratio_val = float(tlr_val) if tlr_val is not None else 0.0

    prior_tlr_row = await session.execute(
        text(
            "SELECT AVG(CAST(a.talk_ratio_rep AS FLOAT)) "
            "FROM calls c "
            "JOIN analyses a ON a.call_id = c.id "
            "WHERE c.status = 'done' "
            "AND c.created_at >= now() - INTERVAL '60 days' "
            "AND c.created_at < now() - INTERVAL '30 days'"
        )
    )
    prior_tlr_val = prior_tlr_row.scalar()
    prior_tlr = float(prior_tlr_val) if prior_tlr_val is not None else 0.0
    tlr_delta = talk_listen_ratio_val - prior_tlr

    # --- sentiment_trend (last 12 calendar weeks) ---
    trend_rows = await session.execute(
        text(
            "SELECT "
            "  to_char(date_trunc('week', c.created_at), 'IYYY-\"W\"IW') AS week, "
            "  COUNT(*) FILTER (WHERE a.overall_sentiment = 'positive') AS positive, "
            "  COUNT(*) FILTER (WHERE a.overall_sentiment = 'neutral') AS neutral, "
            "  COUNT(*) FILTER (WHERE a.overall_sentiment = 'negative') AS negative "
            "FROM calls c "
            "JOIN analyses a ON a.call_id = c.id "
            "WHERE c.status = 'done' "
            "AND c.created_at >= date_trunc('week', now()) - INTERVAL '11 weeks' "
            "GROUP BY week "
            "ORDER BY week ASC"
        )
    )
    trend_data = {
        row[0]: SentimentPoint(
            week=row[0],
            positive=row[1] or 0,
            neutral=row[2] or 0,
            negative=row[3] or 0,
        )
        for row in trend_rows.fetchall()
    }

    # Fill missing weeks with zeros
    fill_rows = await session.execute(
        text(
            "SELECT to_char("
            "  date_trunc('week', now()) - (n || ' weeks')::INTERVAL, "
            "  'IYYY-\"W\"IW'"
            ") AS week "
            "FROM generate_series(0, 11) AS n "
            "ORDER BY week ASC"
        )
    )
    all_weeks = [row[0] for row in fill_rows.fetchall()]
    sentiment_trend = [
        trend_data.get(w, SentimentPoint(week=w, positive=0, neutral=0, negative=0))
        for w in all_weeks
    ]

    # --- calls_per_day (last 14 days) ---
    cpd_rows = await session.execute(
        text(
            "SELECT "
            "  to_char(date_trunc('day', c.created_at), 'YYYY-MM-DD') AS day, "
            "  COUNT(*) AS cnt "
            "FROM calls c "
            "WHERE c.created_at >= now() - INTERVAL '13 days' "
            "GROUP BY day "
            "ORDER BY day ASC"
        )
    )
    cpd_data = {row[0]: row[1] for row in cpd_rows.fetchall()}

    fill_days_rows = await session.execute(
        text(
            "SELECT to_char(now() - (n || ' days')::INTERVAL, 'YYYY-MM-DD') AS day "
            "FROM generate_series(0, 13) AS n "
            "ORDER BY day ASC"
        )
    )
    all_days = [row[0] for row in fill_days_rows.fetchall()]
    calls_per_day = [
        DailyCallsPoint(date=d, count=cpd_data.get(d, 0)) for d in all_days
    ]

    # --- pipeline (by status) ---
    pipeline_rows = await session.execute(
        select(Call.status, func.count(Call.id).label("cnt")).group_by(Call.status)
    )
    pipeline = [
        PipelineStage(stage=row[0], count=row[1])
        for row in pipeline_rows.fetchall()
    ]

    # --- top_pain_points ---
    pain_rows = await session.execute(
        text(
            "SELECT text, COUNT(*) AS cnt, SUM(weight) AS total_weight "
            "FROM insights "
            "WHERE kind = 'pain-point' "
            "GROUP BY text "
            "ORDER BY total_weight DESC "
            "LIMIT 10"
        )
    )
    top_pain_points = [
        TopPainPoint(text=row[0], count=row[1], weight=float(row[2]))
        for row in pain_rows.fetchall()
    ]

    return DashboardOut(
        calls_this_week=KPIItem(value=calls_this_week_val, delta=calls_this_week_delta),
        avg_sentiment=KPIItem(value=avg_sentiment_val, delta=avg_sentiment_delta),
        conversion_rate=KPIItem(value=0.0, delta=None),
        talk_listen_ratio=KPIItem(value=talk_listen_ratio_val, delta=tlr_delta),
        sentiment_trend=sentiment_trend,
        calls_per_day=calls_per_day,
        pipeline=pipeline,
        top_pain_points=top_pain_points,
    )
