import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.api import deps
from app.core.config import get_settings
from app.db.repositories.instance import dokumenti
from app.models.domain import TipDokumenta
from app.models.tables import DokumentiRow
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

# File upload constraints
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
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

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/rtf",
    "application/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/octet-stream",  # Fallback for unknown MIME, rely on extension check
}


def _sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and sanitize filename."""
    # Strip directory components
    filename = Path(filename).name
    # Remove any non-alphanumeric chars except dots, hyphens, underscores
    filename = re.sub(r"[^\w.\-]", "_", filename)
    return filename


def _normalize_file_path(item: dict) -> None:
    """Normalize file_path to putanja_datoteke for consistent API responses."""
    if "putanja_datoteke" not in item and item.get("file_path"):
        fp = item["file_path"]
        if "uploads/" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads/") :]
        elif "uploads\\" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads\\") :].replace("\\", "/")


class DocumentCreate(BaseModel):
    naziv: str
    tip: TipDokumenta = TipDokumenta.OSTALO
    opis: Optional[str] = None
    nekretnina_id: Optional[str] = None
    zakupnik_id: Optional[str] = None
    ugovor_id: Optional[str] = None
    maintenance_task_id: Optional[str] = None


@router.get("", dependencies=[Depends(deps.require_scopes("documents:read"))])
async def get_documents(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items, _ = await dokumenti.find_many(
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )

    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("documents:create")),
        Depends(deps.require_tenant()),
    ],
)
async def create_document(
    naziv: str = Form(...),
    tip: str = Form("ostalo"),
    opis: Optional[str] = Form(None),
    nekretnina_id: Optional[str] = Form(None),
    zakupnik_id: Optional[str] = Form(None),
    ugovor_id: Optional[str] = Form(None),
    maintenance_task_id: Optional[str] = Form(None),
    datum_isteka: Optional[str] = Form(None),
    metadata: Optional[str] = Form(None),
    file: UploadFile = File(None),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Validate tip
    try:
        tip_enum = TipDokumenta(tip)
    except ValueError:
        tip_enum = TipDokumenta.OSTALO

    # Parse metadata
    parsed_metadata = {}
    if metadata:
        import json

        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Metadata must be valid JSON")

    doc_id = str(uuid.uuid4())
    file_path = None

    if file and file.filename:
        # Validate file extension
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Nedozvoljeni tip datoteke: {ext}."
                    f" Dozvoljeni: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
                ),
            )

        # Validate content type
        if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Nedozvoljeni content-type: {file.content_type}",
            )

        # Validate file size (read up to limit + 1 byte to detect oversized files)
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=422,
                detail=f"Datoteka je prevelika. Maksimalna veličina: {MAX_FILE_SIZE_MB}MB",
            )

        safe_filename = _sanitize_filename(file.filename)
        filename = f"{doc_id}_{safe_filename}"
        settings.UPLOAD_DIR.mkdir(exist_ok=True)
        dest_path = settings.UPLOAD_DIR / filename

        with dest_path.open("wb") as buffer:
            buffer.write(contents)

        file_path = str(dest_path)

    doc_data = {
        "id": doc_id,
        "naziv": naziv,
        "tip": tip_enum.value,
        "opis": opis,
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "ugovor_id": ugovor_id,
        "maintenance_task_id": maintenance_task_id,
        "datum_isteka": datum_isteka,
        "metadata_json": parsed_metadata,
        "file_path": file_path,
        "original_filename": file.filename if file else None,
        "content_type": file.content_type if file else None,
        "created_by": current_user["id"],
        "putanja_datoteke": f"uploads/{filename}" if file_path else None,
    }

    instance = await dokumenti.create(doc_data)
    return dokumenti.to_dict(instance)


@router.get(
    "/nekretnina/{id}", dependencies=[Depends(deps.require_scopes("documents:read"))]
)
async def get_documents_by_property(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items = await dokumenti.find_all(
        filters={"nekretnina_id": id},
        order_by="created_at",
        order_dir="desc",
    )
    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


@router.get(
    "/zakupnik/{id}", dependencies=[Depends(deps.require_scopes("documents:read"))]
)
async def get_documents_by_tenant(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items = await dokumenti.find_all(
        filters={"zakupnik_id": id},
        order_by="created_at",
        order_dir="desc",
    )
    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


@router.get(
    "/ugovor/{id}", dependencies=[Depends(deps.require_scopes("documents:read"))]
)
async def get_documents_by_contract(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items = await dokumenti.find_all(
        filters={"ugovor_id": id},
        order_by="created_at",
        order_dir="desc",
    )
    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


@router.get(
    "/property-unit/{id}", dependencies=[Depends(deps.require_scopes("documents:read"))]
)
async def get_documents_by_unit(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items = await dokumenti.find_all(
        filters={"property_unit_id": id},
        order_by="created_at",
        order_dir="desc",
    )
    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


@router.get("/expiring", dependencies=[Depends(deps.require_scopes("documents:read"))])
async def get_expiring_documents(
    days: int = 30,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    from datetime import timedelta

    cutoff = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")

    items = await dokumenti.find_all(
        extra_conditions=[
            DokumentiRow.datum_isteka.isnot(None),
            DokumentiRow.datum_isteka >= today,
            DokumentiRow.datum_isteka <= cutoff,
        ],
        order_by="datum_isteka",
        order_dir="asc",
    )
    return [dokumenti.to_dict(item) for item in items]


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("documents:read"))])
async def get_document(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await dokumenti.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Dokument nije pronađen")
    result_dict = dokumenti.to_dict(item)
    _normalize_file_path(result_dict)
    return result_dict


@router.get(
    "/{id}/download", dependencies=[Depends(deps.require_scopes("documents:read"))]
)
async def download_document(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await dokumenti.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Dokument nije pronađen")

    file_path = item.file_path
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="Datoteka nije pronađena")

    # Ensure the resolved path is within the uploads directory
    resolved = Path(file_path).resolve()
    if not str(resolved).startswith(str(settings.UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Pristup datoteci nije dozvoljen")

    return FileResponse(
        path=file_path,
        filename=item.original_filename or "document",
        media_type=item.content_type or "application/octet-stream",
    )


class DocumentUpdate(BaseModel):
    naziv: Optional[str] = None
    tip: Optional[TipDokumenta] = None
    opis: Optional[str] = None
    datum_isteka: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("documents:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_document(
    id: str,
    update_data: DocumentUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await dokumenti.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Dokument nije pronađen")

    update_dict = update_data.model_dump(exclude_unset=True)

    # Map "metadata" field from Pydantic model to "metadata_json" column
    if "metadata" in update_dict:
        update_dict["metadata_json"] = update_dict.pop("metadata")

    if update_dict:
        updated = await dokumenti.update_by_id(id, update_dict)
        return dokumenti.to_dict(updated)

    return dokumenti.to_dict(item)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("documents:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_document(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await dokumenti.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Dokument nije pronađen")

    # Delete file (with path traversal protection)
    file_path = item.file_path
    if file_path:
        path = Path(file_path).resolve()
        if str(path).startswith(str(settings.UPLOAD_DIR.resolve())) and path.exists():
            try:
                path.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")
        elif path.exists():
            logger.warning(f"Blocked file deletion outside uploads dir: {file_path}")

    await dokumenti.delete_by_id(id)
    return {"message": "Dokument uspješno obrisan"}
