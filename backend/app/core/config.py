import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / ".env", override=True)


@dataclass(frozen=True)
class DatabaseSettings:
    """Settings required to build the SQLAlchemy engine."""

    url: Optional[str] = None
    engine: str = "mariadb+asyncmy"
    host: str = "localhost"
    port: int = 3306
    user: str = ""
    password: str = ""
    name: str = "riforma"
    echo: bool = False
    pool_size: int = 5
    max_overflow: int = 10

    def sqlalchemy_url(self) -> str:
        if self.url:
            return self.url
        return (
            f"{self.engine}://{self.user}:{self.password}@"
            f"{self.host}:{self.port}/{self.name}"
        )


class Settings:
    PROJECT_NAME: str = "Riforma API"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        x.strip()
        for x in os.environ.get(
            "BACKEND_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if x.strip()
    ]
    if ENVIRONMENT == "production" and all(
        "localhost" in o or "127.0.0.1" in o for o in BACKEND_CORS_ORIGINS
    ):
        import warnings

        warnings.warn(
            "BACKEND_CORS_ORIGINS contains only localhost origins in production! "
            "Set BACKEND_CORS_ORIGINS to your production domain.",
            stacklevel=2,
        )

    # Auth
    AUTH_SECRET: str = os.environ.get("AUTH_SECRET", "")
    if not AUTH_SECRET:
        if os.environ.get("ENVIRONMENT", "development") == "production":
            raise RuntimeError(
                "AUTH_SECRET must be set in production! "
                "Set the AUTH_SECRET environment variable."
            )
        import warnings

        warnings.warn(
            "AUTH_SECRET is not set! Using insecure default. "
            "Set AUTH_SECRET environment variable in production.",
            stacklevel=2,
        )
        AUTH_SECRET = "dev-only-insecure-secret-do-not-use-in-prod"
    AUTH_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DB_SETTINGS: DatabaseSettings = DatabaseSettings(
        url=os.getenv("DATABASE_URL"),
        engine=os.getenv("DB_ENGINE", "mariadb+asyncmy"),
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", ""),
        password=os.getenv("DB_PASSWORD", ""),
        name=os.getenv("DB_NAME", "riforma"),
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    )

    USE_IN_MEMORY_DB: bool = (
        os.environ.get("USE_IN_MEMORY_DB", "false").lower() == "true"
    )
    AUTO_RUN_MIGRATIONS: bool = (
        os.environ.get("AUTO_RUN_MIGRATIONS", "true").lower() == "true"
    )
    SEED_ADMIN_ON_STARTUP: bool = (
        os.environ.get("SEED_ADMIN_ON_STARTUP", "false").lower() == "true"
    )

    # Initial Admin
    INITIAL_ADMIN_EMAIL: Optional[str] = os.environ.get("INITIAL_ADMIN_EMAIL")
    INITIAL_ADMIN_PASSWORD: Optional[str] = os.environ.get("INITIAL_ADMIN_PASSWORD")
    INITIAL_ADMIN_FULL_NAME: str = os.environ.get(
        "INITIAL_ADMIN_FULL_NAME", "Portfolio Admin"
    )
    INITIAL_ADMIN_ROLE: str = os.environ.get("INITIAL_ADMIN_ROLE", "owner")

    # Paths
    UPLOAD_DIR: Path = ROOT_DIR / "uploads"
    DOCUMENT_REQUIREMENTS_PATH: Optional[str] = os.environ.get(
        "DOCUMENT_REQUIREMENTS_PATH"
    )

    # Defaults
    DEFAULT_TENANT_ID: str = os.environ.get("DEFAULT_TENANT_ID", "tenant-default")
    DEFAULT_TENANT_NAME: str = os.environ.get("DEFAULT_TENANT_NAME", "Glavna portfelj")
    OPENAI_API_KEY: Optional[str] = os.environ.get("OPENAI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = os.environ.get("ANTHROPIC_API_KEY")
    CLAUDE_MODEL: str = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")
    SENTRY_DSN_BACKEND: Optional[str] = os.environ.get("SENTRY_DSN_BACKEND")

    # Logging
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.environ.get("LOG_FORMAT", "text")

    # SMTP / Email notifications
    SMTP_HOST: Optional[str] = os.environ.get("SMTP_HOST")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER: Optional[str] = os.environ.get("SMTP_USER")
    SMTP_PASSWORD: Optional[str] = os.environ.get("SMTP_PASSWORD")
    SMTP_FROM: Optional[str] = os.environ.get("SMTP_FROM")


@lru_cache
def get_settings() -> Settings:
    return Settings()
