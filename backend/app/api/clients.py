from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import DomainError
from app.llm.schemas.synthesis import sentiment_to_score
from app.models.analysis import Analysis
from app.models.call import Call
from app.models.client import Client
from app.models.tag import CallTag, Tag
from app.schemas.call import CallSummary, TagOut
from app.schemas.client import ClientCreate, ClientDetail, ClientOut

router = APIRouter()


async def _build_client_out(session: AsyncSession, client: Client) -> ClientOut:
    """Build ClientOut with computed fields via SQL aggregates."""
    row = await session.execute(
        select(
            func.count(Call.id).label("calls"),
            func.max(Call.created_at).label("last_call"),
        ).where(Call.client_id == client.id)
    )
    agg = row.fetchone()

    # Most common sentiment for done calls
    sent_row = await session.execute(
        select(Analysis.overall_sentiment, func.count(Analysis.id).label("cnt"))
        .join(Call, Call.id == Analysis.call_id)
        .where(Call.client_id == client.id, Call.status == "done")
        .group_by(Analysis.overall_sentiment)
        .order_by(func.count(Analysis.id).desc())
        .limit(1)
    )
    sent = sent_row.fetchone()
    sentiment_label = sent[0] if sent else None

    return ClientOut(
        id=client.id,
        name=client.name,
        industry=client.industry,
        owner=client.owner,
        created_at=client.created_at,
        calls=agg[0] if agg else 0,
        last_call=agg[1] if agg else None,
        sentiment=sentiment_label,
        sentiment_score=sentiment_to_score(sentiment_label),
    )


async def _build_call_summary(session: AsyncSession, call: Call) -> CallSummary:
    """Build CallSummary with client_name and cost_usd_total via SQL."""
    # Get client name
    client_name: str | None = None
    if call.client_id:
        client_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = client_row.scalar()

    # Get cost and sentiment
    analysis_row = await session.execute(
        select(Analysis.cost_usd_total, Analysis.overall_sentiment).where(
            Analysis.call_id == call.id
        )
    )
    analysis_data = analysis_row.fetchone()
    cost_usd_total = analysis_data[0] if analysis_data else None
    overall_sentiment = analysis_data[1] if analysis_data else None

    # Get tags via call_tags
    tag_rows = await session.execute(
        select(CallTag, Tag)
        .join(Tag, Tag.id == CallTag.tag_id)
        .where(CallTag.call_id == call.id)
    )
    tags = [
        TagOut(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            is_system=tag.is_system,
            source=ct.source,
        )
        for ct, tag in tag_rows.fetchall()
    ]

    return CallSummary(
        id=call.id,
        title=call.title,
        status=call.status,
        client_id=call.client_id,
        client_name=client_name,
        created_at=call.created_at,
        duration_seconds=call.duration_seconds,
        tags=tags,
        cost_usd_total=float(cost_usd_total) if cost_usd_total is not None else None,
        overall_sentiment=overall_sentiment,
        sentiment_score=sentiment_to_score(overall_sentiment),
    )


@router.get("/clients", summary="List clients", response_model=list[ClientOut])
async def list_clients(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ClientOut]:
    result = await session.execute(select(Client).order_by(Client.name.asc()))
    clients = result.scalars().all()
    return [await _build_client_out(session, c) for c in clients]


@router.post(
    "/clients",
    summary="Create client",
    response_model=ClientOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_client(
    body: ClientCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClientOut:
    # Check for duplicate name (explicit check since model has no DB-level unique constraint)
    existing = await session.scalar(select(Client).where(Client.name == body.name))
    if existing:
        raise DomainError(
            code="client_exists",
            message=f"A client named '{body.name}' already exists",
            status_code=409,
        )

    client = Client(name=body.name, industry=body.industry, owner=body.owner)
    session.add(client)
    try:
        await session.commit()
        await session.refresh(client)
    except IntegrityError:
        await session.rollback()
        raise DomainError(
            code="client_exists",
            message=f"A client named '{body.name}' already exists",
            status_code=409,
        )
    return await _build_client_out(session, client)


@router.get(
    "/clients/{client_id}",
    summary="Get client detail",
    response_model=ClientDetail,
    responses={404: {"description": "Not found"}},
)
async def get_client(
    client_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClientDetail:
    client = await session.get(Client, client_id)
    if not client:
        raise DomainError(
            code="client_not_found",
            message=f"Client {client_id} not found",
            status_code=404,
        )

    client_out = await _build_client_out(session, client)

    # Recent calls
    recent_result = await session.execute(
        select(Call)
        .where(Call.client_id == client_id)
        .order_by(Call.created_at.desc())
        .limit(10)
    )
    recent_calls_models = recent_result.scalars().all()
    recent_calls = [await _build_call_summary(session, c) for c in recent_calls_models]

    return ClientDetail(
        id=client_out.id,
        name=client_out.name,
        industry=client_out.industry,
        owner=client_out.owner,
        created_at=client_out.created_at,
        calls=client_out.calls,
        last_call=client_out.last_call,
        sentiment=client_out.sentiment,
        sentiment_score=client_out.sentiment_score,
        recent_calls=recent_calls,
    )
