from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.errors import DomainError, domain_error_handler, validation_error_handler, generic_error_handler
from pydantic import ValidationError

app = FastAPI(title="Altur API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(DomainError, domain_error_handler)
app.add_exception_handler(ValidationError, validation_error_handler)
app.add_exception_handler(Exception, generic_error_handler)


@app.on_event("startup")
async def startup() -> None:
    Path(settings.AUDIO_STORAGE_DIR).mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

# Business routers mount under /api — Phase 5 adds them:
# from app.api.calls import router as calls_router
# app.include_router(calls_router, prefix="/api")
