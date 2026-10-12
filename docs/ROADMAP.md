# Roadmap

Source of truth for scope: `PRODUCTION_IMPLEMENTATION_PLAN.md`. Status as of 2026-10-07.
Rule: no phase starts until the previous one is stable (tests, lint, types, build, startup).

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Repo structure, backend/frontend foundation, Postgres + migrations, config, auth, app shell, Stitch design system, UI kit, logging, errors, health checks, test foundation, Docker dev env | **In progress.** Backend done and tested. Frontend partial (see `../STATUS.md`). Docker, CI, README, DESIGN_SYSTEM.md, ARCHITECTURE.md not started. |
| 2 Master Resume | Upload, PDF/DOCX parsing, structured resume, Master Resume, editor, versioning, resume analysis, My Resumes | Not started |
| 3 Job Intelligence | Paste JD, upload JD, job parsing and analysis, requirements, `JobSourceAdapter` implementations for approved sources only | Not started |
| 4 Matching | Resume-to-job match, scores and subscores, evidence, skill gaps | Not started |
| 5 AI Tailoring | Tailoring plan, provider adapter, evidence mapping, two-layer factual consistency, before/after review (Accept/Reject/Edit/Regenerate), tailored versions, test proving the Master Resume is never mutated | Not started |
| 6 Resume Output | ATS analysis, templates, PDF generation, download | Not started |
| 7 Applications | Tracker, detail, status, notifications | Not started |
| 8 Interview | Prep, technical/behavioral/resume-based questions, mock interview, answer evaluation | Not started |
| 9 Hardening | Security review, performance, observability, deployment, backup/recovery, docs | Not started |

## Phase 1 remaining work
1. Frontend: entry point, router and providers, Login, Register, Dashboard, Settings, Not-found; frontend tests.
2. Dockerfiles, `docker-compose.yml`, CI workflow, `README.md`.
3. `docs/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`.
4. Verify: tests, lint, type checks, builds, app startup, responsive layouts (1440/1280/1024/768/390/375), migrations, auth, error handling.
5. Report exactly what was implemented, then wait before Phase 2.

## Pending company decisions (not invented; each has a configuration boundary)
| ID | Decision | Needed by |
|---|---|---|
| D-02 | Official product name | Before public release |
| D-03 | LLM provider, model, key ownership, budget | Phase 2 verification |
| D-04 | User/organization model, roles, SSO | Before any sharing/team feature |
| D-05 | Approved job sources | Phase 3 extension |
| D-06 | Deployment target, hosting, object storage | Phase 9 |
| D-07 | Email provider | When verification/reset is needed |
| D-08 | Data retention, deletion SLAs, privacy scope | Before production launch |
| D-09 | Benchmark / market data source | When a source exists |
| D-10 | PDF resume templates | Phase 6 |
| D-11 | Scoring weights sign-off | Phase 4 |

Decisions D-01 (repository) is resolved: greenfield.
