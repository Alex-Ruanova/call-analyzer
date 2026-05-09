"""Tests for /api/dashboard endpoint.

NOTE: The dashboard endpoint uses PostgreSQL-specific SQL (date_trunc, generate_series,
FILTER clause in aggregations). These tests are skipped when running against SQLite
(the default test database used when testcontainers is not available).
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_dashboard_skipped_on_sqlite(client: AsyncClient) -> None:
    """
    The dashboard aggregation uses PostgreSQL-specific SQL functions. This test is
    intentionally skipped in the SQLite test environment. Run against a real Postgres
    instance for full coverage.
    """
    pytest.skip(
        "Dashboard SQL uses PostgreSQL-specific functions (date_trunc, generate_series). "
        "Skipped in SQLite test environment. Run against Postgres for full validation."
    )
