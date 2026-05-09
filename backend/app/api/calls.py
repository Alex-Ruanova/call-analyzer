from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Form, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.middleware import check_budget
from app.core.config import settings
from app.core.db import get_session
from app.core.errors import DomainError
from app.llm.schemas.synthesis import sentiment_to_score
from app.models.call import Call
from app.models.client import Client
from app.models.participant import Participant
from app.models.tag import CallTag, Tag
from app.models.transcript import Transcript
from app.schemas.call import (
    ActionItemOut,
    AnalysisOut,
    CallDetail,
    CallStatusOut,
    CallSummary,
    CallUpdate,
    InsightOut,
    ParticipantOut,
    ParticipantsRequest,
    TagOverrideRequest,
    TranscriptSegmentOut,
)
from app.schemas.tag import TagOut
from app.tasks.process_call import process_call

logger = logging.getLogger(__name__)


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter()

_MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB

_SORT_COLUMNS = {
    "date": Call.created_at,
    "title": Call.title,
    "duration": Call.duration_seconds,
    "status": Call.status,
}

_PROGRESS_MAP = {
    "pending": 0,
    "transcribing": 1,
    "analyzing": 3,
    "done": 5,
    "failed": -1,
}

_ALLOWED_EXTENSIONS = {".mp3", ".wav"}
_ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3"}


async def _load_call_detail(call_id: int, session: AsyncSession) -> Call | None:
    result = await session.execute(
        select(Call)
        .where(Call.id == call_id)
        .options(
            selectinload(Call.call_tags).selectinload(CallTag.tag),
            selectinload(Call.insights),
            selectinload(Call.action_items),
            selectinload(Call.analysis),
            selectinload(Call.participants),
            selectinload(Call.transcript).selectinload(Transcript.segments),
        )
    )
    return result.scalar_one_or_none()


def _call_to_detail(call: Call, client_name: str | None = None) -> CallDetail:
    """Convert a loaded Call ORM object to CallDetail schema."""
    tags = [
        TagOut(
            id=ct.tag.id,
            name=ct.tag.name,
            color=ct.tag.color,
            is_system=ct.tag.is_system,
            source=ct.source,
        )
        for ct in call.call_tags
    ]

    segments = []
    if call.transcript:
        segments = [
            TranscriptSegmentOut.model_validate(seg)
            for seg in sorted(call.transcript.segments, key=lambda s: s.idx)
        ]

    insights = [InsightOut.model_validate(i) for i in call.insights]
    action_items = [ActionItemOut.model_validate(a) for a in call.action_items]

    analysis = None
    if call.analysis:
        breakdown = call.analysis.cost_usd_breakdown or {}
        analysis = AnalysisOut(
            summary=call.analysis.summary,
            headline=call.analysis.headline,
            overall_sentiment=call.analysis.overall_sentiment,
            talk_ratio_rep=float(call.analysis.talk_ratio_rep),
            talk_ratio_client=float(call.analysis.talk_ratio_client),
            llm_model_used=call.analysis.llm_model_used,
            cost_usd_breakdown={k: float(v) for k, v in breakdown.items()},
            cost_usd_total=float(call.analysis.cost_usd_total),
        )

    overall_sentiment = call.analysis.overall_sentiment if call.analysis else None
    participants = [ParticipantOut.model_validate(p) for p in call.participants]

    return CallDetail(
        id=call.id,
        title=call.title,
        status=call.status,
        client_id=call.client_id,
        client_name=client_name,
        created_at=call.created_at,
        updated_at=call.updated_at,
        duration_seconds=call.duration_seconds,
        language=call.language,
        original_filename=call.original_filename,
        size_bytes=call.size_bytes,
        tags=tags,
        segments=segments,
        insights=insights,
        action_items=action_items,
        analysis=analysis,
        error_message=call.error_message,
        sentiment_score=sentiment_to_score(overall_sentiment),
        participants=participants,
    )


