"""Alembic environment configuration for Riforma.

Supports both **online** (async, via asyncmy) and **offline** (SQL generation
without a live DB connection) migration modes.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db.base import Base

# Import ALL models so they register with Base.metadata
from app.models.tables import ALL_MODELS  # noqa: F401 — registers models with metadata

# ---------------------------------------------------------------------------
# Alembic Config object — provides access to values in alembic.ini
# ---------------------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging — line-by-line.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The target metadata that Alembic inspects to detect schema changes.
target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Override sqlalchemy.url with the value from application settings
# ---------------------------------------------------------------------------
settings = get_settings()
db_url = settings.DB_SETTINGS.sqlalchemy_url()

# For the *sync* fallback used by offline mode we need a sync-compatible URL.
# asyncmy only works when there is a real async connection; for offline SQL
# generation we swap to a plain ``mariadb+pymysql`` (or just ``mariadb``)
# driver so that Alembic can emit DDL without a running loop / DB.
_sync_url = db_url.replace("+asyncmy", "+pymysql")

# Set the async URL on the config so that ``engine_from_config`` picks it up
# in online mode.
config.set_main_option("sqlalchemy.url", db_url)


# ---------------------------------------------------------------------------
# Offline migrations — generates SQL script without connecting to the DB
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though an
    Engine is acceptable here as well.  By skipping the Engine creation we
    don't even need a DBAPI to be available.

    Calls to ``context.execute()`` here emit the given string to the script
    output.
    """
    context.configure(
        url=_sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online (async) migrations — connects to the DB using asyncmy
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    """Run migrations inside a synchronous connection callback."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations within an async context."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we create an async engine and associate a connection
    with the context.
    """
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry-point — Alembic calls whichever mode is active
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
