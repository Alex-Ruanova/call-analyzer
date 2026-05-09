from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.call import Call


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[int] = mapped_column(
        ForeignKey("calls.id", ondelete="CASCADE"), unique=True
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    headline: Mapped[str] = mapped_column(String(500), nullable=False)
    overall_sentiment: Mapped[str] = mapped_column(String(50), nullable=False)
    talk_ratio_rep: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    talk_ratio_client: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    llm_model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    cost_usd_breakdown: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {}
    )
    cost_usd_total: Mapped[float] = mapped_column(
        Numeric(10, 6), nullable=False, default=0.0
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    call: Mapped[Call] = relationship(back_populates="analysis")
