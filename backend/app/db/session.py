import logging
from typing import AsyncGenerator, Dict, Optional

from app.core.config import get_settings
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = logging.getLogger(__name__)

settings = get_settings()

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _register_pool_monitoring(engine: AsyncEngine, pool_size: int, max_overflow: int) -> None:
    """Emit warnings when the connection pool approaches exhaustion."""
    capacity = pool_size + max_overflow
    warn_threshold = max(1, int(capacity * 0.8))

    @event.listens_for(engine.sync_engine, "checkout")
    def _on_checkout(dbapi_conn, conn_record, conn_proxy):
        pool = engine.sync_engine.pool
        try:
            checked_out = pool.checkedout()
        except Exception:
            return
        if checked_out >= capacity:
            logger.error(
                "DB pool exhausted: %d/%d connections in use (pool_size=%d, overflow=%d)",
                checked_out,
                capacity,
                pool_size,
                max_overflow,
            )
        elif checked_out >= warn_threshold:
            logger.warning(
                "DB pool high: %d/%d connections in use",
                checked_out,
                capacity,
            )


def get_pool_stats() -> Dict[str, Optional[int]]:
    """Return current pool metrics for health/ready endpoints."""
    if _engine is None:
        return {"size": None, "checked_out": None, "overflow": None}
    pool = _engine.sync_engine.pool
    try:
        return {
            "size": pool.size(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except Exception:
        return {"size": None, "checked_out": None, "overflow": None}


def get_engine() -> AsyncEngine:
    """Return a singleton async engine instance."""
    global _engine
    if _engine is None:
        db_settings = settings.DB_SETTINGS
        url = db_settings.sqlalchemy_url()
        kwargs: dict = {"echo": db_settings.echo}
        is_sqlite = url.startswith("sqlite")

        if is_sqlite:
            kwargs["connect_args"] = {"check_same_thread": False}
        else:
            kwargs["pool_size"] = db_settings.pool_size
            kwargs["max_overflow"] = db_settings.max_overflow
            kwargs["pool_recycle"] = 3600

        _engine = create_async_engine(url, **kwargs)

        if not is_sqlite:
            _register_pool_monitoring(
                _engine, db_settings.pool_size, db_settings.max_overflow
            )
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
