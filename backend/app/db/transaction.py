import logging
from contextlib import asynccontextmanager

from app.db.session import get_async_session_factory

logger = logging.getLogger(__name__)


@asynccontextmanager
async def db_transaction():
    """
    Async context manager for database transactions.
    Usage:
        async with db_transaction() as session:
            await session.execute(...)
            # auto-commits on success, rolls back on exception
    """
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        async with session.begin():
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
