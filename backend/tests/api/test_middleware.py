"""Tests for auth, budget, and rate-limit middleware."""
from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_auth_disabled_passes_without_key(client: AsyncClient) -> None:
    """When AUTH_ENABLED=False, all routes are accessible without X-API-Key."""
    import app.core.config as config_module
    original = config_module.settings.AUTH_ENABLED
    config_module.settings.AUTH_ENABLED = False

    try:
        resp = await client.get("/api/tags")
        assert resp.status_code == 200
    finally:
        config_module.settings.AUTH_ENABLED = original


@pytest.mark.anyio
async def test_auth_enabled_missing_key_returns_401() -> None:
    """When AUTH_ENABLED=True and no key provided, APIKeyMiddleware rejects with 401."""
    from unittest.mock import AsyncMock
    from starlette.testclient import TestClient
    from starlette.requests import Request
    from app.api.middleware import APIKeyMiddleware
    import app.api.middleware as mw_module
    import app.core.config as config_module

    original_auth = config_module.settings.AUTH_ENABLED
    original_key = config_module.settings.API_KEY
    config_module.settings.AUTH_ENABLED = True
    config_module.settings.API_KEY = "secret-test-key"

    try:
        # Test dispatch logic directly: build a mock request and call_next
        mw = APIKeyMiddleware(app=None)  # type: ignore[arg-type]

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/tags",
            "query_string": b"",
            "headers": [],
        }
        request = Request(scope)

        call_next_called = False

        async def call_next(req):
            nonlocal call_next_called
            call_next_called = True
            from starlette.responses import Response
            return Response("ok", status_code=200)

        response = await mw.dispatch(request, call_next)
        assert response.status_code == 401
        assert not call_next_called
    finally:
        config_module.settings.AUTH_ENABLED = original_auth
        config_module.settings.API_KEY = original_key


@pytest.mark.anyio
async def test_auth_enabled_correct_key_passes() -> None:
    """When AUTH_ENABLED=True and correct key provided, APIKeyMiddleware passes through."""
    from starlette.requests import Request
    from starlette.responses import Response
    from app.api.middleware import APIKeyMiddleware
    import app.core.config as config_module

    original_auth = config_module.settings.AUTH_ENABLED
    original_key = config_module.settings.API_KEY
    config_module.settings.AUTH_ENABLED = True
    config_module.settings.API_KEY = "secret-test-key"

    try:
        mw = APIKeyMiddleware(app=None)  # type: ignore[arg-type]

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/tags",
            "query_string": b"",
            "headers": [(b"x-api-key", b"secret-test-key")],
        }
        request = Request(scope)

        call_next_called = False

        async def call_next(req):
            nonlocal call_next_called
            call_next_called = True
            return Response("ok", status_code=200)

        response = await mw.dispatch(request, call_next)
        assert response.status_code == 200
        assert call_next_called
    finally:
        config_module.settings.AUTH_ENABLED = original_auth
        config_module.settings.API_KEY = original_key


@pytest.mark.anyio
async def test_budget_exceeded_returns_429(client: AsyncClient) -> None:
    """When daily budget is exceeded, POST /api/calls returns 429."""
    from app.core.errors import DomainError
    from app.api.middleware import check_budget
    from app.main import app as fastapi_app

    async def mock_budget_exceeded() -> None:
        raise DomainError(
            code="budget_exceeded",
            message="Daily budget exceeded",
            status_code=429,
        )

    fastapi_app.dependency_overrides[check_budget] = mock_budget_exceeded
    try:
        audio = b"\xff\xfb" + b"\x00" * 50
        resp = await client.post(
            "/api/calls",
            data={"title": "Budget Test"},
            files={"file": ("b.mp3", io.BytesIO(audio), "audio/mpeg")},
        )
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == "budget_exceeded"
    finally:
        fastapi_app.dependency_overrides.pop(check_budget, None)


@pytest.mark.anyio
async def test_rate_limit_exceeded_returns_429(client: AsyncClient) -> None:
    """When rate limit is exceeded via middleware, POST /api/calls returns 429."""
    import app.core.config as config_module
    import app.api.middleware as mw_module

    original_limit = config_module.settings.RATE_LIMIT_UPLOADS_PER_HOUR

    # Patch the middleware's redis to return a count above the limit
    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(return_value=999)
    mock_redis.expire = AsyncMock(return_value=True)

    config_module.settings.RATE_LIMIT_UPLOADS_PER_HOUR = 5

    with patch.object(mw_module, "_get_redis_client", return_value=mock_redis):
        with patch.object(mw_module, "settings", config_module.settings):
            try:
                audio = b"\xff\xfb" + b"\x00" * 50
                resp = await client.post(
                    "/api/calls",
                    data={"title": "Rate Test"},
                    files={"file": ("r.mp3", io.BytesIO(audio), "audio/mpeg")},
                )
                assert resp.status_code == 429
                assert resp.json()["error"]["code"] == "rate_limited"
            finally:
                config_module.settings.RATE_LIMIT_UPLOADS_PER_HOUR = original_limit