# IMPORTANT: bulk-delete must be registered BEFORE GET /calls/{id}
@router.post(
    "/calls/bulk-delete",
    summary="Bulk delete calls",
    responses={200: {"description": "Number of deleted calls"}},
)
async def bulk_delete_calls(
    body: BulkDeleteRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    ids = body.ids
    if not ids:
        return JSONResponse(content={"deleted": 0})

    # Fetch filenames before deleting
    result = await session.execute(select(Call.filename).where(Call.id.in_(ids)))
    filenames = [row[0] for row in result.fetchall()]

    delete_result = await session.execute(delete(Call).where(Call.id.in_(ids)))
    await session.commit()

    # Remove audio files
    storage = Path(settings.AUDIO_STORAGE_DIR)
    for filename in filenames:
        try:
            (storage / filename).unlink(missing_ok=True)
        except FileNotFoundError:
            pass

    return JSONResponse(content={"deleted": delete_result.rowcount})


@router.post(
    "/calls",
    summary="Upload a call recording",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        400: {"description": "Invalid file type or extension"},
        409: {"description": "Duplicate call"},
        413: {"description": "File too large"},
    },
)
async def upload_call(
    file: UploadFile,
    session: Annotated[AsyncSession, Depends(get_session)],
    _budget: Annotated[None, Depends(check_budget)],
    client_id: int | None = Form(None),
    title: str | None = Form(None),
    force: bool = Form(False),
) -> JSONResponse:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise DomainError(
            code="invalid_extension",
            message="Only .mp3 and .wav files are accepted",
            status_code=400,
        )

    if file.content_type and file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise DomainError(
            code="invalid_content_type",
            message=f"Content type '{file.content_type}' is not accepted",
            status_code=400,
        )

    dest_filename = f"{uuid4()}{ext}"
    dest_path = Path(settings.AUDIO_STORAGE_DIR) / dest_filename
    Path(settings.AUDIO_STORAGE_DIR).mkdir(parents=True, exist_ok=True)

    total = 0
    hasher = hashlib.sha256()
    chunk_size = 256 * 1024  # 256 KB read chunks

    with open(dest_path, "wb") as f:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_UPLOAD_BYTES:
                dest_path.unlink(missing_ok=True)
                raise DomainError(
                    code="file_too_large",
                    message="File exceeds 500 MB limit",
                    status_code=413,
                )
            hasher.update(chunk)
            f.write(chunk)

    content_sha256 = hasher.hexdigest()

    # Dedup: same sha256 + done. Caller can opt out with force=true to
    # explicitly reprocess (the frontend prompts the user when this happens).
    if not force:
        existing = await session.scalar(
            select(Call).where(
                Call.content_sha256 == content_sha256, Call.status == "done"
            )
        )
        if existing:
            dest_path.unlink(missing_ok=True)
            raise DomainError(
                code="duplicate_call",
                message=f"Call already processed as id={existing.id}",
                status_code=409,
            )

    if client_id is not None:
        client = await session.get(Client, client_id)
        if not client:
            dest_path.unlink(missing_ok=True)
            raise DomainError(
                code="client_not_found",
                message="Client not found",
                status_code=404,
            )

    call = Call(
        client_id=client_id,
        title=title or Path(file.filename or "").stem or dest_filename,
        filename=dest_filename,
        original_filename=file.filename or dest_filename,
        content_type=file.content_type or "audio/mpeg",
        size_bytes=total,
        content_sha256=content_sha256,
        status="pending",
    )
    session.add(call)
    await session.commit()
    await session.refresh(call)

    try:
        task = process_call.delay(call.id)
        call.celery_task_id = task.id
        await session.commit()
    except Exception as exc:
        logger.error("Failed to enqueue process_call for call %s: %s", call.id, exc)
        call.status = "failed"
        call.error_message = f"Failed to enqueue: {str(exc)[:400]}"
        await session.commit()

    return JSONResponse(status_code=202, content={"call_id": call.id})


