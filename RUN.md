# How to run AI Resume Intelligence locally

All 18 phases in `PHASES.md` are built. This page takes you from a fresh PC to a running app.
The app has two parts that run at the same time: the **backend** (Python API on port 8000) and
the **frontend** (website on port 5173). Both use a **Microsoft SQL Server** database.

## 1. Install the prerequisites (once)

| Tool | Version | Download | Notes |
|---|---|---|---|
| Python | 3.12 or newer | https://www.python.org/downloads/ | On Windows, tick **"Add python.exe to PATH"** in the installer. |
| Node.js | 22 or newer | https://nodejs.org/ | The LTS version is fine. |
| SQL Server | 2019 or newer | Your company server, or SQL Server Developer/Express edition | You need a login that can create databases. |
| Microsoft ODBC Driver 18 for SQL Server | 18 | https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server | The Python driver (`pyodbc`) uses it. |

Check them in a new terminal:

```powershell
python --version
node --version
Get-OdbcDriver -Name "ODBC Driver 18 for SQL Server"
```

## 2. Create the database and login (once)

In SQL Server Management Studio, connect as an administrator, open **New Query** and run this,
with a strong password of your own in place of `CHOOSE_A_STRONG_PASSWORD`:

```sql
CREATE LOGIN resume_app WITH PASSWORD = 'CHOOSE_A_STRONG_PASSWORD', CHECK_POLICY = ON;
CREATE DATABASE resume_intel;
CREATE DATABASE resume_intel_test;
GO
USE resume_intel;      CREATE USER resume_app FOR LOGIN resume_app; ALTER ROLE db_owner ADD MEMBER resume_app;
GO
USE resume_intel_test; CREATE USER resume_app FOR LOGIN resume_app; ALTER ROLE db_owner ADD MEMBER resume_app;
GO
```

Then set both URLs in `backend/.env`. Take the host and port from SSMS's "Server name"; a comma
there is a colon in the URL (`192.168.29.53,50491` becomes `192.168.29.53:50491`):

```
DATABASE_URL=mssql+pyodbc://resume_app:PASSWORD@HOST:PORT/resume_intel?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
TEST_DATABASE_URL=mssql+pyodbc://resume_app:PASSWORD@HOST:PORT/resume_intel_test?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
```

`resume_intel` is the app's database. `resume_intel_test` is only for the test suite, which
deletes its tables on each run. The app never needs `sa`: use this dedicated login. If the
password contains `@`, `:` or `/`, write it URL-encoded (`@` becomes `%40`).

## 3. Start the backend (terminal 1)

Windows (PowerShell), from the unzipped `ai-resume-intelligence` folder:

```powershell
cd backend
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirements.lock -e ".[dev]"
copy ..\.env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

If PowerShell refuses to run `Activate.ps1`, run this once and try again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

macOS / Linux:

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.lock -e ".[dev]"
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

The backend is ready when it prints `Uvicorn running on http://127.0.0.1:8000`.
API docs: http://localhost:8000/api/docs. Leave this terminal open.

## 4. Start the frontend (terminal 2)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. You'll see the product page; click **Get started** to create an account.
The frontend forwards `/api` requests to the backend on port 8000, so both terminals must stay open.

### Try it: build a resume from scratch

1. On the dashboard, click **Build my resume** (or go to http://localhost:5173/resumes/new).
2. Pick a template, then fill in the short steps. The preview on the right updates as you type.
3. On **Summary**, click **Draft it from my entries** for a first draft built from what you entered.
4. On **Finish**, fix anything the checklist flags, then click **Save and get my PDF**.
5. On the Resume Builder page, try other templates and click **Download PDF**.

## 5. Next time

You only need steps 3 and 4 again, without the one-time lines:

```powershell
# terminal 1
cd backend
..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload

# terminal 2
cd frontend
npm run dev
```

After pulling new code, also run `alembic upgrade head` (backend) and `npm install` (frontend).

## Turn on the AI features (optional)

Without a key, everything works with the built-in rules, and the AI buttons say "not configured".
To enable them, get a free key at https://console.groq.com and set these in `backend/.env`:

```
LLM_PROVIDER=groq
LLM_MODEL=openai/gpt-oss-120b
LLM_API_KEY=<your key>
```

Never commit the key. Restart the backend after changing `.env`.

## Run the checks

```powershell
# backend (from backend/, with the venv active)
pytest
ruff check .
mypy

# frontend (from frontend/)
npm run lint
npm run typecheck
npm test
npm run build
```

## Common problems

| Problem | Fix |
|---|---|
| `Login failed for user 'resume_app'` | Step 2 was skipped or the password in `backend/.env` differs. Check `DATABASE_URL`. |
| `Can't open lib 'ODBC Driver 18 for SQL Server'` | Install Microsoft ODBC Driver 18 for SQL Server (step 1). |
| `TCP Provider: ... timeout` | Wrong or blocked host/port. Use SSMS's "Server name"; its comma is a colon in the URL. |
| `Cannot open database "resume_intel"` | Run `python -m app.db.create_database` once, then `alembic upgrade head`. |
| Website shows network errors | The backend (terminal 1) is not running. |
| `Port 5173 is in use` | Close the other dev server, or use the port Vite prints instead. |
| Backend tests refuse to run | `TEST_DATABASE_URL` must point at a database whose name ends in `_test`. |

## Project layout

| Folder | What's in it |
|---|---|
| `backend/` | FastAPI app (`app/`), Alembic migrations, pytest suite |
| `frontend/` | React 19 + Vite + TypeScript app (`src/`), Vitest tests |
| `docs/` | Architecture, security, deployment, design system, roadmap |
| `scripts/` | Database and file backup / restore |
| `PHASES.md` | Phase-by-phase status and what was verified |

## End-to-end tests (optional)

A real browser runs the main journey (sign up, import a resume, analyze a job, match, tailor,
download the PDF) against the real API and database. From `frontend/`, once:

```powershell
npx playwright install chromium
```

Then, with SQL Server reachable and `backend/.env` set up:

```powershell
npm run e2e
```

It starts the API (after migrating the database) and the website itself, or reuses them if
they are already running. Each run creates a new `e2e-…@example.com` account in the database.

