# Roadmap

Scope per phase. Status, exit checks and verification notes live in [`../PHASES.md`](../PHASES.md);
the original architecture proposal is `PRODUCTION_IMPLEMENTATION_PLAN.md`. Updated 2026-10-16.
Rule: no phase starts until the previous one is stable (tests, lint, types, build, startup).

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Repo structure, backend/frontend foundation, Postgres + migrations, config, auth, app shell, design system, UI kit, logging, errors, health checks, test foundation, Docker dev env, CI | Done |
| 2 Master Resume | Upload, PDF/DOCX parsing, structured resume, Master Resume, editor, versioning, resume analysis, My Resumes | Done |
| 3 Job Intelligence | Paste JD, upload JD, job parsing and analysis, requirements, `JobSourceAdapter` seam (no source approved yet, D-05) | Done |
| 4 Matching | Resume-to-job match, scores and subscores, evidence, skill gaps | Done |
| 5 AI Tailoring | Tailoring plan, provider adapter, evidence mapping, factual consistency check, before/after review, tailored versions, master never mutated | Done |
| 6 Resume Output | ATS analysis, templates, PDF generation, download | Done |
| 7 Applications | Tracker, detail, status, notifications | Done |
| 8 Interview | Prep, question bank, practice sessions, answer evaluation | Done |
| 9 Hardening | Security review, performance, observability, deployment docs, backup/recovery | Done |
| 10 AI usage | Per-user AI limits and usage tracking | Done |
| 11 AI resume import | LLM-assisted parsing, deterministic fallback | Done |
| 12 AI job analysis | LLM-assisted requirement extraction, deterministic fallback | Done |
| 13 AI interview questions | LLM-generated questions, question bank fallback | Done |
| 14 Account settings | Profile, password change, user-initiated account delete | Done |
| 15 Email & password reset | `EmailSender` over generic SMTP, reset flow | Done |
| 16 S3 storage | S3-compatible storage adapter | Done |
| 17 Quick builder & product page | Guided resume builder, more templates, public product page | Done |
| 18 Pricing & Pro waitlist | Public pricing page, Pro waitlist (no payments) | Done |
| 19 Vivid redesign | New tokens, fonts and motion; landing, dashboard, match, builder and pricing restyled | Done |
| 20 Billing (Razorpay) | Pro subscriptions in INR (UPI, cards), webhooks, plan limits; test mode first | Built; test-mode payment check pending |

## Next candidates (each needs a decision first)
- Job fetching from approved sources (D-05).
- Production deployment (D-06) and data retention policy (D-08).

## Pending company decisions (not invented; each has a configuration boundary)
| ID | Decision | Needed by |
|---|---|---|
| D-02 | Official product name | Before public release |
| D-03 | LLM provider: decided (Groq, OpenAI also supported); model, key ownership, budget still open | Turning AI on in production |
| D-04 | User/organization model, roles, SSO | Before any sharing/team feature |
| D-05 | Approved job sources | Job fetching |
| D-06 | Deployment target, hosting, object storage | Production launch |
| D-07 | Email provider (any SMTP provider works by configuration) | Production launch |
| D-08 | Data retention, deletion SLAs, privacy scope | Before production launch |
| D-09 | Benchmark / market data source | When a source exists |
| D-10 | PDF resume templates (six ATS-safe templates built; final sign-off open) | Before public release |
| D-11 | Scoring weights sign-off | Before public release |
| — | Payment provider: decided 2026-10-16, Razorpay. Tax (GST) and invoicing still open (prices: Free, Pro ₹299/month or ₹2,499/year) | Going live with billing |

D-01 (repository) is resolved: greenfield.
