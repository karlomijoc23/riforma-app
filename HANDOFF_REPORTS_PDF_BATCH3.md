# Handoff: Final PDF migration round + cleanup

**Date:** 2026-05-07
**Author:** Karlo (via Claude)
**Status:** Code complete — needs deploy + smoke test.
**Follows:** `HANDOFF_MONTHLY_REPORT_PDF.md` (batch 1) and `HANDOFF_REPORTS_PDF_BATCH2.md` (batch 2).

## What this batch finishes

Every PDF in the app now goes through the server-side WeasyPrint + Jinja pipeline. No screenshot fallbacks anywhere. `html2canvas` + `jspdf` are gone from the frontend.

| Surface | Endpoint | Service | Template |
|---|---|---|---|
| Single contract PDF (UgovorDetailPage) | `GET /api/v1/ugovori/{id}/export-pdf` (already existed) | `contract_pdf_service.py` | `brand/ugovor-template.html` |
| Single property detail (NekretninaDetailPage + NekretninePage preview) | `GET /api/v1/nekretnine/{id}/export-pdf` *(new)* | `property_detail_pdf_service.py` *(new)* | `brand/property-detail-template.html` *(new)* |
| Contracts listing / overview (UgovoriPage + ContractReport) | `GET /api/v1/ugovori/report/export-pdf` *(new)* | `contracts_report_pdf_service.py` *(new)* | `brand/contracts-report-template.html` *(new)* |
| Tenant statement (TenantStatementPage) | `GET /api/v1/zakupnici/{id}/statement` (already existed) | `tenant_statement_service.py` | inline HTML in service |

## Files added

- `backend/app/services/property_detail_pdf_service.py`
- `backend/app/services/contracts_report_pdf_service.py`
- `brand/property-detail-template.html`
- `brand/contracts-report-template.html`

## Files modified

- `backend/app/api/v1/endpoints/properties.py` — new `GET /{id}/export-pdf` (placed after `/portfolio-report/export-pdf` so route matching prefers literal paths).
- `backend/app/api/v1/endpoints/contracts.py` — new `GET /report/export-pdf` (declared before `/{id}/export-pdf` for the same reason).
- `frontend/src/shared/api.js` — added `exportPropertyDetailPdf`, `exportContractsReportPdf`.
- `frontend/src/features/contracts/UgovorDetailPage.jsx` — removed html2canvas fallback. Server PDF only; if the server can't render, user sees the real error rather than a screenshot. Dropped `printRef` / `ContractPrintTemplate`.
- `frontend/src/features/contracts/UgovoriPage.jsx` — wired `handlePrint` to `exportContractsReportPdf` with the active filters (status, zakupnik, date_from, date_to). Added a new "PDF (filteri)" toolbar button so the previously-dead handler is now reachable.
- `frontend/src/features/contracts/ContractReport.jsx` — replaced ~90 lines of html2canvas slicing with the blob download helper.
- `frontend/src/features/properties/NekretninaDetailPage.jsx` — `Ispiši` button now downloads the server PDF; off-screen `<PropertyPrintTemplate>` block deleted.
- `frontend/src/features/properties/NekretninePage.jsx` — preview dialog `Ispiši` button hits the same server endpoint; `viewContracts` state and the off-screen template removed.
- `frontend/src/features/reports/TenantStatementPage.jsx` — `exportPdf` calls the existing `/zakupnici/{id}/statement` endpoint with derived `period_od` / `period_do` for the selected month.

## Files deleted

- `frontend/src/shared/pdfGenerator.js` — html2canvas + jspdf wrapper. No callers left.
- `frontend/src/features/contracts/ContractPrintTemplate.jsx`
- `frontend/src/features/properties/PropertyPrintTemplate.jsx`

## Dependencies removed

- `html2canvas` (was `^1.4.1`)
- `jspdf` (was `^3.0.3`)

After pulling this batch the dev should:

```bash
cd frontend
rm -rf node_modules
npm install   # picks up the trimmed package.json
```

`pdfDateStamp()` in `formatters.js` is left intact — it has no callers but the test suite covers it; can be removed later if you want the cleanup completionist.

## Test plan

After deploy:

1. **UgovorDetailPage** — open any contract → "Ispis" → check PDF, text selectable, hr characters render. If WeasyPrint were missing you'd now see `"Generiranje PDF-a nije dostupno — WeasyPrint nije instaliran. ..."` instead of a blurry fallback.
2. **NekretninaDetailPage** — open any property → "Ispiši" → confirm sections render: osnovni podaci, financijski KPI-ji, popunjenost bar, podprostori, parking, aktivni ugovori, napomene. Includes parking integration from the recent migration.
3. **NekretninePage** — open the preview sheet for a property → "Ispiši" → same PDF as above (reuses `/nekretnine/{id}/export-pdf`).
4. **UgovoriPage** — apply a status filter (e.g. "Aktivno"), click the new "PDF (filteri)" button → verify the PDF header shows `Filter: status: Aktivno` and the table only includes matching rows. Combine filters (status + date range) and confirm.
5. **ContractReport (`/ugovori/report`)** — click PDF → full overview with all KPIs, status chips, top tenants, revenue by property, full table.
6. **TenantStatementPage** — pick a tenant + month → "PDF izvoz" → server-rendered statement. Croatian characters and currency formatting consistent with the rest of the app.
7. **WeasyPrint health** — same fallback as before; if you see 503 reinstall `libpango` / `libcairo` per `DEPLOY.md`.

## Notes for the dev

- **One shared backend module** (`pdf_common.py`) now powers all 7 PDF services. Brand changes (color palette, fonts, currency format) go in one place.
- **One shared frontend helper** (`shared/downloadBlob.js`) handles every blob download. New PDF features just plug in.
- **All PDFs are now**: A4 with proper page numbering, real fonts, selectable text, brand-consistent navy header, clear sectioning. No more "looks like a screenshot of the page".
- **No screenshot fallback exists anywhere.** This is intentional per the requirement: if the server can't render, surface the error so it gets fixed rather than silently degrading to an inferior output.
- **Auth scopes used:**
  - `leases:read` for contract single + listing PDFs
  - `properties:read` for property detail PDF
  - `reports:read` for portfolio + monthly reports
  - `maintenance:read` for maintenance report
  - `projects:read` for project report
  - `financials:read` for tenant statement

## Out of scope (intentionally not touched)

- `pdfDateStamp()` in `shared/formatters.js` and its test in `__tests__/formatters.test.jsx` — dead but harmless. Delete in a future janitorial pass if you care.
- The `/api/v1/maintenance/report` (data-only JSON endpoint) is still around. New PDF endpoint is `/api/v1/maintenance/report/export-pdf`. Keep both — JSON one might still feed dashboards.
