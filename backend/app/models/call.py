from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.analysis import Analysis
    from app.models.client import Client
    from app.models.insight import Insight
    from app.models.note import Note
    from app.models.participant import Participant
    from app.models.tag import CallTag, Tag
    from app.models.transcript import Transcript


class CallStatus(str, enum.Enum):
    pending = "pending"
    transcribing = "transcribing"
    analyzing = "analyzing"
    done = "done"
    failed = "failed"


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(
        Enum(
            "pending",
            "transcribing",
            "analyzing",
            "done",
            "failed",
            name="callstatus",
            native_enum=False,
            length=20,
        ),
        nullable=False,
        default="pending",
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(10))
    content_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    # Soft delete: rows with deleted_at IS NOT NULL are hidden from user-facing
    # endpoints (lists, detail, client view) but kept for cost / volume audits
    # in the dashboard. Cost cannot be "refunded" by removing a call.
    deleted_at: Mapped[datetime | None] = mapped_column(index=True)

    client: Mapped[Client | None] = relationship(back_populates="calls")
    transcript: Mapped[Transcript | None] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    analysis: Mapped[Analysis | None] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    call_tags: Mapped[list[CallTag]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    tags: Mapped[list[Tag]] = relationship(
        secondary="call_tags",
        viewonly=True,
        primaryjoin="Call.id == CallTag.call_id",
        secondaryjoin="CallTag.tag_id == Tag.id",
    )
    insights: Mapped[list[Insight]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    participants: Mapped[list[Participant]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    notes: Mapped[list[Note]] = relationship(
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="Note.created_at.desc()",
    )
