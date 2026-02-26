# QA Playbook - AI Document Flows & Multi-tenant Access

This guide outlines the verification strategy for the core features that must pass before promoting a build to staging or production. It combines automated coverage with targeted manual checks for the AI-assisted document workflow and tenant access controls.

## Test Environment

- **Backend:** FastAPI service with `USE_IN_MEMORY_DB=false`, seeded admin user, AI features enabled (`OPENAI_API_KEY` set or stubbed).
- **Frontend:** Production build served behind the same domain as the API (check `REACT_APP_BACKEND_URL`).
- **Tenants:** At least two tenant profiles (`tenant-default` and one additional) with distinct memberships to validate scoping.
- **Sample Data:** Property/contract/tenant fixtures for both tenants, plus a library of uploadable PDF documents.

## Entry Criteria

- Latest migrations applied (`python -m backend.manage migrate`).
- Feature branches merged and unit tests green in CI.
- Secrets synchronised with the target environment.

## Exit Criteria

- All automated suites green.
- Manual regression checklist completed with zero Sev-1/Sev-2 issues outstanding.
- AI document extraction accuracy spot-checked on at least three real-world samples with acceptable confidence scores (>80%).

## Automation Suite

Run the following in CI and locally before manual testing:

```bash
pytest
corepack yarn test --runInBand --detectOpenHandles
python backend_test.py --base-url https://<staging-host>
```

Key test files:

| Path                                             | Purpose                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `tests/test_tenant_scoping.py`                   | Backend guardrails for tenant IDs, metadata validation, and role restrictions |
| `frontend/src/__tests__/tenantProfiles.test.jsx` | SPA tenant profile editor interactions                                        |
| `frontend/src/__tests__/tenantSwitcher.test.jsx` | Navbar tenant switcher behaviour                                              |
| `frontend/src/__tests__/documentWizard.test.jsx` | Document wizard happy-path flow                                               |
| `frontend/src/__tests__/dashboard.test.jsx`      | Dashboard aggregation while respecting active tenant                          |

## Manual Regression Checklist

### Authentication & Session

- Login with admin and property manager accounts; confirm httpOnly `access_token` cookie is set and cleared on logout.
- Attempt invalid credentials three times; verify backend returns 401 and rate-limiter (if configured) behaves as expected.

### Tenant Switching

- Switch from `tenant-default` to a secondary tenant and back; ensure entity lists (properties, tenants, documents) reload correctly.
- Hit `GET /api/nekretnine` with a mismatched `X-Tenant-Id`; expect a `403` and friendly error message in the UI.
- Verify that users without membership cannot select tenants they do not own (the switcher should hide or disable entries).

### Document Wizard (AI Flow)

- Upload a PDF invoice; confirm AI suggestions populate meta fields, associations, and confidence badges render correctly.
- Toggle between AI-applied and manual overrides; ensure manual edits persist when navigating between steps.
- Attempt to submit without required metadata; expect inline validation and `400` response from the API.
- Create a manual property unit during the wizard and link it to the document; verify it appears in subsequent lists.

### Document Wizard (Negative Cases)

- Upload an unsupported file type to trigger error handling.
- Simulate AI failure (e.g., remove `OPENAI_API_KEY`); ensure the UI surfaces the fallback path without blocking upload.
- Force an expired session and retest submission to confirm the wizard recovers after re-authentication.

### Multi-tenant Data Integrity

- Create a document while scoped to Tenant A; confirm it is invisible when switching to Tenant B.
- Ensure activity logs (`/api/activity-logs`) include the correct `tenant_id` for writes performed during the session.
- Validate that maintenance tasks, reminders, and financial records respect the tenant filter.

### Notifications & Emails (if enabled)

- Trigger any automated email (e.g., document approval) and verify the template references the correct tenant branding.
- Confirm SMTP credentials are masked in logs.

### Performance & Observability

- Review backend logs for tenant context (look for `tenant_id` in structured JSON entries).
- Hit `/api/health` (once implemented) and ensure monitoring dashboards receive the correct status.
- Measure end-to-end document upload latency; flag if it exceeds the agreed SLA.

## Bug Reporting Template

When filing issues discovered during QA, include:

- **Title:** `[Tenant|Document Wizard] Concise description`
- **Environment:** Staging/Production + build SHA
- **Steps to Reproduce:** Numbered list with tenant context, payloads, and sample files
- **Expected vs Actual:** Clear statements
- **Artifacts:** Screenshots, HAR file, relevant log snippets (attached securely)

## Sign-off

- QA lead reviews findings and signs off in the deployment tracker.
- Engineering owner updates the README checklist and schedules the production deployment.

Keep this playbook alongside release notes so it evolves with new features.
