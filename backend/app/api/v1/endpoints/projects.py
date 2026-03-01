import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from app.api import deps
from app.core.config import get_settings
from app.db.repositories.instance import (
    projekti,
    project_documents,
    project_phases,
    project_stakeholders,
    project_transactions,
)
from app.db.transaction import db_transaction
from app.models.domain import (
    Project,
    ProjectDocument,
    ProjectPhase,
    ProjectStakeholder,
    ProjectStatus,
    ProjectTransaction,
    TransactionCategory,
    TransactionType,
)
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: build full project response with nested related data
# ---------------------------------------------------------------------------
async def _build_project_response(project_instance) -> dict:
    """Build full project dict with nested phases, documents, transactions, stakeholders."""
    result = projekti.to_dict(project_instance)

    phases = await project_phases.find_all(
        filters={"project_id": project_instance.id}, order_by="order", order_dir="asc"
    )
    docs = await project_documents.find_all(
        filters={"project_id": project_instance.id}
    )
    txs = await project_transactions.find_all(
        filters={"project_id": project_instance.id},
        order_by="date",
        order_dir="desc",
    )
    shs = await project_stakeholders.find_all(
        filters={"project_id": project_instance.id}
    )

    result["phases"] = [project_phases.to_dict(p) for p in phases]
    result["documents"] = [project_documents.to_dict(d) for d in docs]
    result["transactions"] = [project_transactions.to_dict(t) for t in txs]
    result["stakeholders"] = [project_stakeholders.to_dict(s) for s in shs]

    return result


# ---------------------------------------------------------------------------
# Pydantic request schemas
# ---------------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.PLANNING
    budget: Optional[float] = None
    start_date: Optional[str] = None  # ISO date string
    end_date: Optional[str] = None  # ISO date string
    budget_breakdown: Optional[Dict[str, float]] = None
    projected_revenue: Optional[float] = None
    linked_property_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    budget: Optional[float] = None
    spent: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget_breakdown: Optional[Dict[str, float]] = None
    projected_revenue: Optional[float] = None
    linked_property_id: Optional[str] = None


class PhaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "pending"
    order: int = 0


class DocumentCreate(BaseModel):
    name: str
    type: str
    phase_id: Optional[str] = None
    notes: Optional[str] = None


class TransactionCreate(BaseModel):
    date: str
    type: TransactionType = TransactionType.EXPENSE
    category: TransactionCategory = TransactionCategory.OTHER
    amount: float
    description: Optional[str] = None
    paid_to: Optional[str] = None


class StakeholderCreate(BaseModel):
    name: str
    role: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "",
    dependencies=[Depends(deps.require_scopes("projects:read"))],
    response_model=List[Project],
)
async def get_projects(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items, _total = await projekti.find_many(
        order_by="created_at", order_dir="desc", skip=skip, limit=limit
    )
    return [projekti.to_dict(item) for item in items]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("projects:create")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def create_project(
    item_in: ProjectCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Create domain model to populate defaults (id, created_at, status, etc.)
    project = Project(**item_in.model_dump())

    item_data = project.model_dump()
    item_data["created_by"] = current_user["id"]

    # Remove embedded array fields -- these live in separate tables now
    item_data.pop("phases", None)
    item_data.pop("documents", None)
    item_data.pop("transactions", None)
    item_data.pop("stakeholders", None)

    new_project = await projekti.create(item_data)
    return await _build_project_response(new_project)


@router.get(
    "/{id}",
    dependencies=[Depends(deps.require_scopes("projects:read"))],
    response_model=Project,
)
async def get_project(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await projekti.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")
    return await _build_project_response(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("projects:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def update_project(
    id: str,
    item_in: ProjectUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await projekti.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return await _build_project_response(existing)

    updated = await projekti.update_by_id(id, update_data)
    return await _build_project_response(updated)


@router.post(
    "/{id}/phases",
    dependencies=[
        Depends(deps.require_scopes("projects:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def add_project_phase(
    id: str,
    phase_in: PhaseCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await projekti.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    # Auto-assign order if 0
    if phase_in.order == 0:
        existing_phases = await project_phases.find_all(
            filters={"project_id": id}
        )
        phase_in.order = len(existing_phases) + 1

    phase = ProjectPhase(**phase_in.model_dump())
    phase_data = phase.model_dump()
    phase_data["project_id"] = id

    await project_phases.create(phase_data)

    return await _build_project_response(existing)


@router.post(
    "/{id}/documents",
    dependencies=[
        Depends(deps.require_scopes("projects:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def add_project_document(
    id: str,
    name: str = Form(...),
    type: str = Form(...),
    phase_id: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    status: str = Form("pending"),
    file: Optional[UploadFile] = File(None),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await projekti.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    file_url = None
    if file and file.filename:
        settings = get_settings()

        # Validate file extension
        import re as _re
        from pathlib import Path as _Path

        ALLOWED_EXTENSIONS = {
            ".pdf",
            ".doc",
            ".docx",
            ".xls",
            ".xlsx",
            ".csv",
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".webp",
            ".txt",
            ".rtf",
            ".odt",
            ".ods",
        }
        ext = _Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Nedozvoljena vrsta datoteke: {ext}",
            )

        # Validate file size (50MB limit)
        contents = await file.read()
        if len(contents) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=422,
                detail="Datoteka je prevelika. Maksimalna veličina: 50MB",
            )

        upload_path = settings.UPLOAD_DIR / "projects" / id
        upload_path.mkdir(parents=True, exist_ok=True)

        # Sanitize filename - remove path components and special chars
        safe_name = _Path(file.filename).name
        safe_name = _re.sub(r"[^\w.\-]", "_", safe_name)
        file_dest = upload_path / safe_name

        with file_dest.open("wb") as buffer:
            buffer.write(contents)

        file_url = f"uploads/projects/{id}/{safe_name}"

    doc = ProjectDocument(
        name=name,
        type=type,
        phase_id=phase_id,
        notes=notes,
        status=status,
        file_url=file_url,
    )
    doc_data = doc.model_dump()
    doc_data["project_id"] = id

    await project_documents.create(doc_data)

    return await _build_project_response(existing)


@router.post(
    "/{id}/transactions",
    dependencies=[
        Depends(deps.require_scopes("projects:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def add_project_transaction(
    id: str,
    transaction_in: TransactionCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await projekti.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    # Create domain model for defaults / validation
    transaction = ProjectTransaction(**transaction_in.model_dump())

    # Calculate new spent
    current_spent = float(existing.spent or 0.0)
    if transaction.type == TransactionType.EXPENSE:
        current_spent += transaction.amount

    tx_data = transaction.model_dump()
    tx_data["project_id"] = id

    async with db_transaction() as txn:
        await project_transactions.create(tx_data, session=txn)
        await projekti.update_by_id(
            id, {"spent": current_spent, "updated_at": datetime.now(timezone.utc)}, session=txn
        )

    updated = await projekti.get_by_id(id)
    return await _build_project_response(updated)


# ==========================================
# Stakeholder Helper Endpoints
# ==========================================
@router.post(
    "/{id}/stakeholders",
    dependencies=[
        Depends(deps.require_scopes("projects:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=Project,
)
async def add_project_stakeholder(
    id: str,
    stakeholder_in: StakeholderCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await projekti.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    stakeholder = ProjectStakeholder(**stakeholder_in.model_dump())
    sh_data = stakeholder.model_dump()
    sh_data["project_id"] = id

    await project_stakeholders.create(sh_data)
    await projekti.update_by_id(id, {"updated_at": datetime.now(timezone.utc)})

    updated = await projekti.get_by_id(id)
    return await _build_project_response(updated)
