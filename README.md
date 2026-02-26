# Riforma

Platforma za upravljanje nekretninama — FastAPI backend, React 19 frontend, AI-potpomognuti workflow za ugovore i dokumente.

## Tech Stack

| Layer    | Technology                                                |
| -------- | --------------------------------------------------------- |
| Frontend | React 19, Tailwind CSS, Radix UI (Shadcn), Framer Motion  |
| Backend  | FastAPI, async SQLAlchemy, Pydantic v2                    |
| Database | MariaDB 11.4 (async via asyncmy)                          |
| AI       | Anthropic Claude (parsiranje PDF-ova, generiranje aneksa) |
| Auth     | JWT httpOnly cookies, CSRF double-submit, rate limiting   |
| Deploy   | Docker Compose, Nginx, systemd                            |

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 20+
- MariaDB 11.4+

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.production.example .env   # edit with your values
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start          # dev server on port 3000
```

### Production (Docker)

```bash
docker compose up -d
```

Services: MariaDB, Backend (uvicorn), Frontend (Nginx), MariaDB Exporter (Prometheus).

## Environment Variables

Create `backend/.env`:

```env
DATABASE_URL=mariadb+asyncmy://user:pass@127.0.0.1:3306/riforma
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=riforma
DB_PASSWORD=<lozinka>
DB_NAME=riforma
AUTH_SECRET=<openssl rand -hex 32>
ANTHROPIC_API_KEY=<tvoj_key>
BACKEND_CORS_ORIGINS=http://localhost:3000
SEED_ADMIN_ON_STARTUP=true
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<min_8_znakova>
INITIAL_ADMIN_FULL_NAME=Admin
INITIAL_ADMIN_ROLE=admin
ENVIRONMENT=production
```

## Architecture

```
backend/app/
  api/v1/endpoints/   # 21 endpoint modules
  core/               # config, security, roles, rate limiter
  db/                 # document_store pattern, tenant isolation
  middleware/          # CSRF protection
  services/           # business logic (contract status sync)

frontend/src/
  features/           # auth, contracts, dashboard, documents,
                      # maintenance, projects, properties,
                      # settings, tenants
  components/         # Navigation, TenantSwitcher, ui/ (Shadcn)
  shared/             # api.js, auth.js, entityStore.js, formatters.js
```

### Multi-tenant

Svaki request salje `X-Tenant-Id` header. Backend izolira podatke po tenantu za: nekretnine, jedinice, zakupnike, ugovore, dokumente, odrzavanje, projekte, parking, primopredajne protokole, activity logs, postavke.

### Auth Flow

1. `POST /api/auth/login` — postavlja httpOnly `access_token` cookie + readable `csrf_token` cookie
2. Frontend salje `X-CSRF-Token` header na mutating requestove
3. Nema tokena u localStorage — sve je cookie-based
4. Account lockout nakon 5 neuspjesnih pokusaja (15 min)
5. Rate limit: 5 req/min na login endpoint

### Roles

| Role    | Access                                                               |
| ------- | -------------------------------------------------------------------- |
| admin   | Full access to all modules                                           |
| manager | Properties, tenants, contracts, maintenance, documents, reports, KPI |
| viewer  | Read-only access                                                     |
| guest   | No default access                                                    |

## Frontend Routes

| Path              | Page                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `/`               | Dashboard (kontrolni centar)                                          |
| `/nekretnine`     | Properties list                                                       |
| `/nekretnine/:id` | Property detail (units, parking, documents)                           |
| `/zakupnici`      | Tenants list                                                          |
| `/zakupnici/:id`  | Tenant detail                                                         |
| `/ugovori`        | Contracts list                                                        |
| `/ugovori/:id`    | Contract detail                                                       |
| `/projekti`       | Projects list                                                         |
| `/projekti/:id`   | Project detail (phases, stakeholders, Gantt)                          |
| `/odrzavanje`     | Maintenance kanban board                                              |
| `/postavke`       | Settings (5 tabs: Profili, Tvrtka, Obavijesti, Izvjestaji, Korisnici) |

## API Endpoints

| Prefix                    | Module                                           |
| ------------------------- | ------------------------------------------------ |
| `/api/auth`               | Login, register, logout, me                      |
| `/api/users`              | User management                                  |
| `/api/nekretnine`         | Properties CRUD                                  |
| `/api/units`              | Property units                                   |
| `/api/zakupnici`          | Tenants CRUD                                     |
| `/api/ugovori`            | Contracts CRUD + status transitions              |
| `/api/dokumenti`          | Document upload/management                       |
| `/api/maintenance`        | Maintenance tasks                                |
| `/api/parking`            | Parking spaces                                   |
| `/api/projekti`           | Projects (phases, stakeholders, transactions)    |
| `/api/dashboard`          | Dashboard aggregations                           |
| `/api/ai`                 | PDF parsing, contract analysis, annex generation |
| `/api/pretraga`           | Global search                                    |
| `/api/settings`           | Tenant settings                                  |
| `/api/tenants`            | SaaS tenant profiles                             |
| `/api/handover-protocols` | Handover protocols                               |

## PDF Reports

Built with html2canvas + jsPDF. Available for:

- **Contracts** (`/ugovori/report`) — status breakdown, timeline, revenue
- **Properties** (`/nekretnine/report`) — occupancy, unit status, maintenance
- **Maintenance** (`/odrzavanje/report`) — KPI, workload, resolution time
- **Projects** (`/projekti/:id/report`) — phases, budget, timeline

## Testing

```bash
# Frontend (4 suites, 9 tests)
cd frontend
CI=true npx craco test --watch=false --runInBand --detectOpenHandles

# Backend
cd backend
pytest

# Lint
pre-commit run --all-files   # black, isort, prettier, flake8
```

## Security

- HttpOnly cookie auth (no token in response body or localStorage)
- CSRF double-submit cookie pattern
- Rate limiting (login: 5/min, API: 30/s, AI: 3/min)
- Account lockout after 5 failed attempts
- CSP headers (`script-src 'self'`, `frame-ancestors 'self'`)
- Security headers: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy
- File upload validation: extension whitelist, 50MB max, sanitized filenames
- Path traversal protection on file delete
- Pydantic validation on all endpoints
- Production mode: docs disabled, generic errors, AUTH_SECRET required

## Deployment

### Docker Compose (recommended)

```bash
docker compose up -d
```

### Bare-metal (Debian/Ubuntu)

See `DEPLOY.md` for full guide. Key files:

- `deploy/riforma-backend.service` — systemd service (hardened)
- `deploy/riforma-frontend.service` — Nginx service
- `deploy/riforma-backup.service` + `.timer` — automated DB backups
- `scripts/deploy.sh` — deployment script
- `scripts/setup-server.sh` — server provisioning

## Scripts

| Script                      | Purpose                   |
| --------------------------- | ------------------------- |
| `scripts/start_backend.sh`  | Start backend dev server  |
| `scripts/start_frontend.sh` | Start frontend dev server |
| `scripts/stop_backend.sh`   | Stop backend              |
| `scripts/stop_frontend.sh`  | Stop frontend             |
| `scripts/deploy.sh`         | Production deployment     |
| `scripts/setup-server.sh`   | Server setup/provisioning |
| `scripts/backup-db.sh`      | Database backup           |
| `scripts/restore-db.sh`     | Database restore          |

## License

Private — All rights reserved.
