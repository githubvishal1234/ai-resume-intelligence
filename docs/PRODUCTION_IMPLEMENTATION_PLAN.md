> **Historical document (2026-10-06).** Written before any code existed. D-01 was later resolved as *greenfield* (see `ROADMAP.md`), so the "reuse the existing repository" policy and §0/§1 no longer apply. Current status lives in `../PHASES.md`; architecture as built is in `ARCHITECTURE.md`.

# AI Resume Intelligence Platform — Production Implementation Plan

Status: **DRAFT rev 2 for approval** · Date: 2026-10-06 · Scope of this document: analysis and plan only. No application code has been written, and nothing has been changed or rewritten.

**Rev 2 changes:** adopts company direction — *reuse the existing repository (no greenfield unless fundamentally unusable)*, keep existing product naming and flag inconsistencies, no assumed LLM provider / tenancy model / cloud / email provider / retention policy / benchmark data / job-site scraping. Company-dependent items are now tracked in a **Decision Register (§18)** with status *Pending*, each with the low-risk working assumption the design uses meanwhile. The plan is no longer blocked on those answers.

---

## 0. Inspection findings (read this first)

| Input | Finding |
|---|---|
| Existing repository | **Not accessible from this session (re-checked after your rev-2 instruction).** The working directory contains only tool/config dotfiles; no `package.json`, `pyproject.toml`, `requirements.txt`, Dockerfile, migrations or tests are reachable. No GitHub account is linked to this session, nothing was attached other than the Stitch ZIP, and no computer is linked. **This is an access problem, not evidence that no repo exists.** |
| "Existing Claude Code implementation" | Same: not reachable. The brief relies on it (Master Resume source-of-truth UX, Accept/Reject/Edit/Regenerate, factual consistency, architecture). Its contents are **unknown to me**; this plan does not describe them. |
| What unblocks repository analysis | Any one of: (a) link GitHub and give `owner/repo` (I can attach it with `add_repo`); (b) attach a zip of the repo; (c) open this task from the Claude desktop app with "Link to this computer" and name the folder. |
| Stitch ZIP | Extracted and fully inspected: 9 screens (`code.html` + `screen.png`), `DESIGN.md` ("Executive Precision"), a logo, and a placeholder headshot. |
| Backend / DB / APIs / tests | **Unknown** — cannot be inspected without repository access. Nothing below should be read as a claim about existing code. |

**Consequence and policy:** the company direction is to **use the existing repository**, so this plan is *reuse-first*. Every "target" element below (stack, module layout, tables, components) is a **proposal to be reconciled against what the repo already contains**, never an instruction to replace it. Rules:

1. Existing working code, structure, dependencies, schema and API conventions win over this plan's suggestions unless there is a documented technical or product reason.
2. Greenfield is a last resort, used only if the repo is shown to be fundamentally unusable (criteria in §1.3), with the evidence written down and approved first.
3. No destructive change (deletes, schema drops, mass renames, framework swaps) before the repo analysis in §1 is complete and signed off.
4. Phase 1 does not begin until the repo is analyzed. If the repo cannot be provided, building from scratch requires your explicit go-ahead; I will not start it by default.

### Stitch package contents

| Folder | Maps to |
|---|---|
| `dashboard_ai_resume_intelligence` | Mobile (390px) dashboard — bottom tab bar, "Paste a job. Get a tailored resume." |
| `executive_dashboard_ai_resume_intelligence` | Desktop dashboard (primary reference): sidebar, top bar, tailor-CTA with URL/Paste/Upload tabs, 5 KPI tiles, diagnostics, priority queue, job match table, master completeness, upcoming interview |
| `job_analyzer_ai_resume_intelligence` | Job Analyzer + Job Intelligence (merged on one page in Stitch) |
| `job_match_analysis_ai_resume_intelligence` | Job Match |
| `skill_gap_matrix_ai_resume_intelligence` | Skill Gap Matrix |
| `my_resumes_ai_resume_intelligence` | My Resumes (Master vs Tailored variants) |
| `resume_intelligence_ai_resume_intelligence` | Resume Analysis (7-vector audit, recommendations, section health) |
| `tailor_resume_ai_resume_intelligence` | Tailor Resume (directive toggles, planned operations, live delta preview) |
| `ai_resume_intelligence_logo` | "ResumeIQ Intelligence" wordmark. **Naming inconsistency flagged:** the screens say "Resume AI" (v3.4 Enterprise), the logo says "ResumeIQ", the brief says "AI Resume Intelligence Platform". None is confirmed as the company-approved name. See §1.4. |
| `professional_headshot_…` | Placeholder persona avatar ("Priya Sharma"). Not for production use. |
| `executive_precision/DESIGN.md` | Design tokens and component rules (colors, Geist/Inter/JetBrains Mono, radii, elevation, breakpoints, diff viewport, score thresholds) |

