"""One-off backfill: fill calls.duration_seconds from MAX(transcript_segments.end_seconds).

Use after adding the duration fallback in pipeline.py for rows that were processed
before the fix landed.

Run with:
    conda run -n call-analyzer python scripts/backfill_call_duration.py
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.core.db import async_session_maker

logger = logging.getLogger(__name__)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    async with async_session_maker() as session:
        result = await session.execute(
            text(
                "UPDATE calls c "
                "SET duration_seconds = sub.max_end "
                "FROM ( "
                "  SELECT t.call_id, MAX(s.end_seconds) AS max_end "
                "  FROM transcripts t "
                "  JOIN transcript_segments s ON s.transcript_id = t.id "
                "  GROUP BY t.call_id "
                ") AS sub "
                "WHERE c.id = sub.call_id "
                "  AND c.duration_seconds IS NULL "
                "  AND sub.max_end IS NOT NULL"
            )
        )
        await session.commit()
        logger.info("Updated %d call rows", result.rowcount)


if __name__ == "__main__":
    asyncio.run(main())
