from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str
    OPENAI_API_KEY: str
    AUDIO_STORAGE_DIR: str = "/tmp/audio"

    LLM_MODEL_TAGGING: str = "gpt-4o-mini"
    LLM_MODEL_MOOD: str = "gpt-4o-mini"
    LLM_MODEL_INSIGHTS: str = "gpt-4o-mini"
    LLM_MODEL_SYNTHESIS: str = "gpt-4.1-mini"
    STT_MODEL: str = "gpt-4o-transcribe-diarize"

    AZURE_STORAGE_ACCOUNT: str = ""
    AZURE_STORAGE_KEY: str = ""
    AZURE_STORAGE_CONTAINER: str = "audio"

    AUTH_ENABLED: bool = False
    API_KEY: str = ""
    DAILY_BUDGET_USD: float = 10.0
    RATE_LIMIT_UPLOADS_PER_HOUR: int = 10
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings reads from env, not __init__


settings = get_settings()