Screens with **no Stitch reference** (must be designed in the same language): Master Resume Editor, AI Tailoring Progress, Tailored Resume Result, Before/After Comparison, Factual Consistency Check, Resume Builder, Template Library, Mock Interview, Applications, Application Detail, Settings, Notifications, Global Search, auth/onboarding.

### Stitch content that must NOT ship as real data

Several Stitch elements present fabricated or unsourced figures. Under the "no fake functionality" rule they are layout placeholders only:

- "Calibrated against 1,420+ Staff & Principal AI engineer job offers", "Top 8% candidate", "92.4th percentile", "+14.2% benchmark delta" — no benchmark corpus exists.
- "Market Demand Velocity +340% Q/Q", "88% of Staff postings" — no market-data source.
- "SOC2 Type II Vault", "Deterministic Seed", "SHA-256 vector sync", "Model: Claude-3.5-Enterprise / LLaMA-3.3 70B / Mistral-Large-Embed", "Telemetry: Normal" — claims about infrastructure we may not have.
- "Mathematically forbidden from inventing…" / "100% Zero-Hallucination" — cannot be guaranteed. Copy must say what is actually enforced (every change is validated against Master Resume evidence and flagged if unsupported).
- "Priority Skill Gaps / benchmark percentile" widgets: build only from data we compute (the user's own resume vs. the user's own jobs). Benchmarks stay out until a real data source is chosen.
- Salary ranges, "Series F ($14B)", "Level 6": show only when extracted from the job text.
- Visual defects in the Stitch renders: Material-icon ligature text leaking into layout ("URLY_ACTIVITY" overlap on the tailoring screen), clipped labels on mobile, fonts not loading (serif fallback in score numerals). These are export artifacts and will be fixed by bundling fonts/icons.

---

## 1. Current architecture and functionality

### 1.1 Status
**Unknown — repository not yet accessible** (see §0). Nothing in this section may be read as a statement about the existing code. Currently verified reusable assets: the Stitch design language and the product requirements in the brief.

### 1.2 Repository analysis checklist (run before any change; output replaces this section)
Read-only. Findings are recorded here with file paths.

| Area | What to establish |
|---|---|
| Layout | Monorepo vs split; top-level dirs; build tooling; package managers; lockfiles |
| Frontend | Framework/version, router, state/data fetching, styling (Tailwind config, tokens), component library, existing screens vs the 21-screen list, how API calls are made, auth handling, tests |
| Backend | Language/framework, module structure, route/service/repository separation, validation, error format, logging, config/env handling, API versioning |
| Database | Engine, ORM, migrations tool, existing tables vs §5, constraints/indexes, how resumes are stored (JSON blob vs normalized) |
| AI | Existing LLM calls: where, which provider, hardcoded or abstracted, structured-output validation, prompt-injection handling |
| Auth | Existing mechanism, real vs mock, session/token handling, authorization enforcement point |
| Features | Per feature in the brief: working / partial / mocked / absent — **mocked features are flagged, never counted as done** |
| Tests & CI | Test frameworks, coverage of critical paths, CI config, lint/type-check state, does it build and pass today |
| Ops | Dockerfiles, compose, env examples, secrets committed in history |
| Debt & risks | Security issues, dead code, duplicated logic, naming inconsistencies |
| UX concepts | Where Master Resume source-of-truth, Accept/Reject/Edit/Regenerate, evidence/factual-check are implemented, to preserve them |

### 1.3 "Fundamentally unusable" test (the only grounds for greenfield)
Greenfield is considered only if **all of the following** hold and are documented with evidence: it does not build or run after reasonable fixes; **and** its data model or architecture makes the core invariants impossible without rewriting most of it (e.g. no separation between master and tailored resumes with no migration path, authorization enforced only in the client); **and** an incremental refactor was estimated and found costlier than rebuilding. Poor styling, a different-but-workable stack, or missing features do **not** qualify.

