from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.calls import router as calls_router
from app.api.clients import router as clients_router
from app.api.dashboard import router as dashboard_router
from app.api.middleware import APIKeyMiddleware, RateLimitMiddleware
from app.api.notes import router as notes_router
from app.api.tags import router as tags_router
from app.api.taxonomy import router as taxonomy_router
from app.core.config import settings
from app.core.errors import DomainError, domain_error_handler, request_validation_error_handler, generic_error_handler


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    Path(settings.AUDIO_STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Altur API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.AUTH_ENABLED:
    app.add_middleware(APIKeyMiddleware)

app.add_middleware(RateLimitMiddleware)

app.add_exception_handler(DomainError, domain_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
app.add_exception_handler(Exception, generic_error_handler)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(calls_router, prefix="/api")
app.include_router(clients_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(taxonomy_router, prefix="/api")
