from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.call import Call


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(50), nullable=False, default="#6b7280")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class CallTag(Base):
    __tablename__ = "call_tags"

    call_id: Mapped[int] = mapped_column(
        ForeignKey("calls.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False)

    call: Mapped[Call] = relationship(back_populates="call_tags")
    tag: Mapped[Tag] = relationship()

    __table_args__ = (Index("ix_call_tag_tag_id", "tag_id"),)
