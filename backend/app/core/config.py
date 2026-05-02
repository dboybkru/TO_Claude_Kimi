from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"

    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    DATABASE_URL: str = "postgresql+asyncpg://alarm:alarm_secret@localhost:5432/alarm_db"

    REDIS_URL: str = "redis://localhost:6379/0"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin"
    MINIO_BUCKET_ATTACHMENTS: str = "attachments"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    FIRST_SUPERUSER_EMAIL: str = "admin@example.com"
    FIRST_SUPERUSER_PASSWORD: str = "changeme"

    # Email / SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "SecureTO <noreply@example.com>"
    SMTP_TLS: bool = True
    EMAIL_ENABLED: bool = False

    # Monitoring
    SENTRY_DSN: str = ""  # https://sentry.io — set in production

    # Voice bot telephony
    VOICEBOT_PHONE_NUMBER: str = ""        # Номер телефона бота (для отображения в UI)
    VOICEBOT_WEBHOOK_SECRET: str = ""      # Секрет для проверки подлинности запросов от АТС

    # VseGPT AI API (OpenAI-compatible, https://vsegpt.ru)
    VSEGPT_API_KEY: str = ""
    VSEGPT_BASE_URL: str = "https://api.vsegpt.ru/v1"

    # Model selection by task
    AI_MODEL_PARSE_CALL: str = "openai/gpt-4o-mini"         # structured call parsing
    AI_MODEL_CLASSIFY: str = "openai/gpt-4o-mini"           # fault classification
    AI_MODEL_SUMMARIZE: str = "anthropic/claude-haiku-4.5"  # journal summary (RU quality)
    AI_MODEL_REPORT: str = "anthropic/claude-sonnet-4.5"    # full reports & analysis
    AI_MODEL_HINT: str = "openai/gpt-4o-mini"              # quick hints in forms

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_strong(cls, v: str, info) -> str:
        env = info.data.get("APP_ENV", "development")
        if env != "development" and v in ("change-me", "secret", "changeme", ""):
            raise ValueError("SECRET_KEY must be set to a strong random value in non-development environments")
        return v


settings = Settings()