@router.get(
    "/calls",
    summary="List calls",
    response_model=list[CallSummary],
)
async def list_calls(
    session: Annotated[AsyncSession, Depends(get_session)],
    search: str | None = None,
    tag: str | None = None,
    assigned: Literal["all", "assigned", "unassigned"] = "all",
    client_id: int | None = None,
    sort: Literal["date", "title", "duration", "status"] = "date",
    order: Literal["asc", "desc"] = "desc",
    limit: int = 50,
    offset: int = 0,
) -> list[CallSummary]:
    limit = min(limit, 200)
    stmt = select(Call).outerjoin(Client, Client.id == Call.client_id)

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Call.title.ilike(pattern) | Client.name.ilike(pattern)
        )

    if tag:
        stmt = stmt.join(CallTag, CallTag.call_id == Call.id).join(
            Tag, Tag.id == CallTag.tag_id
        ).where(Tag.name == tag)

    if assigned == "assigned":
        stmt = stmt.where(Call.client_id.isnot(None))
    elif assigned == "unassigned":
        stmt = stmt.where(Call.client_id.is_(None))

    if client_id is not None:
        stmt = stmt.where(Call.client_id == client_id)

    sort_col = _SORT_COLUMNS.get(sort, Call.created_at)
    stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc())
    stmt = stmt.offset(offset).limit(limit)

    # Eager-load tags for all matching calls in one query
    stmt = stmt.options(
        selectinload(Call.call_tags).selectinload(CallTag.tag),
        selectinload(Call.analysis),
    )
    result = await session.execute(stmt)
    calls = result.scalars().unique().all()

    if not calls:
        return []

    # Bulk-fetch client names in one query
    client_ids = [c.client_id for c in calls if c.client_id is not None]
    client_names: dict[int, str] = {}
    if client_ids:
        cn_rows = await session.execute(
            select(Client.id, Client.name).where(Client.id.in_(client_ids))
        )
        client_names = dict(cn_rows.fetchall())

    summaries = []
    for call in calls:
        tags = [
            TagOut(
                id=ct.tag.id,
                name=ct.tag.name,
                color=ct.tag.color,
                is_system=ct.tag.is_system,
                source=ct.source,
            )
            for ct in call.call_tags
        ]
        cost_usd_total = (
            float(call.analysis.cost_usd_total) if call.analysis else None
        )
        overall_sentiment = call.analysis.overall_sentiment if call.analysis else None
        summaries.append(
            CallSummary(
                id=call.id,
                title=call.title,
                status=call.status,
                client_id=call.client_id,
                client_name=client_names.get(call.client_id) if call.client_id else None,
                created_at=call.created_at,
                duration_seconds=call.duration_seconds,
                tags=tags,
                cost_usd_total=cost_usd_total,
                overall_sentiment=overall_sentiment,
                sentiment_score=sentiment_to_score(overall_sentiment),
            )
        )

    return summaries


