# Handoff: Unit photos (slike jedinica)

**Date:** 2026-05-11
**Author:** Karlo (via Claude)
**Status:** Code complete — backend reloaded, frontend hot-reloaded. No DB migration.

## Why

Karlo wanted to attach photos to individual property units (e.g., interior shots of office A2). The audit showed Riforma's documents system was photo-ready: image extensions whitelisted, `property_unit_id` FK on `dokumenti`, JSON `metadata_json` column existed. We just needed thumbnail generation server-side + a gallery component on the frontend.

## What this does

**On upload:** the existing `POST /api/v1/dokumenti` endpoint now detects `image/*` content types, generates two PIL thumbnails (200×200 thumb + 800×600 medium, JPEG quality 85), saves them next to the original in `UPLOAD_DIR` with names like `{doc_id}_thumb.jpg`, and writes their URL-relative paths into `metadata_json.variants`.

**On delete:** the `DELETE /api/v1/dokumenti/{id}` endpoint now also removes the variants (path-traversal-safe like the original file).

**On frontend:** every unit row on `NekretninaDetailPage` Jedinice tab now has a gallery (max 4 thumbnails visible, "+N more" overflow chip, "+ Slika" upload button, lightbox modal with prev/next thumbnail strip + delete button). Upload accepts multiple files at once.

## Files changed

### Backend
- `backend/app/models/domain.py` — `TipDokumenta.SLIKA_JEDINICE` enum value added
- `backend/app/api/v1/endpoints/documents.py`
  - Upload: image content_type detection + Pillow variant generation, paths stored in `metadata_json.variants`
  - Delete: also removes variant files from disk
- `backend/app/api/v1/endpoints/ai.py` already imports PIL — no new dependency

### Frontend
- `frontend/src/features/properties/UnitPhotosGallery.jsx` (new) — full gallery component (thumbnails grid + lightbox + upload + delete). Reuses existing `api.getDokumentiPropertyUnit`, `api.createDokument`, `api.deleteDokument`. Renders thumbnails using `metadata_json.variants.thumb` URL; falls back to original `putanja_datoteke` if variants missing.
- `frontend/src/features/properties/NekretninaDetailPage.jsx` — imports `UnitPhotosGallery`, renders a new "Slike jedinica" Card below the units table; each unit row shows oznaka + naziv on the left and the gallery on the right (stacks on mobile via `sm:flex-row` / `flex-col`).

## Test plan

After deploy:

1. **Upload single photo** — open any property detail page → Jedinice tab → click "+ Slika" on a unit → pick a JPG/PNG → thumbnail appears within ~1 second.
2. **Upload multiple** — pick 3+ images at once → all upload, toast confirms count.
3. **Verify variants exist** — check `UPLOAD_DIR` for files matching `{doc_id}_thumb.jpg` and `{doc_id}_medium.jpg`.
4. **Lightbox** — click any thumbnail → modal opens with medium variant, thumbnail strip at bottom for navigation, current photo count displayed (e.g., "3/7").
5. **Delete** — from lightbox click "Obriši" → confirms → photo gone, all 3 disk files (original + 2 variants) removed, lightbox shifts to next photo or closes if last.
6. **Oversized file** — try uploading a 12 MB file → frontend rejects with "prevelika (max 10 MB)" toast (server max is 50 MB but we cap frontend lower for speed).
7. **Bad format** — try uploading `.txt` → server rejects with 422 + extension-list message.
8. **Photo on multi-unit contract** — multi-unit contract has 3 units; each unit has its own gallery, photos isolated to each unit (a photo uploaded for A2 doesn't show on A3).
9. **Mobile** — phone viewport (390 px): unit gallery rows stack name above thumbs, 4 thumbnails wrap to 2 rows.

## Notes for the dev

- **No new dependency** — Pillow was already imported in `app/api/v1/endpoints/ai.py` for the vision pipeline.
- **No DB migration** — `metadata_json` JSON column already existed.
- **Backward compatible** — existing photo uploads (e.g. property `slika` field) untouched. Documents uploaded before this batch have no variants; the frontend falls back to `putanja_datoteke` so they still render (just larger payloads on first paint).
- **Variants are stored URL-relative** as `"uploads/{filename}"` — same convention as `putanja_datoteke`. The auth-protected `GET /uploads/{path}` route serves them.
- **RGBA / palette mode handling** — PNG files with transparency are converted to RGB before JPEG encoding so variants don't crash on alpha.
- **Failure tolerance** — if Pillow can't process a file (corrupt EXIF, missing libjpeg, etc.) the upload still succeeds with just the original; a warning is logged.
- **Frontend env var** — gallery uses `REACT_APP_BACKEND_URL` for variant URLs; falls back to relative URL via craco proxy (same pattern as `buildDocumentUrl`).

## Out of scope (follow-ups)

- **Drag-and-drop upload** — currently uses native `<input type="file">` click. Could add a drop zone wrapper (~30 min).
- **Photo order** — currently sorted by `created_at` descending (server default). Adding `metadata_json.order` + a drag-reorder UI is feasible if needed.
- **EXIF stripping** for privacy — Pillow can do this on the resize pass, easy add.
- **NekretninarForm gallery** — admin currently uploads from the read-only detail page. The unit-edit modal in the form doesn't yet have gallery; users have to save the property first, then upload. Adding to the form is doable but means handling photos against a not-yet-existing unit ID (need a 2-phase save or buffer photos in component state).
- **Other entities** (zakupnici contacts, maintenance task before/after photos) — same pattern would apply; reuse `UnitPhotosGallery` parameterized for tip + FK.