### 1.4 Product naming
Use the company-approved product name once confirmed. Until then: do **not** rename anything; keep whatever names the repo uses; centralize the user-visible name in one config constant/i18n key when touched so the eventual change is a single edit; and list every inconsistent occurrence (repo, Stitch screens "Resume AI", logo "ResumeIQ", brief title) in a **Naming Cleanup List** appended to this document after repo analysis.

## 2. Target architecture

*Proposal — to be reconciled with the existing repo (§0 policy). Where the repo already uses a different but workable choice (ORM, queue, UI library), keep it.*

Modular monolith, two deployables plus a worker:

```
Browser (React SPA)
    │  HTTPS, JSON, cookie auth
    ▼
FastAPI app (/api/v1)  ──►  PostgreSQL (primary store)
    │                  ──►  Object storage (original uploads, generated PDFs)
    │                  ──►  LLM provider (behind abstraction)
    ▼
Worker process (same codebase) — long AI/parsing/PDF jobs
```

- **One backend codebase**, internal modules: `auth`, `resumes`, `jobs`, `matching`, `tailoring`, `applications`, `interviews`, `notifications`, `ai`, `storage`.
- **No microservices, no Kafka, no Kubernetes** at this stage.
- **Background work:** start with a Postgres-backed job table (`job_runs`: queued/processing/completed/failed) polled by a worker. Introduce Redis + a queue library only if load or latency measurements justify it. Rationale: avoids a second stateful dependency for a first release; the status contract exposed to the frontend is identical either way.
- **Vector search:** **not included.** Matching can be done with structured skill/requirement comparison plus LLM judgement over bounded text. Embeddings (pgvector inside Postgres, not Qdrant) are considered only if semantic retrieval over large corpora is actually needed. Decision deferred to Phase 4.
- **User model (PENDING — not assumed):** neither multi-tenant organizations nor consumer accounts are assumed, and no organization/business rules are invented. Architecture seam only: all data access goes through repositories that take an `Actor` (user id + opaque `scope` object, empty for now) and apply a single `AccessPolicy` interface. Today the policy is "owner only"; tenant/role rules plug into that one interface later without touching routes or services. User-owned tables carry `owner_id`; **no organization tables or `organization_id` columns are created** until confirmed. Authorization remains server-side in all cases.
- **Provider neutrality:** nothing in the core depends on a specific LLM vendor, email service, object store, cloud, or benchmark source; each sits behind an interface configured by environment (see §6, §7, §9, §13, §14).

## 3. Frontend architecture

React + TypeScript + Vite + Tailwind + React Router. Suggested layout (adapts if the Claude Code frontend is supplied):

```
src/
  app/            router, providers, route guards
  components/ui/  Button, Card, Badge/Pill, ScoreRing, ScoreBar, Tabs, Dialog, Table, Toast, EmptyState, ErrorState, Skeleton
  components/layout/  AppShell, Sidebar, TopBar, MobileTabBar
  components/{resume,job,matching,tailoring,interview,applications}/
  pages/
  services/       typed API clients (resumeService, jobService, matchingService, tailoringService, interviewService, applicationService, authService)
  hooks/          React Query hooks per service
  types/          generated from backend OpenAPI schema
  styles/         tokens.css (from DESIGN.md)
```

- **Server state:** TanStack Query. **UI state:** local component state / small Zustand store only for shell (sidebar, toasts). **Forms:** React Hook Form + Zod.
- **Types:** generate TypeScript types from the FastAPI OpenAPI schema so API drift fails the build.
- **Fonts/icons bundled locally** (Geist, Inter, JetBrains Mono, Material Symbols subset) — no CDN Tailwind, no Google Fonts at runtime.
- **Accessibility:** semantic landmarks, focus rings per DESIGN.md (3px indigo ring), accessible dialogs, keyboard operable diff actions, score meters never color-only (always numeric + label).
- **Responsive:** 1440 / 1280 / 1024 / 768 / 390 / 375. Per DESIGN.md: ≥1280 split workbench; 768–1279 segmented Source/Review switch; <768 bottom task bar (Audit, Tailor, Score, Export). Tables become stacked cards on mobile.

## 4. Backend architecture

FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2.

- Layers: `routes → services → repositories → models`. No business logic in handlers.
- `/api/v1/` versioning; consistent error envelope `{code, message, request_id}`; global exception handler hides internals.
- Config via `pydantic-settings` + `.env.example`.
- Structured JSON logging with request ID middleware; timing middleware; AI-call logging (provider, model, latency, tokens, estimated cost, outcome) **without logging resume/JD text**.
- Pagination, idempotency keys on create-job endpoints.

