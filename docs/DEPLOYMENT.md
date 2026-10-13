# Deployment contract

Hosting is still a company decision (D-06). This document is the contract any host must meet,
whatever it is: what runs, what it needs, how to release, and how to recover.

## What runs

| Piece | Image / command | Notes |
|---|---|---|
| Database | PostgreSQL 16 | Needs `gen_random_uuid()` (built in since 13). One database per environment. |
| API | `backend/Dockerfile` → `uvicorn app.main:app` on :8000 | Stateless apart from upload storage. Runs as uid 10001. |
| Web | `frontend/Dockerfile` → nginx on :8080 | Serves the SPA and proxies `/api/` to the API, so both share one origin and need no CORS. |
| Migrations | `alembic upgrade head` (same API image) | A separate, explicit release step. The API never migrates itself. |
| Backups | `scripts/backup.sh` on a schedule | See [Backups](#backups). |

TLS terminates in front of the web container (load balancer or ingress). Set HSTS there
(`Strict-Transport-Security: max-age=31536000; includeSubDomains`); the web container listens
on plain HTTP and does not set it.

## Required configuration (API)

Every setting is an environment variable; [`.env.example`](../.env.example) lists them all with
safe development defaults. In production:

| Variable | Value |
|---|---|
| `APP_ENV` | `production`. The app then refuses to start with the dev database password, an insecure cookie or `*` CORS. It also hides `/api/docs`. |
| `DATABASE_URL` | `postgresql+psycopg://…` with a real password, from the host's secret store. |
| `SESSION_COOKIE_SECURE` | `true` (HTTPS only). |
| `FORWARDED_ALLOW_IPS` | The IPs of the proxy in front of the API (the web container's network). Never `*` in production: rate limiting keys on the client IP from `X-Forwarded-For`. |
| `STORAGE_LOCAL_ROOT` | A persistent volume (uploaded resumes). Must be backed up with the database. |
| `REGISTRATION_ENABLED` | `false` once accounts are provisioned another way (D-04). |
| `SLOW_REQUEST_MS` | Optional, default 1000. Requests at or over this log a `slow_request` warning. |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | Optional. They turn on AI rewrites and interview feedback; left empty, the app reports "AI provider not configured". For Groq: `groq`, `openai/gpt-oss-120b` (or `openai/gpt-oss-20b`) and a Groq key from the secret store. For OpenAI: `openai`, a model with structured outputs and an OpenAI key. The API container needs outbound HTTPS to the provider (`https://api.groq.com/openai/v1` or `https://api.openai.com/v1`, or `LLM_BASE_URL` if set). |
| `LLM_RESPONSE_FORMAT` | `json_schema` (default) sends the answer schema to the model. Use `json_object` for a Groq model that does not support JSON-schema output; the schema then goes in the prompt and the answer is still validated. |
| `AI_DAILY_LIMIT_PER_USER` | Default 100, `0` for no limit. AI calls per user per UTC day; over it the API answers `429 AI_DAILY_LIMIT_REACHED`. A rewrite plus its claim check counts as 2. Every call is logged in `ai_usage` (counts and timings only) for cost tracking. |
| `LLM_MIN_OUTPUT_TOKENS` | Optional floor for output limits, for reasoning models that spend tokens thinking first. Groq already uses at least 1024. |
| `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES` | Optional, default 60 and 2. Rate-limit and server errors are retried with backoff; a rejected key is not. |
| `EMAIL_PROVIDER` | Empty (default) hides "Forgot your password?". `smtp` works with any provider that offers SMTP (D-07 picks which). `console` writes mail to the log and is refused in production. |
| `EMAIL_FROM`, `APP_BASE_URL` | Required with any email provider: the sender address, and the public URL of the web app used in reset links (e.g. `https://app.example.com`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD` | For `smtp`. Port defaults to 587 with `starttls`; use `ssl` for port 465. `none` is refused in production. The password comes from the secret store. The API needs outbound access to the SMTP host. |
| `PASSWORD_RESET_TTL_MINUTES` | Default 30. How long a reset link works. |

`CORS_ORIGINS` stays empty when the SPA is served through the web container.

## Release procedure

1. Build both images from the same commit. CI must be green (tests, lint, types, API type
   drift, dependency audits).
2. Back up (run `scripts/backup.sh`, or confirm the scheduled one from the last hour).
3. Run migrations with the **new** API image: `alembic upgrade head`.
4. Roll the API, then the web container.
5. Gate traffic on readiness: `GET /api/v1/health/ready` returns 200 only when the database is
   reachable **and** its schema is at this build's migration head. It returns 503 with
   `"migrations": "pending"` if step 3 was skipped.
6. Liveness for restarts: `GET /api/v1/health/live` (does not touch the database).

Rollback: redeploy the previous images. Migrations so far only add tables and columns, so the
previous version runs against the newer schema. If a future migration is not backward
compatible, its PR must say so and include the downgrade plan.

## Observability

- **Logs:** one JSON object per line on stdout. Each request logs `method`, `path` (never the
  query string), `status` and `duration_ms` with a `request_id`. Unhandled errors log the stack
  trace under `unhandled_exception`; the client only sees the request id.
- **Tracing a report:** every response carries `X-Request-Id` (a valid incoming one is kept),
  and every error body includes `request_id`. Search the logs for it.
- **Slow requests:** `slow_request` warnings at `SLOW_REQUEST_MS`. Every response also has a
  `Server-Timing: app;dur=…` header for browser dev tools.
- **Suggested alerts:** readiness failing for 2 minutes; any `unhandled_exception`; more than
  1% of responses with status 5xx; `slow_request` more than 5 times a minute; a failed backup
  job (the script exits non-zero).
- **Measured baseline (2026-10-12, one user with 40 jobs, 80 applications, 15 question sets):**
  every list and detail endpoint answers in under 50 ms median; a match run takes about 20 ms;
  a PDF export about 20 ms.

## Backups

`scripts/backup.sh` writes a timestamped folder with a `pg_dump` custom-format dump, a tarball of
the upload storage, and `SHA256SUMS`. It keeps the newest `BACKUP_KEEP` (default 14) folders.

```bash
DATABASE_URL=… STORAGE_LOCAL_ROOT=/app/var/storage BACKUP_DIR=/backups ./scripts/backup.sh
```

- Run it at least daily, and before every release. Copy `BACKUP_DIR` off the host (object
  storage with its own retention). How long backups are kept is part of D-08 (retention).
- The dump contains personal data (resumes). Store it encrypted and restrict access like the
  database itself. The script creates files readable only by its own user.

### Restore

`scripts/restore.sh` checks the checksums and restores into an **empty** database and an empty
storage folder. It refuses to touch a database that already has tables.

```bash
createdb resume_intel_restore
DATABASE_URL=…/resume_intel_restore STORAGE_LOCAL_ROOT=/restore/storage \
  ./scripts/restore.sh /backups/20261012T065400Z
```

Then point an API instance at it and check `GET /api/v1/health/ready`.

### Restore drill

Restore the latest backup into a scratch database every month and compare row counts.

Last drill, 2026-10-12, against the development database:
- Three backups were taken with `BACKUP_KEEP=2`, and the oldest was removed.
- The latest was restored into a new database. The row counts of all 18 tables matched, and
  all 21 stored files matched by SHA-256.
- The immutable resume-version trigger still rejected UPDATEs.
- An API pointed at the restored database reported ready with migrations current.
- Restoring a second time was refused, because the target already had tables.

## Dependencies

- Python runtime dependencies are pinned in `backend/requirements.lock`. The image installs
  from it, then installs the app with `--no-deps`. To update: in a clean virtualenv on Python
  3.12, run `pip install ./backend && pip freeze --exclude resume-intel-backend`, replace the
  lock (keep its header line), run the full test suite, and commit.
- npm dependencies are pinned by `frontend/package-lock.json` (`npm ci`).
- CI runs `pip-audit -r requirements.lock` and `npm audit --omit=dev --audit-level=high`.

## Scaling notes

- The login rate limiter is per process (see [SECURITY.md](SECURITY.md)). Run a single API
  process per host until it moves to a shared store, or accept N times the limit.
- Follow-up reminders are generated when the user reads notifications; no worker is needed.
  Email reminders would need a worker and D-07.
