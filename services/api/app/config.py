from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./.data/app.db"
    jwt_secret: str = Field(min_length=32)
    access_minutes: int = 15
    refresh_days: int = 7
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:3000"
    storage_backend: str = "local"
    data_dir: str = ".data"
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "oral-assessment"
    redis_url: str = ""
    ai_provider: str = "demo"
    gemini_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"
    embedding_model: str = "gemini-embedding-001"
    top_k: int = Field(default=5, ge=1, le=20)
    confidence_threshold: float = Field(default=0.85, ge=0, le=1)
    stt_model: str = "base"
    stt_language: str = "vi"
    google_stt_credentials_file: str = ""
    max_document_mb: int = 20
    max_textbook_mb: int = 100
    media_chunk_bytes: int = 4 * 1024 * 1024
    max_media_mb: int = 200
    bootstrap_admin: str = "admin"
    bootstrap_password: str = ""

    @model_validator(mode="after")
    def validate_provider(self):
        if self.ai_provider not in {"demo", "gemini"}:
            raise ValueError("AI_PROVIDER must be demo or gemini")
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required")
        if self.storage_backend not in {"local", "s3"}:
            raise ValueError("STORAGE_BACKEND must be local or s3")
        return self


@lru_cache
def settings() -> Settings:
    return Settings()
