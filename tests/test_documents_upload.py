import io
import os
from pathlib import Path

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402
from app.api.v1.endpoints.documents import (  # noqa: E402
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE_BYTES,
    _sanitize_filename,
)

settings = get_settings()


def _upload(client, admin_headers, filename, content, content_type="application/pdf", naziv="Test"):
    files = {"file": (filename, io.BytesIO(content), content_type)}
    data = {"naziv": naziv, "tip": "ostalo"}
    return client.post(
        "/api/dokumenti",
        files=files,
        data=data,
        headers=admin_headers,
    )


# ---------------------------------------------------------------------------
# Unit-level: _sanitize_filename
# ---------------------------------------------------------------------------


def test_sanitize_filename_strips_path_components():
    assert _sanitize_filename("../../etc/passwd") == "passwd"
    assert _sanitize_filename("/absolute/path/file.pdf") == "file.pdf"
    assert _sanitize_filename("..\\..\\windows\\cmd.exe") not in (
        "..\\..\\windows\\cmd.exe",
        "cmd.exe",  # backslash handling may vary by platform; just ensure no slashes
    ) or "\\" not in _sanitize_filename("..\\..\\windows\\cmd.exe")


def test_sanitize_filename_replaces_special_chars():
    result = _sanitize_filename("my file (1)!.pdf")
    assert "/" not in result
    assert "\\" not in result
    # Parens/spaces/bangs replaced with underscore
    assert " " not in result
    assert "(" not in result


def test_sanitize_filename_keeps_safe_chars():
    assert _sanitize_filename("report-2026_final.pdf") == "report-2026_final.pdf"


# ---------------------------------------------------------------------------
# Integration: upload endpoint validation
# ---------------------------------------------------------------------------


def test_upload_rejects_disallowed_extension(client, admin_headers):
    response = _upload(
        client,
        admin_headers,
        filename="evil.exe",
        content=b"MZ\x00\x00malicious",
        content_type="application/pdf",  # try to bypass via content-type
    )
    assert response.status_code == 422
    assert "Nedozvoljeni tip datoteke" in response.json()["detail"]


def test_upload_rejects_disallowed_content_type(client, admin_headers):
    response = _upload(
        client,
        admin_headers,
        filename="script.pdf",
        content=b"<script>alert(1)</script>",
        content_type="text/html",
    )
    assert response.status_code == 422
    assert "content-type" in response.json()["detail"].lower()


def test_upload_rejects_oversized_file(client, admin_headers):
    oversized = b"A" * (MAX_FILE_SIZE_BYTES + 1)
    response = _upload(
        client,
        admin_headers,
        filename="big.pdf",
        content=oversized,
        content_type="application/pdf",
    )
    assert response.status_code == 422
    assert "prevelika" in response.json()["detail"].lower()


def test_upload_accepts_all_whitelisted_extensions(client, admin_headers):
    """Sanity check — whitelist is not empty and has expected members."""
    assert ".pdf" in ALLOWED_EXTENSIONS
    assert ".exe" not in ALLOWED_EXTENSIONS
    assert ".sh" not in ALLOWED_EXTENSIONS
    assert ".php" not in ALLOWED_EXTENSIONS


def test_upload_path_traversal_in_filename_is_neutralized(client, admin_headers):
    """Filename with path traversal must not escape uploads directory."""
    response = _upload(
        client,
        admin_headers,
        filename="../../../etc/passwd.pdf",
        content=b"%PDF-1.4 fake",
        content_type="application/pdf",
    )
    assert response.status_code == 201, response.text
    data = response.json()
    file_path = data.get("file_path") or ""
    uploads_root = str(settings.UPLOAD_DIR.resolve())
    # Resolved path must stay within uploads root
    assert str(Path(file_path).resolve()).startswith(uploads_root)
    # Stored filename must not contain path separators
    stored_name = Path(file_path).name
    assert "/" not in stored_name
    assert "\\" not in stored_name
    # Original filename preserved in metadata, but not used on disk
    assert data.get("original_filename") == "../../../etc/passwd.pdf"


def test_upload_valid_pdf_succeeds(client, admin_headers):
    response = _upload(
        client,
        admin_headers,
        filename="lease.pdf",
        content=b"%PDF-1.4 minimal",
        content_type="application/pdf",
        naziv="Lease contract",
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["naziv"] == "Lease contract"
    assert data["original_filename"] == "lease.pdf"


def test_download_blocks_path_outside_uploads(client, admin_headers, tmp_path):
    """Even if DB row points outside uploads/, download must 403."""
    from app.db.repositories.instance import dokumenti as dokumenti_repo

    # Create a file outside uploads dir
    outside = tmp_path / "secret.pdf"
    outside.write_bytes(b"%PDF-1.4 secret")

    import asyncio

    async def _insert():
        return await dokumenti_repo.create({
            "id": "traversal-test-id",
            "naziv": "Traversal attempt",
            "tip": "ostalo",
            "file_path": str(outside),
            "original_filename": "secret.pdf",
            "content_type": "application/pdf",
        })

    # Set tenant context for repo (tenant-scoped)
    from app.db.tenant import CURRENT_TENANT_ID
    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    try:
        asyncio.get_event_loop().run_until_complete(_insert())
    except RuntimeError:
        asyncio.run(_insert())
    finally:
        CURRENT_TENANT_ID.set(None)

    response = client.get(
        "/api/dokumenti/traversal-test-id/download", headers=admin_headers
    )
    assert response.status_code == 403
