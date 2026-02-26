# Deployment Guide (Render + Vercel)

This document walks through deploying the Riforma stack using Render for the FastAPI backend (and optional static hosting) plus Vercel for the React frontend.

## 1. Prerequisites

- GitHub repository with latest changes pushed.
- MariaDB database (managed or self-hosted) reachable from Render, with a dedicated user.
- Production values for secrets (AUTH_SECRET, API tokens, SMTP creds, etc.).

## 2. Backend on Render

Render uses `render.yaml` and the Dockerfile under `backend/`.

1. **Create secrets (Render Dashboard → Secrets):**
   - `riforma-database-url` → MariaDB connection string.
   - `riforma-auth-secret` → strong JWT secret.
   - `riforma-api-tokens` → optional comma-separated tokens (`token:role`).
   - `riforma-initial-admin-email` / `riforma-initial-admin-password` → only for first deploy.
   - Integrations (`riforma-openai`, `riforma-mailgun`) as needed.

2. **Create a Web Service:**
   - “New +” → “Blueprint” → select the repo (Render reads `render.yaml`).
   - Confirm the service name, region, and plan (`starter` works for dev).
   - Attach a **Persistent Disk** (e.g. `/app/uploads`, 1 GB) to preserve uploaded PDFs.
   - Set a health check path `/api/health` and enable auto deploy.

3. **Database:** ensure `DATABASE_URL` points to your MariaDB instance and allow Render IP addresses if using allowlists.

4. **Migrations & Admin seeding:**
   - Once the service boots, open the “Shell” tab and run `python -m backend.manage migrate`.
   - If `INITIAL_ADMIN_*` secrets are set, use `python -m backend.manage seed-admin` then remove those secrets.

5. **CORS:** update `BACKEND_CORS_ORIGINS` env var (in `render.yaml` or dashboard) to your public frontend URL.

## 3. Frontend on Vercel

1. **Import project:** Vercel dashboard → “Add New…” → “Project” → select the repo.
2. **Configure:**
   - Build command: `corepack yarn --cwd frontend install && corepack yarn --cwd frontend build`
   - Output directory: `frontend/build`
   - Install command: leave empty (Vercel reuses build command) or `corepack yarn --cwd frontend install`.
   - Framework preset: “Other”.
3. **Environment variables (Production/Preview):**
   - `REACT_APP_BACKEND_URL` = `https://<your-render-backend>/api`
   - Optionally `REACT_APP_SENTRY_DSN`, etc.
4. **vercel.json rewrites:** update `vercel.json` so the rewrite destination matches your live backend domain once Render is ready.
5. **Deploy:** Trigger build; once `frontend/build` is published, map your custom domain.

## 4. Domain & TLS

- Point DNS (e.g. `api.example.com`) to Render. Render issues TLS automatically.
- Point `app.example.com` (or root) to Vercel; configure HTTPS enforced.
- Update `BACKEND_CORS_ORIGINS` and Vercel env facts accordingly.

## 5. Post-deploy Checklist

- Run smoke tests: `BACKEND_BASE_URL=https://api.example.com BACKEND_API_TOKEN=<token> BACKEND_TENANT_ID=tenant-default python3 backend_test.py`
- Verify the React build against the production API (login, documents preview, tenant switching).
- Confirm uploads persist (Render persistent disk) and are served via HTTPS.
- Monitor logs (Render dashboard) and configure alerts on your MariaDB host.
- Schedule regular backups and rotate API tokens.

## 6. Optional: Render Static Frontend

If you prefer hosting the React bundle on Render instead of Vercel, keep the `staticSites` section in `render.yaml`. Otherwise remove it to avoid provisioning an extra site.

## 7. Updating

- Push changes to `main`; Render/Vercel auto-deploy if auto deploy enabled.
- For backend secrets changes, update them via Render dashboard and redeploy.
- Re-run migrations whenever backend models change.

For environment variable references, see `backend/.env.production.example` and `frontend/.env.production.example`.