## 5. Database architecture (PostgreSQL)

Only entities the workflow needs. Initial set:

| Table | Purpose / key constraints |
|---|---|
| `users` | email unique, password hash (argon2), status, timestamps |
| `sessions` / `refresh_tokens` | revocable sessions |
| `resumes` | `kind` ∈ {master, tailored}; owner; tailored rows require `master_resume_id`, `target_job_id`; **exactly one active master per user** (partial unique index) |
| `resume_versions` | immutable snapshots (`version`, `content` JSONB for the document body, `created_by`, `source` ∈ {upload, edit, tailoring}) |
| `resume_sections` / `experiences`, `education`, `projects`, `skills`, `certifications` | Normalized entities with stable IDs so evidence can reference them |
| `resume_files` | original upload: storage key, SHA-256, MIME, size, scan status |
| `jobs` | source (url/paste/upload), raw text, extraction status |
| `job_requirements` | job_id, text, tier ∈ {required, preferred, nice_to_have}, category |
| `job_analyses` | structured analysis output, model/provider metadata |
| `job_matches` | resume_version × job; overall + subscores; method version |
| `match_evidence` | requirement ↔ resume entity ↔ status (strong/partial/missing) + rationale |
| `skill_gaps` | severity ∈ {critical, high, medium, low}, required level, current evidence, recommendation |
| `tailoring_sessions` | master version, job, status, directives, resulting tailored resume id |
| `tailoring_changes` | original, proposed, reason, requirement_id, evidence refs, validation ∈ {verified, needs_review, unsupported}, user_action ∈ {pending, accepted, rejected, edited}, final_text |
| `factual_checks` | per-claim result and evidence pointer |
| `applications`, `application_events` | company, role, URL, resume version, scores, status, interview status, notes |
| `interview_sessions`, `interview_questions`, `interview_answers` | prep and mock flows |
| `notifications` | user-scoped |
| `job_runs` | background job status |
| `ai_calls` | observability (no content) |
| `audit_logs` | security-relevant actions |

Rules: UUID PKs, FKs with explicit `ON DELETE`, `created_at/updated_at`, indexes on every FK and filter column, CHECK constraints on enums/score ranges (0–100), Alembic migrations only. JSONB is used for the resume document *snapshot* and AI payloads, never as the whole application state.

**Master-protection invariant:** tailoring writes only to `tailoring_*` tables and new `resumes(kind=tailored)` rows. Services touching master content require an explicit user edit path; there is a DB-level test that a tailoring session leaves the master's version rows unchanged.

## 6. AI architecture

