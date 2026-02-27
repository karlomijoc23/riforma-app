# Riforma — Production Checklist

## Security

- [ ] `AUTH_SECRET` is a strong random value (not the dev default)
- [ ] `ENVIRONMENT=production` in `.env`
- [ ] HTTPS enabled with valid TLS certificate
- [ ] CORS restricted to actual frontend domain(s) (`BACKEND_CORS_ORIGINS`)
- [ ] CSRF double-submit cookie pattern active (CSRFMiddleware)
- [ ] `SEED_ADMIN_ON_STARTUP=false` after initial admin created
- [ ] CSP headers reviewed and tightened for your deployment
- [ ] Secrets rotated: AUTH_SECRET, DB_PASSWORD, API keys

## Database

- [ ] MariaDB using strong, unique password
- [ ] `DB_POOL_SIZE` and `DB_MAX_OVERFLOW` tuned for expected load (defaults: 5/10)
- [ ] Automatic backups configured (`riforma-backup.timer` or equivalent)
- [ ] Backup restore tested and verified
- [ ] Database firewall: only backend can connect
- [ ] Contract overlap advisory locks functioning (concurrent creates safe)

## Backend

- [ ] `LOG_FORMAT=json` for structured log aggregation
- [ ] `LOG_LEVEL=INFO` (or `WARNING` for quiet production)
- [ ] Sentry DSN configured (`SENTRY_DSN_BACKEND`) — warning logged if missing
- [ ] Rate limiting active (slowapi)
- [ ] Health check endpoint responding: `GET /health`
- [ ] Readiness probe responding: `GET /ready`

## Frontend

- [ ] Production build: `GENERATE_SOURCEMAP=false npx craco build`
- [ ] `REACT_APP_BACKEND_URL` set correctly (empty for same-origin, or explicit URL)
- [ ] Sentry DSN configured if error tracking desired
- [ ] No console errors in production build

## SMTP / Notifications

- [ ] SMTP credentials configured if email notifications needed
- [ ] Test email delivery verified (contract approval, rejection notifications)

## Infrastructure

- [ ] Apache2 configured (`apache/riforma.conf` enabled)
- [ ] Required Apache modules enabled: `proxy`, `proxy_http`, `rewrite`, `headers`, `deflate`
- [ ] SSL certificate auto-renewal (certbot timer)
- [ ] Uptime monitoring configured (health endpoint)
- [ ] Log aggregation pipeline (JSON logs -> ELK/Loki/CloudWatch)
- [ ] Firewall (UFW) active, only necessary ports open (80, 443)
- [ ] Uploads directory configured (`/opt/riforma/uploads`)

## Post-Deploy Verification

- [ ] Login flow works (httpOnly cookie set, CSRF token present)
- [ ] Tenant switching works
- [ ] Document upload/download works
- [ ] Contract creation with overlap check works
- [ ] AI features respond (if API keys configured)
- [ ] Backup timer running: `systemctl status riforma-backup.timer`
