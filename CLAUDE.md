# CLAUDE.md

## Quick Start

```bash
# Backend
cd backend
source /Users/gs/Documents/MK-proptech/backend/.venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm start          # Dev server on port 3000
npx craco build    # Production build
CI=true npx craco test --watch=false --runInBand --detectOpenHandles
```

## Architecture

- **Backend**: FastAPI + async SQLAlchemy ORM + MariaDB
- **Frontend**: React 19 + Shadcn/Radix UI + Tailwind CSS + craco
- **Multi-tenant**: `X-Tenant-Id` header, `CURRENT_TENANT_ID` ContextVar, tenant-scoped repositories
- **Auth**: httpOnly cookies + CSRF double-submit pattern, `useAuth()` hook

### Directory Layout

```
backend/app/
  api/v1/endpoints/   # 27 endpoint modules
  core/config.py      # Settings, env vars, DB config
  db/tenant.py        # CURRENT_TENANT_ID ContextVar
  db/repositories/    # base.py (BaseRepository), repos.py, instance.py
  models/tables.py    # 23 SQLAlchemy ORM models
  services/           # Business logic (contract sync, etc.)

frontend/src/
  features/           # auth, contracts, dashboard, documents, maintenance, projects, properties, settings, tenants
  components/         # Navigation.js, TenantSwitcher.js, ui/
  shared/             # api.js, auth.js, entityStore.js, formatters.js
```

## Key Patterns

- **Croatian naming**: nekretnine (properties), zakupnici (tenants), ugovori (contracts), održavanje (maintenance)
- **EntityStore**: React Context + global event bus for cache invalidation
- **Code splitting**: All route-level components use `React.lazy()`
- **Response format**: `{"message": "..."}` (not "poruka")
- **Status enums**: aktivno, na_isteku, istekao, raskinuto, arhivirano
- **PDF reports**: html2canvas + jsPDF, use `pdfDateStamp()` for dd.mm.yy filenames
- **Navigation**: Single-row (Logo | Nav pills | expandable search + TenantSwitcher)
- **Settings**: Merged at `/postavke` (5 tabs). `/profili` redirects here.

## Environment Variables

Required in `backend/.env`:

- `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `AUTH_SECRET` (JWT signing key)
- `ANTHROPIC_API_KEY` (AI features)
- Optional: `OPENAI_API_KEY`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`
- Optional: `LOG_LEVEL` (default: INFO), `LOG_FORMAT` (`text` or `json`)
- Optional: `SENTRY_DSN_BACKEND` (production error tracking)

## Code Style

- Backend: black + isort + flake8
- Frontend: Prettier defaults via craco/eslint
- `re.escape()` on all user input in regex searches
- File uploads: extension whitelist + 50MB max + sanitized filenames

## Gotchas

- Backend venv is at main repo root, not in worktree — symlink `.env` if using worktree
- `config.py` defaults DB port to 3307, but local MariaDB runs on 3306 — check `.env`
- Tenant-scoped repos have `tenant_scoped = True` in `repos.py` — auto-filtered via `CURRENT_TENANT_ID`
