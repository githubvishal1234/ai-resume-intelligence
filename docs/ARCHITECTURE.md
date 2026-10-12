# Architecture (as built)

This document describes only what exists. Phase status is in `../PHASES.md`.

## Shape

The app is a modular monolith with two deployables:

```
Browser (React SPA) ──/api/v1, cookie session──► FastAPI ──► PostgreSQL
        ▲                                         │
        └── nginx serves the static build and proxies /api (same origin, so no CORS)
                                                  └──► StorageBackend (local filesystem)
```

## Backend (`backend/app`)

| Package | Responsibility |
|---|---|
| `api/v1` | Router composition: health (`/health/live`, `/health/ready`) and `/system/capabilities` |
| `auth` | routes → `AuthService` → repositories. Covers register, login, logout and me. |
| `core` | settings and production guards, error envelope, JSON logging, request-context middleware, rate limiter, password and token helpers, `AccessPolicy` |
| `db` | Declarative base with deterministic constraint names; engine and session dependency |
| `models` | `User`, `UserSession`, `AuditLog`, `Resume`, `ResumeVersion`, `ResumeFile`, `ResumeImport`, `Job`, `JobMatch`, `TailoringSession`, `TailoringChange` |
| `resumes` | `content.py` holds the structured resume document. `extraction.py` validates uploads and extracts text. `parser.py` is the heuristic section parser. `analysis.py` holds the rule-based checks. `service.py` holds the master resume rules. `router.py` serves `/resumes`. |
| `skills` | `vocabulary.py`: a fixed skills vocabulary (canonical names, categories, aliases) shared by job analysis and, from Phase 4, matching. Short names that are also English words (Go, R, Spring…) must be correctly cased in prose to count. |
| `jobs` | `analyzer.py` is the deterministic job-description analyzer (`jd-rules-v1`). `service.py` and `router.py` serve `/jobs` (paste, upload, link, list, detail, edit, re-analyze, delete). `sources.py` is the job-source adapter registry, empty until a source is approved (D-05). |
| `matching` | `matcher.py` is the rule-based matcher (`match-rules-v1`): per-requirement evidence that points at resume entity ids, a skill gap matrix and weighted subscores (weights pending D-11). `service.py` stores each run as an immutable `JobMatch` snapshot; `router.py` serves `/jobs/{id}/matches` and `/matches`. |
| `tailoring` | `proposer.py` makes deterministic proposals (`tailor-rules-v1`: reorder skills, bullets and projects; add skills the experience shows; one summary sentence) and applies accepted ones. `factcheck.py` is factual-consistency layer 1. `service.py` runs review, the optional LLM rewrite (only through `get_llm_provider`) and finalize; `router.py` serves `/tailoring`. |
| `ai`, `mail`, `storage`, `benchmarks` | Provider interfaces and registries for pending decisions. Only `LocalStorage` is implemented. |

**Conventions**
- Handlers stay thin, and business rules live in services.
- Services commit explicitly, one transaction per request.
- Every error is an `AppError` subclass. The public envelope is
  `{code, message, request_id, details?}`, with no stack traces or submitted values.
- User-owned resources are checked with `ensure_access(actor, owner_id)`. An unauthorized
  access looks like a 404.
- Resume content is a versioned JSONB document (`resume_versions.content`). Versions are
  append-only, and a DB trigger rejects UPDATEs. `resumes.current_version` points at the
  latest one. Edits send `base_version`, and a stale base returns `409 VERSION_CONFLICT`.
- Uploads become a `ResumeImport` (pending review). Only `confirm` creates a master resume or
  a new master version, using the content the user reviewed.
- A saved job keeps its raw text, so analysis can be re-run when the analyzer improves.
  Requirement ids are derived from the requirement text, so they stay the same on re-analysis.
- Matching only reads the resume and the job. A match records the resume version and
  analyzer/matcher versions it used, and is reported as stale when any of them moves on.
- Tailoring never writes to the master resume. Finalizing creates a separate `tailored`
  resume whose version 1 has `source = 'tailoring'`. Accepted text must pass the factual
  check: numbers, years, technologies and names that the master does not contain are refused.
- Schema changes go through Alembic only. The test suite builds the schema by running the
  migrations.

## Frontend (`frontend/src`)

| Folder | Responsibility |
|---|---|
| `app/` | `App` providers, route table (`router.tsx`), route guards, query client |
| `pages/` | Route screens: auth (login, register), dashboard, settings, not-found, `resumes/` (list, upload, review, detail, editor, versions, analysis), `jobs/` (list, analyze, detail), `match/` (Job Match, Skill Gap Matrix), `tailor/` (start, review, finalize) |
| `components/resume` | `ResumeEditor` (structured editor that keeps entity ids), `ResumeView`, `FileDrop`, `ConfidenceBadge` |
| `components/layout` | App shell: sidebar (lg+), drawer (< lg), bottom tab bar (< md) |
| `components/ui` | UI kit (Button, Card, Field, Notice, Pill, Score, StatTile, States, Tabs) |
| `services/` | `apiClient` is the only place that calls `fetch`. Typed services sit on top of it. |
| `hooks/` | React Query hooks (session, capabilities) |
| `types/api.d.ts` | Generated from the backend's OpenAPI schema. CI fails if it drifts. |

**Auth on the client**
- `GET /auth/me` returns the user and the CSRF token. The token is kept in memory and sent as
  `X-CSRF-Token` on unsafe methods.
- A 401 from any query marks the session as signed out, and the guards redirect to `/login`.