- Interfaces: `LLMProvider`, `EmbeddingProvider` (optional), `ResumeParser`, `JobAnalyzer`, `ResumeMatcher`, `ResumeTailor`, `FactualConsistencyChecker`, `InterviewGenerator`.
- **Provider is unselected (PENDING); nothing vendor-specific is hardcoded** — no vendor SDK imports outside `ai/providers/<name>.py`, no vendor/model names in prompts, services, schemas, UI copy, or docs. Configuration: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` (env only), plus timeouts/retries/token limits. `LLMProvider` contract: `generate_structured(schema, messages, **opts) -> (parsed_model, usage)`, with a capability descriptor (structured output / JSON mode / max context) so services adapt rather than assume. A provider registry resolves the configured name; the first real adapter is written only when the company names its provider. Until then an "AI not configured" state is shown (`AI_PROVIDER_NOT_CONFIGURED`), AI-dependent actions are disabled with an explanation, and **no stub/fake output is ever presented as a result**. A test-only fake provider lives under `tests/` for automated tests and is not importable in production config.
- **Stitch copy that names models** (e.g. "LLaMA-3.3", "Mistral-Large-Embed") is replaced by values read from `ai_calls` metadata at runtime.
- **Structured output + validation:** every AI step returns a Pydantic model (`JobAnalysis`, `MatchAnalysis`, `SkillGapAnalysis`, `TailoringPlan`, `TailoringChange`, `FactualCheck`, `InterviewQuestion`). Invalid output → bounded retry → fail safely, logged, no partial writes (single transaction).
- **Prompt-injection posture:** resume/JD text is passed only in clearly delimited data fields; system instructions never concatenate user text; outputs are schema-validated; tool use disabled for these steps.
- **Factual consistency (core requirement), two layers:**
  1. *Deterministic checks* (code, not LLM): proposed text may only reference employers, titles, dates, degrees, certifications, technologies and numbers that exist in the master's structured entities; any numeric/metric token absent from the master is flagged `unsupported`/`needs_review`.
  2. *LLM entailment check* producing per-claim evidence pointers to master entity IDs.
  A change is `verified` only if both layers pass. `unsupported` changes cannot be accepted without an explicit user edit; accepting a `needs_review` item requires a deliberate confirm.
- **Scoring:** match and ATS scores are computed from explicit, versioned rules over extracted requirements (weights stored with `method_version`), with LLM used for extraction/judgement inputs, not for inventing the number. Subscores map to the brief: Skills, Experience, Keywords, Projects, Education, ATS. Scoring weights are an *engineering default* and are flagged as a product decision to be reviewed (Decision Register D-11).
- **Benchmark / market data (PENDING, source not approved):** no benchmark datasets, percentiles, market-demand figures or "calibrated against N postings" claims are created or displayed. Architecture only: a `BenchmarkProvider` interface (`get_percentile(metric, value, segment)`, `get_skill_demand(skill, segment)`) with provenance fields (`source_name`, `as_of`, `sample_size`, `license`). The default registry entry is `NullBenchmarkProvider`, which returns "unavailable". UI components for percentile/market panels render **only** when a provider returns data with provenance; otherwise they are hidden (not shown with fake numbers). All current Stitch benchmark panels are therefore out of scope until a source is approved.
- Cost/latency tracked per call in `ai_calls`.

## 7. Authentication and authorization

First: reuse whatever real authentication the repo already has (§1.2); replace only if it is mock/insecure, and say so. Mock auth is never kept for production paths.

Baseline if none exists (assumption, low-risk, easily swapped): server-side authentication behind an `AuthBackend` interface — registration, login/logout, argon2 password hashing, HttpOnly + Secure + SameSite cookie sessions with CSRF protection, rate limiting on auth routes. SSO/OIDC can be added as another `AuthBackend` if the company's user model requires it (PENDING, D-04). Authorization is enforced server-side through the single `AccessPolicy` seam (§2); IDOR tests for every resource.

**Email (PENDING provider, D-07):** an `EmailSender` interface (`send(to, template, context)`) with config-selected implementations: `ConsoleEmailSender` (dev only, logs to stdout, refuses to run when `APP_ENV=production`) and a `NotConfiguredEmailSender` that raises `EMAIL_NOT_CONFIGURED`. Features that need email (verification, password reset, notifications by mail) are feature-flagged: when email is unconfigured they are **hidden or disabled with explanation, not faked**. Email is *not* required for core workflows; in-app notifications are independent of it.

## 8. Security

- Upload pipeline: extension + MIME + magic-byte check, size cap, filename sanitization (storage key is server-generated), PDF/DOCX parsed in a sandboxed worker with timeouts and page/size limits, reject encrypted/macro-enabled files, optional AV scan hook.
- Job URL fetching: SSRF protection (block private/link-local ranges, redirects re-validated, size/time limits), robots/ToS-aware adapters.
- XSS: React escaping, no `dangerouslySetInnerHTML` for resume/JD text; CSP headers.
- SQL injection: ORM only, parameterized.
- Secrets in env only; `.env.example`; secret scanning in CI.
- Logs exclude resume/JD content and tokens.
- Dependency audit in CI.

## 9. Storage

`StorageBackend` interface (`put/get/delete/exists`, streaming) selected by config, with a local-filesystem implementation (dev, and single-host deploys) and an S3-*compatible-API* implementation that takes endpoint/credentials from env — written against the generic protocol, not a specific cloud. Original uploads and generated PDFs only; private by default; downloads go through authenticated endpoints (short-lived signed URLs only if the chosen backend supports them). **Retention/deletion rules for stored files are PENDING (D-08)**; see §13.1.

## 10. API design (`/api/v1`)

```
POST /auth/register | /auth/login | /auth/logout | /auth/password-reset ...
GET/POST /resumes        GET/PATCH /resumes/{id}        GET /resumes/{id}/versions
POST /resumes/upload  → job_run id     GET /resumes/{id}/analysis
POST /jobs/analyze (url | text | file) → job_run id    GET /jobs/{id}    GET /jobs
POST /jobs/{id}/match    GET /matches/{id}    GET /matches/{id}/skill-gaps
POST /tailoring          GET /tailoring/{id}
PATCH /tailoring/{id}/changes/{change_id}   (accept|reject|edit)
POST  /tailoring/{id}/changes/{change_id}/regenerate
POST  /tailoring/{id}/finalize → tailored resume
GET /resumes/{id}/export?format=pdf
POST/GET/PATCH /applications     POST/GET /interviews   POST /interviews/{id}/answers
GET /job-runs/{id}   GET /notifications   GET /search?q=
```

Long operations return `202` + `job_run` id with `queued|processing|completed|failed`; the frontend polls (SSE only if polling proves insufficient).

Error example: `{"code":"JOB_EXTRACTION_FAILED","message":"We could not extract this job posting.","request_id":"…"}` with UI fallback "Paste the job description instead."

## 11. Job URL strategy

**Decision (company direction):** LinkedIn, Naukri and Indeed scraping is **not implemented** unless explicitly approved (D-05). Supported now: **(a) pasted job description, (b) uploaded JD file (PDF/DOCX/TXT)**, and any **officially approved** source the company names later.

Architecture: `JobSourceAdapter` interface — `matches(url) -> bool`, `fetch(url) -> RawJobContent | ExtractionFailure`, with a `source_id`, `status` ∈ {approved, disabled} and a `compliance_note` (who approved, on what basis). Adapters are registered in config, **disabled by default**; the registry ships with only `ManualPasteAdapter` and `FileUploadAdapter`. A URL submitted for an unregistered/unapproved host returns `JOB_SOURCE_NOT_SUPPORTED` and the UI shows: *"Unable to extract this job posting. Paste the job description instead."* with the paste tab pre-selected. Adding an approved source = one new adapter file + config entry + tests; no change to the analysis pipeline, which only consumes `RawJobContent`.

Any future adapter that makes outbound requests must pass the SSRF guard (§8) and respect the source's terms. Extraction failure never fabricates job data. Stitch's "Verified gateways: LinkedIn/Greenhouse/Lever/Workday/Indeed/Naukri" chips are **removed** until a source is approved and working; the UI lists only registered, enabled adapters.

## 12. Testing strategy

- Backend: pytest — unit (scoring, validators, factual rules), API tests, DB tests against real Postgres (testcontainers/CI service), **authorization/IDOR tests**, AI-service tests with recorded/mocked provider responses including malformed output and prompt-injection fixtures.
- Frontend: Vitest + Testing Library for components; Playwright for E2E.
- Required E2E/critical paths: register/login → upload resume → parse review → save master → analyze job → match → tailor → factual validation → accept/reject/edit → tailored resume → create application.
- Invariant tests: master never mutated by tailoring; unsupported claims cannot reach a finalized resume without user action.
- Coverage gates on services/validators, not a vanity global number.

## 13. CI/CD and deployment

- GitHub Actions: install, lint (ruff, eslint), type check (mypy/pyright, tsc), tests (with Postgres service), build, OpenAPI-types drift check, dependency audit.
- **Provider-neutral deployment (target PENDING, D-06):** OCI container images (`backend`, `worker`, `frontend` static build) plus a `docker-compose.yml` for local/dev. Twelve-factor configuration: everything via environment variables documented in `.env.example`; no cloud-specific SDKs, managed-service names, IaC, or CI deploy steps in the repo. Health/liveness/readiness endpoints; migrations run as an explicit separate command; logs to stdout in JSON; stateless app processes (state only in Postgres + `StorageBackend`). `docs/DEPLOYMENT.md` states the contract (required env vars, ports, volumes, migration step) so any target can be mapped to it once chosen. CI builds and tests images but does **not** deploy.

### 13.1 Data retention (PENDING — no policy invented)
No retention periods, auto-deletion jobs, or "we keep data for N days" copy are implemented or shown. Engineering groundwork that is policy-neutral: every resume/job/file row has `created_at` and `deleted_at` (soft-delete) columns; a user-initiated delete endpoint exists (hard-delete of owned data incl. stored files, cascading, with audit entry); `audit_logs` and `ai_calls` store no resume/JD content. A `RetentionPolicy` config object exists but defaults to **"no automatic deletion"**. Required decision inputs from the company are listed in D-08 (retention periods per data class, deletion SLAs, backups, legal/regulatory scope, user export rights).

## 14. Stitch screen mapping and reusable components

| Required screen | Stitch reference | Notes |
|---|---|---|
| Dashboard | `executive_dashboard` (desktop), `dashboard` (mobile) | Keep: tailor CTA with 3 input tabs + manual fallback, KPI row, diagnostics, action queue, pipeline table. Drop: benchmark percentile, market claims. Mobile uses bottom tab bar. |
| My Resumes | `my_resumes` | Master card clearly distinct from tailored variant cards. |
| Resume Analysis | `resume_intelligence` | Real section scores + actionable recommendations; recommendation card = same before/after diff component. |
| Master Resume Editor | none | New; section editor + version history. |
| Job Analyzer / Job Intelligence | `job_analyzer` | Split into input state and analysis result; required/preferred/nice-to-have separation. |
| Job Match | `job_match_analysis` | Subscores + strong/partial/missing with rationale and evidence. |
| Skill Gap Matrix | `skill_gap_matrix` | Four severities; remove market-velocity panels unless real data. "Ethical upskilling roadmap" kept as recommendations. |
| Tailor Resume | `tailor_resume` | Directive toggles; the locked "Add unverified experience" row is a good pattern to keep. |
| AI Tailoring Progress | none | Status stepper driven by `job_runs`. |
| Before/After, Factual Check, Tailored Result | design language of `resume_intelligence` diff cards + DESIGN.md split-diff | Highest-value new design; will be built first and reviewed. |
| Resume Builder, Templates | none | After Phase 6. |
| Interview Prep, Mock Interview | partial (dashboard "Upcoming interview" card) | New. |
| Applications / Detail | partial (pipeline table) | New. |
| Settings, Notifications, Search | topbar search/bell only | New. |

**Reusable components extracted from Stitch:** `AppShell` (sidebar + topbar + mobile tab bar), `ScoreRing`, `ScoreBar` (threshold colors: <60 rose, 60–79 amber, ≥80 emerald, always with numeric), `StatTile`, `Pill` (matched/missing/neutral, mono 11px), `DiffPane` (deletion rose / addition emerald), `ChangeCard` (before/after/why/requirement/evidence/status + Accept/Reject/Edit/Regenerate/Explain), `RequirementRow`, `GapRow`, `EmptyState`, `ErrorState`, `JobInputTabs`, `ResumeCard` (master/tailored variants), `ProgressStepper`.

**Design system:** tokens from `DESIGN.md` into Tailwind theme (surface/primary/semantic colors, Geist/Inter/JetBrains Mono with `tnum`, 8/12/16px radii, 4-level elevation, hairline borders). The Claude-derived UX concepts (master source of truth, separate versions, evidence-based changes) layer onto this language rather than adding a second visual style.

## 15. Implementation phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 Repo analysis (read-only) | Complete §1.2 against the existing repository; replace §1 with findings; reconcile §2–§14 with reality; produce Naming Cleanup List and a feature status table (working / partial / mocked / absent); get sign-off | Written findings approved; **no files changed** |
| 1 Foundation | *Adapt the existing repo* (don't scaffold new): add missing config/`.env.example`, provider-neutral Docker, design tokens + base UI kit mapped onto existing components, AppShell/navigation/responsive, DB migrations for missing tables only, auth hardening (or implementation if mock), `AccessPolicy`/provider interfaces (`LLMProvider`, `EmailSender`, `StorageBackend`, `JobSourceAdapter`, `BenchmarkProvider`), error/logging middleware, CI | Existing tests still pass; auth E2E passes; shell renders at all six widths; CI green |
| 2 Master Resume | Upload → validate → store → extract → parse (needs AI provider) → review → save master; editor; versioning; My Resumes | Parse low-confidence banner works; master versions immutable |
| 3 Job Intelligence | Paste/upload/URL (supported adapters) → structured analysis → requirements | Extraction failure shows paste fallback |
| 4 Matching | Scores, subscores, evidence, skill gaps | Scores reproducible; evidence links resolve |
| 5 Tailoring | Plan, changes, two-layer validation, review UI, tailored version creation | Master-unchanged invariant test; unsupported cannot be silently accepted |
| 6 Output | ATS analysis of tailored resume, templates, PDF | Downloaded PDF text-extractable |
| 7 Applications | Tracking, detail, notifications | CRUD + authorization tests |
| 8 Interview | Prep, mock interview, evaluation | Uses JD + tailored resume + gaps |
| 9 Hardening | Security review, performance, observability, deploy docs | Checklist signed off |

Documentation (`docs/ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `AI_ARCHITECTURE.md`, `SECURITY.md`, `DEPLOYMENT.md`, `DESIGN_SYSTEM.md`, `USER_FLOWS.md`) is written alongside each phase and only describes what exists.

