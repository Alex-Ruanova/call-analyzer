from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.tag import Tag
from app.schemas.tag import TagOut

router = APIRouter()


@router.get("/tags", summary="List all tags", response_model=list[TagOut])
async def list_tags(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TagOut]:
    result = await session.execute(
        select(Tag).order_by(Tag.is_system.desc(), Tag.name.asc())
    )
    tags = result.scalars().all()
    return [TagOut.model_validate(t) for t in tags]
