import logging
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.api import deps
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.repositories.instance import dokumenti
from app.models.domain import TipDokumenta
from app.models.tables import DokumentiRow
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
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


def _ensure_disk_space(upload_dir: Path, min_free_mb: int) -> None:
    """Raise 507 if free disk space below threshold. Skips if statvfs unavailable."""
    try:
        upload_dir.mkdir(parents=True, exist_ok=True)
        free_bytes = shutil.disk_usage(str(upload_dir)).free
    except (OSError, AttributeError) as exc:
        logger.warning("Disk space check skipped for %s: %s", upload_dir, exc)
        return
    if free_bytes < min_free_mb * 1024 * 1024:
        logger.error(
            "Upload rejected — insufficient disk space (%d MB free, %d MB required)",
            free_bytes // (1024 * 1024),
            min_free_mb,
        )
        raise HTTPException(
            status_code=507,
            detail="Nedovoljno prostora na poslužitelju. Obratite se administratoru.",
        )


def _normalize_file_path(item: dict) -> None:
    """Derive putanja_datoteke from file_path for consistent API responses."""
    fp = item.get("file_path")
    if fp:
        if "uploads/" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads/"):]
        elif "uploads\\" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads\\"):].replace("\\", "/")
    elif not item.get("putanja_datoteke"):
        item["putanja_datoteke"] = None


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
@limiter.limit("30/minute")
async def create_document(
    request: Request,
    naziv: str = Form(...),
    tip: str = Form("ostalo"),
    opis: Optional[str] = Form(None),
    nekretnina_id: Optional[str] = Form(None),
    zakupnik_id: Optional[str] = Form(None),
    ugovor_id: Optional[str] = Form(None),
    property_unit_id: Optional[str] = Form(None),
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
    parsed_metadata = None
    if metadata:
        import json

        try:
            parsed_metadata = json.loads(metadata) or None
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Metadata must be valid JSON")

    doc_id = str(uuid.uuid4())
    file_path = None
    filename = None

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

        _ensure_disk_space(settings.UPLOAD_DIR, settings.UPLOAD_MIN_FREE_MB)

        safe_filename = _sanitize_filename(file.filename)
        filename = f"{doc_id}_{safe_filename}"
        try:
            settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            logger.error("Cannot create upload directory %s: %s", settings.UPLOAD_DIR, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Nije moguće kreirati direktorij za upload: {exc}",
            )
        dest_path = settings.UPLOAD_DIR / filename

        try:
            with dest_path.open("wb") as buffer:
                buffer.write(contents)
        except OSError as exc:
            logger.error("Cannot write file %s: %s", dest_path, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Nije moguće spremiti datoteku na disk: {exc}",
            )

        file_path = str(dest_path)

        # Image uploads: auto-generate thumbnail + medium variants so
        # gallery rendering doesn't pull megabytes per thumb. URL-relative
        # paths stored in metadata_json (e.g. "uploads/{id}_thumb.jpg") so
        # the frontend can render via the same /uploads/{file} auth route.
        if file.content_type and file.content_type.startswith("image/"):
            try:
                from PIL import Image

                variants = parsed_metadata.get("variants") if parsed_metadata else None
                if not isinstance(variants, dict):
                    variants = {}

                with Image.open(dest_path) as img:
                    # Convert RGBA → RGB so JPEG variants don't crash on PNG
                    # uploads with transparency.
                    rgb = img.convert("RGB") if img.mode in ("RGBA", "P") else img
                    for label, size in (("thumb", (200, 200)), ("medium", (800, 600))):
                        variant_img = rgb.copy()
                        variant_img.thumbnail(size, Image.Resampling.LANCZOS)
                        variant_name = f"{doc_id}_{label}.jpg"
                        variant_path = settings.UPLOAD_DIR / variant_name
                        variant_img.save(
                            variant_path, "JPEG", quality=85, optimize=True
                        )
                        variants[label] = f"uploads/{variant_name}"

                if parsed_metadata is None:
                    parsed_metadata = {}
                parsed_metadata["variants"] = variants
            except Exception as exc:
                # Variants are nice-to-have, not critical. Log and move on
                # so a missing libjpeg or bad EXIF doesn't fail the upload.
                logger.warning(
                    "Thumbnail generation skipped for %s: %s", dest_path, exc
                )

    # Sanitize empty strings to None for FK fields
    clean_nekretnina_id = nekretnina_id if nekretnina_id else None
    clean_zakupnik_id = zakupnik_id if zakupnik_id else None
    clean_ugovor_id = ugovor_id if ugovor_id else None
    clean_property_unit_id = property_unit_id if property_unit_id else None
    clean_maintenance_task_id = maintenance_task_id if maintenance_task_id else None

    doc_data = {
        "id": doc_id,
        "naziv": naziv,
        "tip": tip_enum.value,
        "opis": opis,
        "nekretnina_id": clean_nekretnina_id,
        "zakupnik_id": clean_zakupnik_id,
        "ugovor_id": clean_ugovor_id,
        "property_unit_id": clean_property_unit_id,
        "maintenance_task_id": clean_maintenance_task_id,
        "datum_isteka": datum_isteka,
        "metadata_json": parsed_metadata,
        "file_path": file_path,
        "original_filename": file.filename if file else None,
        "content_type": file.content_type if file else None,
        "created_by": current_user["id"],
    }

    try:
        instance = await dokumenti.create(doc_data)
    except Exception as exc:
        logger.error("DB insert failed for document %s: %s", doc_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Spremanje dokumenta u bazu nije uspjelo: {exc}",
        )
    result_dict = dokumenti.to_dict(instance)
    _normalize_file_path(result_dict)
    return result_dict


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
    result = []
    for item in items:
        d = dokumenti.to_dict(item)
        _normalize_file_path(d)
        result.append(d)
    return result


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
        d = dokumenti.to_dict(updated)
        _normalize_file_path(d)
        return d

    d = dokumenti.to_dict(item)
    _normalize_file_path(d)
    return d


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

    # Collect every path to remove: original + any thumbnail/medium variants
    # stored in metadata_json. All variants live in UPLOAD_DIR so the same
    # traversal check applies.
    paths_to_remove = []
    if item.file_path:
        paths_to_remove.append(item.file_path)
    meta = item.metadata_json or {}
    variants = meta.get("variants") if isinstance(meta, dict) else None
    if isinstance(variants, dict):
        for rel in variants.values():
            if rel and rel.startswith("uploads/"):
                paths_to_remove.append(
                    str(settings.UPLOAD_DIR / rel[len("uploads/"):])
                )

    for raw in paths_to_remove:
        path = Path(raw).resolve()
        if str(path).startswith(str(settings.UPLOAD_DIR.resolve())) and path.exists():
            try:
                path.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete file {raw}: {e}")
        elif path.exists():
            logger.warning(f"Blocked file deletion outside uploads dir: {raw}")

    await dokumenti.delete_by_id(id)
    return {"message": "Dokument uspješno obrisan"}
