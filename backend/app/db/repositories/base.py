"""Base repository providing common CRUD operations for SQLAlchemy models."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, Generic, List, Optional, Tuple, Type, TypeVar

from sqlalchemy import Select, and_, asc, desc, func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.base import Base
from app.db.tenant import CURRENT_TENANT_ID

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic async repository for SQLAlchemy ORM models.

    Provides typed, tenant-aware CRUD helpers that replace the legacy
    ``TenantAwareCollection`` / document-store pattern with proper
    SQLAlchemy ORM queries.

    Subclass and set ``model`` (required) and ``tenant_scoped`` (default
    ``False``) to create a concrete repository for a domain entity.
    """

    model: Type[T]
    tenant_scoped: bool = False  # Override in subclass for tenant-scoped tables

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    # ------------------------------------------------------------------
    # Data helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Enum values to their string representation for ORM columns."""
        for key, value in data.items():
            if isinstance(value, Enum):
                data[key] = value.value
            elif isinstance(value, list):
                data[key] = [
                    item.value if isinstance(item, Enum) else item
                    for item in value
                ]
        return data

    # ------------------------------------------------------------------
    # Tenant helpers
    # ------------------------------------------------------------------

    def _get_tenant_id(self) -> Optional[str]:
        """Read the current tenant id from the request-scoped ContextVar."""
        return CURRENT_TENANT_ID.get()

    def _apply_tenant_filter(self, stmt: Select) -> Select:
        """Apply tenant isolation filter if the model is tenant-scoped."""
        if not self.tenant_scoped:
            return stmt
        tenant_id = self._get_tenant_id()
        if not tenant_id:
            raise ValueError(
                f"Cannot query tenant-scoped table '{self.model.__tablename__}' "
                f"without an active tenant context"
            )
        return stmt.where(self.model.tenant_id == tenant_id)

    def _ensure_tenant_id(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure ``tenant_id`` is present on data for tenant-scoped models."""
        if not self.tenant_scoped:
            return data
        tenant_id = self._get_tenant_id()
        if not tenant_id:
            raise ValueError(
                f"Cannot insert into tenant-scoped table '{self.model.__tablename__}' "
                f"without an active tenant context"
            )
        data.setdefault("tenant_id", tenant_id)
        return data

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def _get_session(self, external_session: Optional[AsyncSession] = None):
        """Yield an external session if provided, otherwise create a new one."""
        if external_session is not None:
            yield external_session
        else:
            async with self._session_factory() as session:
                yield session

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get_by_id(
        self, id: str, *, session: Optional[AsyncSession] = None
    ) -> Optional[T]:
        """Get a single record by primary key, respecting tenant scope."""
        async with self._get_session(session) as s:
            stmt = select(self.model).where(self.model.id == id)
            stmt = self._apply_tenant_filter(stmt)
            result = await s.execute(stmt)
            return result.scalar_one_or_none()

    async def find_one(
        self,
        extra_conditions: Optional[list] = None,
        *,
        session: Optional[AsyncSession] = None,
        **filters: Any,
    ) -> Optional[T]:
        """Find a single record matching the given keyword filters.

        Parameters
        ----------
        extra_conditions:
            Arbitrary SQLAlchemy filter expressions (e.g. ``Model.status.in_(...)``).
        **filters:
            Simple ``column=value`` equality filters.
        """
        async with self._get_session(session) as s:
            stmt = select(self.model)
            for key, value in filters.items():
                stmt = stmt.where(getattr(self.model, key) == value)
            if extra_conditions:
                for cond in extra_conditions:
                    stmt = stmt.where(cond)
            stmt = self._apply_tenant_filter(stmt)
            result = await s.execute(stmt)
            return result.scalar_one_or_none()

    async def find_many(
        self,
        filters: Optional[Dict[str, Any]] = None,
        *,
        order_by: Optional[str] = None,
        order_dir: str = "desc",
        skip: int = 0,
        limit: int = 100,
        extra_conditions: Optional[list] = None,
    ) -> Tuple[List[T], int]:
        """Find multiple records with filtering, sorting, and pagination.

        Parameters
        ----------
        filters:
            Simple ``{column: value}`` equality filters.  ``None`` values
            in the dict are silently skipped.
        order_by:
            Column name to sort by.
        order_dir:
            ``"asc"`` or ``"desc"`` (default ``"desc"``).
        skip / limit:
            Pagination controls (offset / page-size).
        extra_conditions:
            Arbitrary SQLAlchemy filter expressions (e.g. ``or_()``,
            ``col.like()``, date-range clauses).

        Returns
        -------
        tuple[list[T], int]
            ``(items, total_count)`` where *total_count* is the number of
            records **before** pagination is applied.
        """
        async with self._session_factory() as session:
            # Base queries
            stmt = select(self.model)
            count_stmt = select(func.count()).select_from(self.model)

            # Build conditions
            conditions: list = []
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        conditions.append(getattr(self.model, key) == value)
            if extra_conditions:
                conditions.extend(extra_conditions)

            if conditions:
                combined = and_(*conditions)
                stmt = stmt.where(combined)
                count_stmt = count_stmt.where(combined)

            # Tenant scope
            stmt = self._apply_tenant_filter(stmt)
            count_stmt = self._apply_tenant_filter(count_stmt)

            # Total count (before pagination)
            total_result = await session.execute(count_stmt)
            total = total_result.scalar() or 0

            # Ordering
            if order_by and hasattr(self.model, order_by):
                col = getattr(self.model, order_by)
                stmt = stmt.order_by(desc(col) if order_dir == "desc" else asc(col))
            elif hasattr(self.model, "created_at"):
                stmt = stmt.order_by(desc(self.model.created_at))

            # Pagination
            stmt = stmt.offset(skip).limit(limit)

            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def count(
        self,
        filters: Optional[Dict[str, Any]] = None,
        extra_conditions: Optional[list] = None,
    ) -> int:
        """Count records matching filters."""
        async with self._session_factory() as session:
            stmt = select(func.count()).select_from(self.model)
            conditions: list = []
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        conditions.append(getattr(self.model, key) == value)
            if extra_conditions:
                conditions.extend(extra_conditions)
            if conditions:
                stmt = stmt.where(and_(*conditions))
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return result.scalar() or 0

    async def exists(self, **filters: Any) -> bool:
        """Return ``True`` if at least one record matches the filters."""
        return await self.find_one(**filters) is not None

    async def find_all(
        self,
        filters: Optional[Dict[str, Any]] = None,
        *,
        order_by: Optional[str] = None,
        order_dir: str = "desc",
        extra_conditions: Optional[list] = None,
    ) -> List[T]:
        """Return *all* matching records (no pagination).

        Useful for dashboard aggregations and bulk operations.
        """
        async with self._session_factory() as session:
            stmt = select(self.model)
            conditions: list = []
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        conditions.append(getattr(self.model, key) == value)
            if extra_conditions:
                conditions.extend(extra_conditions)
            if conditions:
                stmt = stmt.where(and_(*conditions))
            stmt = self._apply_tenant_filter(stmt)
            if order_by and hasattr(self.model, order_by):
                col = getattr(self.model, order_by)
                stmt = stmt.order_by(desc(col) if order_dir == "desc" else asc(col))
            elif hasattr(self.model, "created_at"):
                stmt = stmt.order_by(desc(self.model.created_at))
            result = await session.execute(stmt)
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def create(
        self, data: Dict[str, Any], *, session: Optional[AsyncSession] = None
    ) -> T:
        """Insert a new record. Returns the created ORM instance."""
        data = self._normalize_data(data)
        data = self._ensure_tenant_id(data)
        async with self._get_session(session) as s:
            instance = self.model(**data)
            s.add(instance)
            if session is not None:
                await s.flush()
            else:
                await s.commit()
                await s.refresh(instance)
            return instance

    async def update_by_id(
        self, id: str, data: Dict[str, Any], *, session: Optional[AsyncSession] = None
    ) -> Optional[T]:
        """Update a record by primary key. Returns the updated instance or ``None``."""
        data = self._normalize_data(data)
        async with self._get_session(session) as s:
            stmt = select(self.model).where(self.model.id == id)
            stmt = self._apply_tenant_filter(stmt)
            result = await s.execute(stmt)
            instance = result.scalar_one_or_none()
            if not instance:
                return None
            for key, value in data.items():
                if hasattr(instance, key):
                    setattr(instance, key, value)
            if session is not None:
                await s.flush()
            else:
                await s.commit()
                await s.refresh(instance)
            return instance

    async def update_many(
        self,
        filters: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        extra_conditions: Optional[list] = None,
    ) -> int:
        """Bulk-update records matching filters. Returns count of updated rows."""
        if not data:
            return 0
        data = self._normalize_data(data)
        async with self._session_factory() as session:
            conditions: list = []
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        conditions.append(getattr(self.model, key) == value)
            if extra_conditions:
                conditions.extend(extra_conditions)
            # Tenant scope
            if self.tenant_scoped:
                tenant_id = self._get_tenant_id()
                if not tenant_id:
                    raise ValueError("Cannot update tenant-scoped rows without tenant")
                conditions.append(self.model.tenant_id == tenant_id)
            stmt = sa_update(self.model)
            if conditions:
                stmt = stmt.where(and_(*conditions))
            stmt = stmt.values(**data)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount

    async def delete_by_id(
        self, id: str, *, session: Optional[AsyncSession] = None
    ) -> bool:
        """Delete a record by primary key. Returns ``True`` if a row was deleted."""
        async with self._get_session(session) as s:
            stmt = select(self.model).where(self.model.id == id)
            stmt = self._apply_tenant_filter(stmt)
            result = await s.execute(stmt)
            instance = result.scalar_one_or_none()
            if not instance:
                return False
            await s.delete(instance)
            if session is not None:
                await s.flush()
            else:
                await s.commit()
            return True

    async def delete_many(
        self,
        filters: Optional[Dict[str, Any]] = None,
        extra_conditions: Optional[list] = None,
        *,
        session: Optional[AsyncSession] = None,
    ) -> int:
        """Bulk-delete records matching filters. Returns count of deleted rows."""
        async with self._get_session(session) as s:
            conditions: list = []
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        conditions.append(getattr(self.model, key) == value)
            if extra_conditions:
                conditions.extend(extra_conditions)
            if self.tenant_scoped:
                tenant_id = self._get_tenant_id()
                if not tenant_id:
                    raise ValueError("Cannot delete tenant-scoped rows without tenant")
                conditions.append(self.model.tenant_id == tenant_id)
            # Select then delete to trigger cascade / ORM events
            stmt = select(self.model)
            if conditions:
                stmt = stmt.where(and_(*conditions))
            result = await s.execute(stmt)
            rows = list(result.scalars().all())
            for row in rows:
                await s.delete(row)
            if rows:
                if session is not None:
                    await s.flush()
                else:
                    await s.commit()
            return len(rows)

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def to_dict(self, instance: T) -> Dict[str, Any]:
        """Convert an ORM instance to a plain dictionary for API responses.

        Handles:
        - ``datetime`` -> ISO-8601 string
        - ``date`` -> ISO-8601 string
        - ``Enum`` -> ``.value``
        - JSON columns -> passed through as-is
        - ``None`` -> kept as ``None``
        """
        result: Dict[str, Any] = {}
        for column in instance.__table__.columns:
            value = getattr(instance, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif isinstance(value, date):
                value = value.isoformat()
            elif isinstance(value, Enum):
                value = value.value
            # None and JSON / other types pass through unchanged
            result[column.name] = value
        return result
