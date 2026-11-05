# AI Resume Intelligence (working title)

A resume intelligence web app. Users keep a verified **master resume**, analyze job descriptions,
see evidence-based match scores and skill gaps, and produce **tailored** resumes. Every tailored
change is checked against the master. The product name is pending (decision D-02).

- **Phase status:** [`PHASES.md`](PHASES.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Security notes:** [`docs/SECURITY.md`](docs/SECURITY.md)
- **Deployment, backups and monitoring:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Design system:** [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

## Stack

The backend uses FastAPI, SQLAlchemy 2, Alembic and Microsoft SQL Server (2019 or newer, through
pyodbc and Microsoft ODBC Driver 18). The frontend uses React 19,
Vite, TypeScript, Tailwind 4, TanStack Query, and React Hook Form with Zod.

## Quick start with Docker

```bash
docker compose up -d db
docker compose run --rm api python -m app.db.create_database
docker compose run --rm api alembic upgrade head
docker compose up --build
# open http://localhost:8080
```

## Local development

Prerequisites: Python 3.12+, Node 22+, Microsoft ODBC Driver 18 for SQL Server, and a SQL Server
login allowed to create databases (see [`RUN.md`](RUN.md) for the SQL to create one).

```bash

# backend
cd backend
python -m venv ../.venv
# macOS/Linux: source ../.venv/bin/activate     Windows: ..\.venv\Scripts\activate
pip install -r requirements.lock -e ".[dev]"
cp ../.env.example .env              # set DATABASE_URL and TEST_DATABASE_URL
python -m app.db.create_database     # once: creates the database named in DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload        # http://localhost:8000/api/docs

# frontend (second terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api to :8000)
```

## Checks

| What | Command |
|---|---|
| Backend tests | `cd backend && pytest`. Uses `TEST_DATABASE_URL`. The name must end in `_test`, because the suite drops tables. |
| Backend lint and types | `ruff check . && mypy` |
| Frontend | `npm run lint && npm run typecheck && npm test && npm run build` |
| API type drift | `npm run check:api` (regenerate with `npm run gen:api`) |

CI runs all of these on every push and PR (`.github/workflows/ci.yml`).

## Configuration

Every setting comes from environment variables, documented in [`.env.example`](.env.example).
The AI provider, email provider, hosting and data retention are pending company decisions.
Until a decision is made, the related features report "not configured" instead of faking output.
