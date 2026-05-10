"""User notes per call."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import DomainError
from app.models.call import Call
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate

router = APIRouter()


async def _ensure_call(session: AsyncSession, call_id: int) -> None:
    call = await session.get(Call, call_id)
    if not call or call.deleted_at is not None:
        raise DomainError(
            code="call_not_found",
            message=f"Call {call_id} not found",
            status_code=404,
        )


async def _get_note_or_404(session: AsyncSession, note_id: int) -> Note:
    note = await session.get(Note, note_id)
    if not note:
        raise DomainError(
            code="note_not_found",
            message=f"Note {note_id} not found",
            status_code=404,
        )
    return note


@router.get(
    "/calls/{call_id}/notes",
    summary="List notes for a call",
    response_model=list[NoteOut],
)
async def list_notes(
    call_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[NoteOut]:
    await _ensure_call(session, call_id)
    result = await session.execute(
        select(Note).where(Note.call_id == call_id).order_by(Note.created_at.desc())
    )
    return [NoteOut.model_validate(n) for n in result.scalars().all()]


@router.post(
    "/calls/{call_id}/notes",
    summary="Create a note on a call",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_note(
    call_id: int,
    body: NoteCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NoteOut:
    await _ensure_call(session, call_id)
    note = Note(call_id=call_id, text=body.text.strip())
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return NoteOut.model_validate(note)


@router.patch(
    "/notes/{note_id}",
    summary="Update note text",
    response_model=NoteOut,
)
async def update_note(
    note_id: int,
    body: NoteUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NoteOut:
    note = await _get_note_or_404(session, note_id)
    note.text = body.text.strip()
    await session.commit()
    await session.refresh(note)
    return NoteOut.model_validate(note)


@router.delete(
    "/notes/{note_id}",
    summary="Delete a note",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_note(
    note_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    note = await _get_note_or_404(session, note_id)
    await session.delete(note)
    await session.commit()