@router.get(
    "/calls/{call_id}",
    summary="Get call detail",
    response_model=CallDetail,
    responses={404: {"description": "Not found"}},
)
async def get_call(
    call_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CallDetail:
    call = await _load_call_detail(call_id, session)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    client_name: str | None = None
    if call.client_id:
        cn_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = cn_row.scalar()

    return _call_to_detail(call, client_name=client_name)


@router.get(
    "/calls/{call_id}/status",
    summary="Get call processing status",
    response_model=CallStatusOut,
    responses={404: {"description": "Not found"}},
)
async def get_call_status(
    call_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CallStatusOut:
    call = await session.get(Call, call_id)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )
    return CallStatusOut(
        status=call.status,
        progress_step=_PROGRESS_MAP.get(call.status, 0),
        error_message=call.error_message,
    )


@router.patch(
    "/calls/{call_id}",
    summary="Update call metadata",
    response_model=CallDetail,
    responses={404: {"description": "Not found"}},
)
async def update_call(
    call_id: int,
    body: CallUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CallDetail:
    call = await session.get(Call, call_id)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    if body.title is not None:
        call.title = body.title
    if body.client_id is not None:
        client = await session.get(Client, body.client_id)
        if not client:
            raise DomainError(
                code="client_not_found",
                message="Client not found",
                status_code=404,
            )
        call.client_id = body.client_id

    await session.commit()

    call = await _load_call_detail(call_id, session)
    client_name: str | None = None
    if call.client_id:
        cn_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = cn_row.scalar()

    return _call_to_detail(call, client_name=client_name)


@router.patch(
    "/calls/{call_id}/tags",
    summary="Override call tags",
    response_model=CallDetail,
    responses={404: {"description": "Not found"}},
)
async def override_call_tags(
    call_id: int,
    body: TagOverrideRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CallDetail:
    call = await session.get(Call, call_id)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    # Resolve names → tag rows, creating any that don't exist yet (user-created
    # tags from the inline TagEditor have synthetic frontend IDs and only the
    # name is meaningful at this layer).
    requested_names = [n.strip() for n in body.tag_names if n and n.strip()]
    deduped_names: list[str] = []
    seen: set[str] = set()
    for n in requested_names:
        if n not in seen:
            seen.add(n)
            deduped_names.append(n)

    tag_id_by_name: dict[str, int] = {}
    if deduped_names:
        existing_rows = await session.execute(
            select(Tag).where(Tag.name.in_(deduped_names))
        )
        for tag in existing_rows.scalars().all():
            tag_id_by_name[tag.name] = tag.id

        for name in deduped_names:
            if name not in tag_id_by_name:
                new_tag = Tag(name=name, is_system=False)
                session.add(new_tag)
                await session.flush()
                tag_id_by_name[name] = new_tag.id

    # Full replace
    await session.execute(delete(CallTag).where(CallTag.call_id == call_id))
    for name in deduped_names:
        session.add(CallTag(call_id=call_id, tag_id=tag_id_by_name[name], source="user"))

    await session.commit()

    call = await _load_call_detail(call_id, session)
    client_name: str | None = None
    if call.client_id:
        cn_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = cn_row.scalar()

    return _call_to_detail(call, client_name=client_name)


@router.put(
    "/calls/{call_id}/participants",
    summary="Replace participants for a call",
    response_model=list[ParticipantOut],
    responses={404: {"description": "Not found"}},
)
async def replace_participants(
    call_id: int,
    body: ParticipantsRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ParticipantOut]:
    call = await session.get(Call, call_id)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    await session.execute(delete(Participant).where(Participant.call_id == call_id))
    for p in body.participants:
        if not p.speaker_label:
            continue
        session.add(
            Participant(
                call_id=call_id,
                speaker_label=p.speaker_label,
                display_name=p.display_name,
                role=p.role,
                side=p.side,
            )
        )
    await session.commit()

    rows = await session.execute(
        select(Participant).where(Participant.call_id == call_id)
    )
    return [ParticipantOut.model_validate(p) for p in rows.scalars().all()]


@router.delete(
    "/calls/{call_id}",
    summary="Delete a call",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Not found"}},
)
async def delete_call(
    call_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    call = await session.get(Call, call_id)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    filename = call.filename
    await session.delete(call)
    await session.commit()

    storage = Path(settings.AUDIO_STORAGE_DIR)
    try:
        (storage / filename).unlink(missing_ok=True)
    except FileNotFoundError:
        pass


@router.get(
    "/calls/{call_id}/export",
    summary="Export call as JSON download",
    responses={404: {"description": "Not found"}},
)
async def export_call(
    call_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    call = await _load_call_detail(call_id, session)
    if not call:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )

    client_name: str | None = None
    if call.client_id:
        cn_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = cn_row.scalar()

    detail = _call_to_detail(call, client_name=client_name)

    export_data = {
        "call": detail.model_dump(mode="json"),
        "transcript": {
            "segments": [s.model_dump(mode="json") for s in detail.segments]
        },
        "tags": [
            {"name": t.name, "source": t.source, "color": t.color}
            for t in detail.tags
        ],
        "insights": [i.model_dump(mode="json") for i in detail.insights],
        "action_items": [a.model_dump(mode="json") for a in detail.action_items],
        "analysis": detail.analysis.model_dump(mode="json") if detail.analysis else None,
        "exported_at": datetime.now(UTC).isoformat(),
    }

    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="call-{call_id}-export.json"'
        },
    )
