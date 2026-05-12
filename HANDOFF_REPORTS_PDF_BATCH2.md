# Handoff: Property + Maintenance + Project reports → server-side PDFs

**Date:** 2026-05-07
**Author:** Karlo (via Claude)
**Status:** Code complete — needs deploy + smoke test.
**Follows:** `HANDOFF_MONTHLY_REPORT_PDF.md` (the monthly AI report was migrated first; this batch finishes the other three top-level reports.)

## Why

Continued migration off `html2canvas + jsPDF` (DOM screenshots) to server-side WeasyPrint + Jinja so Riforma reports look like real business documents — selectable text, crisp typography, authoritative DB-derived numbers, consistent brand identity across all PDFs.

## What changed

Three reports now download a server-rendered PDF instead of a client-side rasterisation of the React preview:

| Report | Endpoint | Service | Template |
|---|---|---|---|
| Portfelj nekretnina (`PropertyReport.jsx`) | `GET /api/v1/nekretnine/portfolio-report/export-pdf` (scope `reports:read`) | `app/services/property_report_pdf_service.py` | `brand/property-report-template.html` (A4 landscape) |
| Održavanje (`MaintenanceReport.jsx`) | `GET /api/v1/maintenance/report/export-pdf` (scope `maintenance:read`) | `app/services/maintenance_report_pdf_service.py` | `brand/maintenance-report-template.html` (A4 landscape) |
| Projekt (`ProjectReportPage.jsx`) | `GET /api/v1/projekti/{id}/export-pdf` (scope `projects:read`) | `app/services/project_report_pdf_service.py` | `brand/project-report-template.html` (A4 portrait) |

All three reuse a new shared module:

- `backend/app/services/pdf_common.py` — single home for `make_jinja_env()`, `html_to_pdf()`, hr-HR currency / number / date formatters, `clamp_pct`, `priority_label`, `MONTH_NAMES`. The previously-built `monthly_report_pdf_service.py` was refactored to use it (no behaviour change).

Frontend gets a small download helper:

- `frontend/src/shared/downloadBlob.js` — `downloadPdfFromResponse(res, filename)` triggers the file save; `extractBlobErrorDetail(err)` reads JSON error bodies out of axios blob responses so toasts surface the real `detail`.

## Files added

- `backend/app/services/pdf_common.py`
- `backend/app/services/property_report_pdf_service.py`
- `backend/app/services/maintenance_report_pdf_service.py`
- `backend/app/services/project_report_pdf_service.py`
- `brand/property-report-template.html`
- `brand/maintenance-report-template.html`
- `brand/project-report-template.html`
- `frontend/src/shared/downloadBlob.js`

## Files modified

- `backend/app/services/monthly_report_pdf_service.py` — refactored to use `pdf_common`.
- `backend/app/api/v1/endpoints/properties.py` — new `GET /portfolio-report/export-pdf`.
- `backend/app/api/v1/endpoints/maintenance.py` — new `GET /report/export-pdf`.
- `backend/app/api/v1/endpoints/projects.py` — new `GET /{id}/export-pdf`.
- `frontend/src/shared/api.js` — added `exportPortfolioReportPdf`, `exportMaintenanceReportPdf`, `exportProjectReportPdf`.
- `frontend/src/features/properties/PropertyReport.jsx` — drops `useRef` / `generatePdf` / `pdfDateStamp`, calls server endpoint, blob download, spinner state.
- `frontend/src/features/maintenance/MaintenanceReport.jsx` — same pattern, ~80 lines of html2canvas removed.
- `frontend/src/features/projects/ProjectReportPage.jsx` — same.

## Test plan

After deploy, for each report:

1. **PropertyReport** — `/nekretnine/izvjestaj` (or wherever it's mounted) → click PDF
   - KPI numbers match the on-screen totals.
   - Tipovi nekretnine grid renders correctly (colors + count + value + income).
   - Detail table footer totals match the body sum.
   - Croatian characters (Površina, Vrijednost, Zakupljenost, Završeno, …) render correctly.
2. **MaintenanceReport** — `/odrzavanje/izvjestaj` → click PDF
   - 6-card KPI strip + 3-card cost breakdown both render.
   - Status + priority distribution bars show correct widths and percentages.
   - "Zadaci s prekoračenim rokom" alert box only appears when there are overdue tasks.
   - Detail table footer shows correct material + labor totals.
3. **ProjectReportPage** — `/projekti/{id}/izvjestaj` → click PDF
   - Header status pill matches project status (color + label).
   - Budget bar fill width matches the percent.
   - Phase list shows correct status dots; transactions show + / − sign correctly.
   - Documents grid renders 2-up.
4. **WeasyPrint health** — same 503 fallback as monthly report; if you see "WeasyPrint nije instaliran" reinstall libpango / libcairo per `DEPLOY.md`.
5. **Auth** — different scopes per report. Confirm a `viewer` role (which has `properties:read`, `maintenance:read`, `projects:read` but probably not `reports:read`) can hit each endpoint. The portfolio report is gated by `reports:read` because it surfaces financials — adjust if you want viewers to download it.

## Notes for the dev

- **No new dependencies, no DB migration.** All four PDF services use the existing WeasyPrint install.
- **All four PDFs share `pdf_common`.** Brand changes (color palette, fonts, currency formatting) in one place.
- **Frontend on-screen previews are unchanged** — only the download path was rewired. The colorful Tailwind preview still works for browsing; the PDF is now a separate, professional document with the same content.
- **Property report scope:** kept at `reports:read` to match the existing dashboard / monthly report. If you want all property-readers to access it, drop to `properties:read`.
- **What's NOT migrated yet** (still use `shared/pdfGenerator.js` html2canvas path):
  - `ContractReport.jsx` (multi-contract listing)
  - `UgovoriPage.jsx`, `UgovorDetailPage.jsx` (single contract list / detail PDFs — note: `/contracts/{id}/export-pdf` server endpoint already exists, so detail page just needs a wire-up; the listing PDF would need a new template)
  - `NekretninaDetailPage.jsx`, `NekretninePage.jsx` (single-property and listing screenshots)
  - `pdfGenerator.js` itself remains in the bundle until those callers are migrated. Don't delete it yet.

## Suggested follow-ups (out of scope here)

1. Wire `UgovorDetailPage` "PDF" button to the existing `/contracts/{id}/export-pdf` endpoint (no new backend work).
2. Migrate the contract listing PDF (`UgovoriPage` / `ContractReport`) — needs a new Jinja table template.
3. Migrate `NekretninaDetailPage` single-property PDF — likely the highest-value one for investors.
4. Once everything is migrated, delete `frontend/src/shared/pdfGenerator.js` and the `html2canvas` / `jspdf` deps from `package.json`.