## 16. Working assumptions (low-risk; design proceeds on these)

| # | Assumption | Revisit when |
|---|---|---|
| A1 | The company's existing repository is the base; this plan adapts to it (§0). | Repo analysis done |
| A2 | Existing product names are kept as-is; user-visible name centralized in one constant when touched. | D-02 answered |
| A3 | Owner-scoped data access behind a single `AccessPolicy`; no organization tables. | D-04 answered |
| A4 | Authentication is real and server-side; mechanism = existing if sound, else email/password behind `AuthBackend`. | Repo analysis / D-04 |
| A5 | PDF and DOCX resume uploads; plain text, PDF, DOCX job-description uploads; PDF resume output. | Product confirms formats |
| A6 | Postgres-backed job queue first; Redis only on measured need. If the repo already has a queue, keep it. | Load data |
| A7 | No vector database; embeddings only if retrieval need is demonstrated. | Phase 4 |
| A8 | Local-disk storage by default behind `StorageBackend`; S3-compatible adapter generic. | D-06 |
| A9 | Scoring weights are engineering defaults, versioned, explainable, and reviewable. | D-11 |
| A10 | Stitch is a visual reference only; its sample data and claims are never shipped. | — |

## 17. Risks

| Risk | Mitigation |
|---|---|
| Repo not yet accessible → this plan may conflict with real code | Reuse-first policy; no code changes before §1.2 analysis; plan sections explicitly marked "proposal" |
| No LLM provider chosen → AI features cannot be verified against a real model | Provider interface + config; fake provider in tests only; AI-unconfigured UI state; real adapter after D-03 |
| Job-source legal/technical blocks | Manual paste/upload only until a source is approved; adapter architecture ready |
| Resume parsing accuracy on PDF layouts | Mandatory user review step, confidence flags, golden-file tests |
| Overclaiming "zero hallucination" | Honest copy; two-layer validation; user approval gate |
| Score credibility without benchmarks | Own-data scoring only; `NullBenchmarkProvider`; versioned method |
| PII in resumes with undefined retention | Minimal logging, user-initiated delete, no auto-deletion until policy approved (D-08) |
| Stitch placeholder data leaking into UI | §0 "must NOT ship" list is a review checklist per screen |
| Inconsistent product naming shipped to users | Naming Cleanup List (§1.4); single constant for visible name |
| Scope growth (21 screens) | Phase gates; reuse existing screens; build the review/diff/factual-check flow first |

