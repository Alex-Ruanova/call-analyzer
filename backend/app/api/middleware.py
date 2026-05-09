from __future__ import annotations

import secrets
from datetime import UTC, date, datetime

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.errors import DomainError


def _error_body(code: str, message: str) -> dict[str, object]:
    return {"error": {"code": code, "message": message, "details": None}}


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Skip OPTIONS (CORS preflight) and non-/api/ paths
        if request.method == "OPTIONS" or not request.url.path.startswith("/api/"):
            return await call_next(request)

        if not settings.AUTH_ENABLED or not settings.API_KEY:
            return await call_next(request)

        provided = request.headers.get("X-API-Key", "")
        if not provided or not secrets.compare_digest(settings.API_KEY, provided):
            return JSONResponse(
                status_code=401,
                content=_error_body("unauthorized", "Missing or invalid API key"),
            )

        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP upload rate limit. Only applies to POST /api/calls."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        limit = settings.RATE_LIMIT_UPLOADS_PER_HOUR
        if limit <= 0:
            return await call_next(request)

        if request.method != "POST" or request.url.path != "/api/calls":
            return await call_next(request)

        redis = _get_redis_client()
        if redis is None:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(UTC)
        key = f"ratelimit:{client_ip}:{now.date().isoformat()}:{now.hour}"

        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, 3600)
            if count > limit:
                return JSONResponse(
                    status_code=429,
                    content=_error_body("rate_limited", "Upload rate limit exceeded"),
                )
        except Exception:
            # Redis unavailable — fail open
            pass

        return await call_next(request)


def _get_redis_client():
    """Lazy singleton redis async client. Returns None if REDIS_URL not set."""
    import redis.asyncio as aioredis
    try:
        return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def check_budget() -> None:
    """FastAPI dependency for budget guard. Raises 429 if daily spend exceeded."""
    daily_budget = settings.DAILY_BUDGET_USD
    if daily_budget <= 0:
        return

    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        today = date.today().isoformat()
        raw = await r.get(f"spend:{today}")
        await r.aclose()
        spent = float(raw) if raw else 0.0
    except Exception:
        # Redis unavailable — fail open
        return

    if spent >= daily_budget:
        raise DomainError(
            code="budget_exceeded",
            message=f"Daily budget of ${daily_budget} exceeded",
            status_code=429,
        )
