# Handoff: Monthly report becomes a real, data-driven PDF

**Date:** 2026-05-07
**Author:** Karlo (via Claude)
**Status:** Code complete — needs deploy + smoke test.

## Why

Karlo rejected the screenshot-style PDF (html2canvas + jsPDF) — it produced blurry, image-only output with non-selectable text. Reports must look like real business documents. WeasyPrint + Jinja are already used for contracts / annexes / tenant statements; this extends the pattern to the monthly portfolio report.

## What this does

When the user clicks **PDF** on the monthly report page, the frontend now POSTs the already-generated report payload to a new server endpoint, which:

1. Renders a Jinja template (`brand/monthly-report-template.html`) with the provided data.
2. Runs WeasyPrint to produce a real PDF with selectable text, crisp typography, and the Riforma brand styling.
3. Streams the PDF back as `application/pdf` for the browser to download.

No AI re-call, no DB reads — pure render. The PDF matches what the user sees on screen, but as a proper document.

## Files changed

### Backend

- `brand/monthly-report-template.html` — **new**. A4 portrait, Riforma navy header, sections: Sažetak, KPI grid, Financijski pregled, Popunjenost, Održavanje, Ugovorni rizici (table), Preporuke (numbered), Tehnološki prijedlozi (2-up grid). Uses `@page` rules + page numbers (`Stranica X od Y`).
- `backend/app/services/monthly_report_pdf_service.py` — **new**. Exports `render_monthly_report_pdf(report, mjesec, godina, source=None) -> bytes`. Registers Jinja filters `currency` (hr-HR formatting with non-breaking space) and `clamp_pct` plus a `priority_label` global. Same WeasyPrint 503 fallback as `contract_pdf_service`.
- `backend/app/api/v1/endpoints/ai.py`
  - New import: `from fastapi.responses import Response as FastAPIResponse`.
  - New `MonthlyReportPdfRequest` Pydantic model: `mjesec`, `godina`, `report` (dict, the structured payload from `/ai/monthly-report`), optional `source`.
  - New endpoint `POST /api/v1/ai/monthly-report/export-pdf` (scope `reports:read`) that calls the service and returns the PDF as a download.

### Frontend

- `frontend/src/shared/api.js` — new `exportMonthlyReportPdf(payload)` helper, configured with `responseType: "blob"`.
- `frontend/src/features/reports/MjesecniIzvjestajPage.jsx`
  - Removed `useRef` / `reportRef`, removed `html2canvas` and `jsPDF` dynamic imports, removed the entire client-side rasterisation block (~80 lines).
  - `handleDownloadPdf` now POSTs to the server, downloads the returned blob via a temporary `<a download>`, and falls back to a clear toast if the server returns an error blob (it parses the JSON out of the blob to surface the detail message).
  - Added `downloading` state + spinner on the PDF button.

## Test plan

After deploy:

1. **Smoke test** — navigate to `/reports/monthly` (or wherever the page lives), pick a recent month, click "Generiraj izvještaj", wait for AI, click **PDF**.
2. **Inspect the PDF**:
   - Text must be selectable (try ⌘-F → search for "Mjesečni prihod").
   - Typography uses Helvetica/Arial (not screenshot blur).
   - Croatian characters render correctly (Sažetak, Održavanje, etc.).
   - Page numbers on every page footer.
   - Riforma navy header on first page.
   - Currency formatted as `18.500,00 €` (with non-breaking space).
3. **WeasyPrint health** — if production hasn't run any PDF generation in a while, confirm libpango / libcairo are still installed. If you get HTTP 503 with "WeasyPrint nije instaliran", reinstall system deps and `pip install weasyprint` per `DEPLOY.md`.
4. **Auth** — `reports:read` scope already gates the existing `/monthly-report` endpoint, so anyone who can generate a report can also export it.
5. **Empty / partial reports** — if a section is missing in the payload, the template hides it (Jinja `{% if %}` guards). Try a report that returned `success: true` but with no `tech_prijedlozi` and confirm the section is simply absent.
6. **Long content** — paste several long preporuke (~10 entries) and confirm the numbered list paginates cleanly.

## Notes for the dev

- **No new dependencies.** WeasyPrint, Jinja2, FastAPI are all already installed.
- **No DB migration.**
- **AI cost stays the same** — the PDF endpoint does not call Anthropic. The frontend re-uses the report payload it already has in memory.
- **Frontend on-screen preview is unchanged** — only the download path was rewired. The page still shows the same colorful HTML preview; the PDF is now a separate, server-rendered document with the same content.
- **Template lives in `brand/`** alongside `ugovor-template.html` and `aneks-template.html` so brand updates can be made in one place.
- **Pattern reusable** — Karlo asked to migrate the other reports next (PropertyReport, MaintenanceReport, ProjectReportPage). Same recipe: Jinja template in `brand/`, service in `app/services/`, endpoint, frontend wires up `responseType: "blob"`. Reuse the `_format_currency` / `_html_to_pdf` helpers if useful (or extract them to a shared module once we have 3+ users).
