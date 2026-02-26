from typing import AsyncGenerator, Optional

from app.core.config import get_settings
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

settings = get_settings()

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def get_engine() -> AsyncEngine:
    """Return a singleton async engine instance."""
    global _engine
    if _engine is None:
        db_settings = settings.DB_SETTINGS
        kwargs = {"echo": db_settings.echo}
        kwargs["pool_size"] = db_settings.pool_size
        kwargs["max_overflow"] = db_settings.max_overflow
        kwargs["pool_recycle"] = 3600  # Recommend pool recycle for MariaDB

        _engine = create_async_engine(db_settings.sqlalchemy_url(), **kwargs)
    return _engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return an async session factory bound to the engine."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async session."""
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        yield session


async def dispose_engine() -> None:
    """Dispose of the engine (used during app shutdown/tests)."""
    global _engine, _session_factory
    if _session_factory is not None:
        _session_factory = None
    if _engine is not None:
        await _engine.dispose()
        _engine = None
