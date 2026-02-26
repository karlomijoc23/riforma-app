"""
Standardized error responses for Riforma API.

Usage:
    from app.core.errors import (
        not_found, bad_request, conflict, validation_error, forbidden
    )

    raise not_found("Ugovor", contract_id)
    raise bad_request("Datum završetka mora biti nakon datuma početka")
    raise conflict("Ugovor se preklapa s postojećim ugovorom")
    raise validation_error("Neispravan format datuma")
    raise forbidden("Nemate dozvolu za ovu akciju")
"""

from fastapi import HTTPException

# --- Error codes for frontend mapping ---
ERROR_CODES = {
    "NOT_FOUND": "NOT_FOUND",
    "BAD_REQUEST": "BAD_REQUEST",
    "CONFLICT": "CONFLICT",
    "VALIDATION_ERROR": "VALIDATION_ERROR",
    "FORBIDDEN": "FORBIDDEN",
    "UNAUTHORIZED": "UNAUTHORIZED",
    "RATE_LIMITED": "RATE_LIMITED",
    "SERVER_ERROR": "SERVER_ERROR",
    "FILE_TOO_LARGE": "FILE_TOO_LARGE",
    "INVALID_FILE_TYPE": "INVALID_FILE_TYPE",
    "OVERLAP": "OVERLAP",
    "INVALID_TRANSITION": "INVALID_TRANSITION",
}


def not_found(entity: str, entity_id: str = "") -> HTTPException:
    """404 - Entity not found."""
    detail = f"{entity} nije pronađen(a)"
    if entity_id:
        detail = f"{entity} s ID-em '{entity_id}' nije pronađen(a)"
    return HTTPException(
        status_code=404,
        detail={"message": detail, "code": ERROR_CODES["NOT_FOUND"]},
    )


def bad_request(message: str, code: str = "BAD_REQUEST") -> HTTPException:
    """400 - Bad request / business logic error."""
    return HTTPException(
        status_code=400,
        detail={"message": message, "code": code},
    )


def conflict(message: str) -> HTTPException:
    """409 - Conflict (e.g., overlapping contracts, duplicate resources)."""
    return HTTPException(
        status_code=409,
        detail={"message": message, "code": ERROR_CODES["CONFLICT"]},
    )


def validation_error(message: str) -> HTTPException:
    """422 - Validation error (invalid input format/type)."""
    return HTTPException(
        status_code=422,
        detail={"message": message, "code": ERROR_CODES["VALIDATION_ERROR"]},
    )


def forbidden(message: str = "Nemate dozvolu za ovu akciju") -> HTTPException:
    """403 - Forbidden."""
    return HTTPException(
        status_code=403,
        detail={"message": message, "code": ERROR_CODES["FORBIDDEN"]},
    )


def file_too_large(max_mb: int = 50) -> HTTPException:
    """422 - File too large."""
    return HTTPException(
        status_code=422,
        detail={
            "message": f"Datoteka je prevelika (max {max_mb}MB)",
            "code": ERROR_CODES["FILE_TOO_LARGE"],
        },
    )


def invalid_file_type(allowed: list) -> HTTPException:
    """422 - Invalid file type."""
    return HTTPException(
        status_code=422,
        detail={
            "message": f"Nepodržani format datoteke. Dozvoljeni: {', '.join(allowed)}",
            "code": ERROR_CODES["INVALID_FILE_TYPE"],
        },
    )


def overlap_error(message: str = "Preklapanje s postojećim zapisom") -> HTTPException:
    """409 - Overlap conflict."""
    return HTTPException(
        status_code=409,
        detail={"message": message, "code": ERROR_CODES["OVERLAP"]},
    )


def invalid_transition(current: str, target: str) -> HTTPException:
    """400 - Invalid status transition."""
    return HTTPException(
        status_code=400,
        detail={
            "message": f"Neispravna promjena statusa: {current} → {target}",
            "code": ERROR_CODES["INVALID_TRANSITION"],
        },
    )
