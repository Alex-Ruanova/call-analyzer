from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Form, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.middleware import check_budget
from app.core.config import settings
from app.core.db import get_session
from app.core.errors import DomainError
from app.models.analysis import Analysis
from app.models.call import Call
from app.models.client import Client
from app.models.insight import ActionItem, Insight
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
    TagOverrideRequest,
    TranscriptSegmentOut,
)
from app.schemas.tag import TagOut

try:
    from app.tasks.process_call import process_call  # TODO: Phase 4
except ImportError:
    process_call = None  # type: ignore[assignment]

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


async def _load_call_detail(call_id: int, session: AsyncSession) -> Call:
    """Load a Call with all related data for detail responses."""
    result = await session.execute(
        select(Call)
        .where(Call.id == call_id)
        .options(
            selectinload(Call.call_tags).selectinload(CallTag.tag),
            selectinload(Call.insights),
            selectinload(Call.action_items),
            selectinload(Call.analysis),
            selectinload(Call.transcript).selectinload(Transcript.segments),
        )
    )
    return result.scalar_one_or_none()  # type: ignore[return-value]


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
    )


# IMPORTANT: bulk-delete must be registered BEFORE GET /calls/{id}
@router.post(
    "/calls/bulk-delete",
    summary="Bulk delete calls",
    responses={200: {"description": "Number of deleted calls"}},
)
async def bulk_delete_calls(
    body: dict,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    ids: list[int] = body.get("ids", [])
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

    from uuid import uuid4

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

    # Dedup: same sha256 + done
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

    # Enqueue processing task (Phase 4)
    if process_call is not None:
        try:
            task = process_call.delay(call.id)
            call.celery_task_id = task.id
            await session.commit()
        except Exception:
            pass  # Task queuing failure is non-fatal at upload time

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

    result = await session.execute(stmt)
    calls = result.scalars().unique().all()

    # Build summaries with joined data
    summaries = []
    for call in calls:
        # Get client name
        client_name: str | None = None
        if call.client_id:
            cn_row = await session.execute(
                select(Client.name).where(Client.id == call.client_id)
            )
            client_name = cn_row.scalar()

        # Get analysis cost
        cost_row = await session.execute(
            select(Analysis.cost_usd_total).where(Analysis.call_id == call.id)
        )
        cost_usd_total = cost_row.scalar()

        # Get tags
        tag_rows = await session.execute(
            select(CallTag, Tag)
            .join(Tag, Tag.id == CallTag.tag_id)
            .where(CallTag.call_id == call.id)
        )
        tags = [
            TagOut(
                id=t.id,
                name=t.name,
                color=t.color,
                is_system=t.is_system,
                source=ct.source,
            )
            for ct, t in tag_rows.fetchall()
        ]

        summaries.append(
            CallSummary(
                id=call.id,
                title=call.title,
                status=call.status,
                client_id=call.client_id,
                client_name=client_name,
                created_at=call.created_at,
                duration_seconds=call.duration_seconds,
                tags=tags,
                cost_usd_total=(
                    float(cost_usd_total) if cost_usd_total is not None else None
                ),
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

    # Validate all tag IDs exist
    if body.tag_ids:
        tags_result = await session.execute(
            select(Tag).where(Tag.id.in_(body.tag_ids))
        )
        found_tags = tags_result.scalars().all()
        if len(found_tags) != len(body.tag_ids):
            raise DomainError(
                code="tag_not_found",
                message="One or more tag IDs not found",
                status_code=404,
            )

    # Full replace
    await session.execute(delete(CallTag).where(CallTag.call_id == call_id))
    for tag_id in body.tag_ids:
        session.add(CallTag(call_id=call_id, tag_id=tag_id, source="user"))

    await session.commit()

    call = await _load_call_detail(call_id, session)
    client_name: str | None = None
    if call.client_id:
        cn_row = await session.execute(
            select(Client.name).where(Client.id == call.client_id)
        )
        client_name = cn_row.scalar()

    return _call_to_detail(call, client_name=client_name)


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