## 18. Decision Register (company-dependent; none blocks the architecture)

| ID | Decision | Status | Working assumption in this plan | Needed by |
|---|---|---|---|---|
| D-01 | Repository access (GitHub `owner/repo`, zip, or linked computer) | **Pending — blocks repo analysis and Phase 1** | None; no code is written without it | Before Phase 1 |
| D-02 | Official product name | **Pending** | Keep existing names; flag inconsistencies | Before public release |
| D-03 | LLM provider / model(s) / key ownership / budget | **Decided 2026-10-12: OpenAI** (model, key ownership and budget still open) | Provider-neutral interface; "AI not configured" state | Phase 2 verification |
| D-04 | User model: single-org users, multi-tenant orgs, or consumer accounts; roles; SSO | **Pending** | Owner-scoped via `AccessPolicy` seam; no org tables | Before any sharing/team feature |
| D-05 | Approved job sources (any scraping/API/partner access) | **Pending** | Manual paste + file upload only | Phase 3 extension |
| D-06 | Deployment target, hosting, object storage | **Pending** | Provider-neutral containers + env config | Phase 9 |
| D-07 | Email provider (verification, reset, notifications) | **Pending** | `EmailSender` boundary; email-dependent features disabled when unconfigured | Phase 1 (if auth needs it) |
| D-08 | Data retention, deletion SLAs, backups, privacy/regulatory scope, user export | **Pending — no policy invented** | No auto-deletion; user-initiated delete only | Before production launch |
| D-09 | Benchmark / market-data source | **Pending — source not approved** | `BenchmarkProvider` interface + `NullBenchmarkProvider`; panels hidden | When a source exists |
| D-10 | PDF resume templates (company-mandated or free design) | **Pending** | Small set of ATS-safe templates built in Phase 6 | Phase 6 |
| D-11 | Scoring weights/method sign-off | **Pending review** | Engineering defaults, versioned | Phase 4 |

Updating rule: when a decision is answered, its row changes to **Decided** with date and approver, and the matching assumption in §16 is removed.
