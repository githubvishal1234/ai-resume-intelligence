# Design system

The tokens come from the Stitch "Executive Precision" reference. They are defined as a Tailwind
4 `@theme` in `frontend/src/styles/index.css`. Token names mirror the Stitch class names
(`bg-surface`, `text-on-surface`, ...), so every screen can be traced back to the reference.

## Foundations
- **Color:** tonal surfaces (`surface`, `surface-container-*`), with an indigo primary
  (`#4f46e5`). Each semantic status color has foreground, surface, border and ink variants:
  success, warning, critical and info.
- **Type:** Inter for UI, Geist for display, JetBrains Mono for numbers and tokens. All fonts
  are bundled locally through Fontsource. Scale tokens: `display-lg`, `headline-lg|md|sm`,
  `body-lg|md|sm`, `label-md|sm`, `code-sm`. Quantitative readouts use `.tnum`.
- **Shape:** controls have an 8px radius (`rounded-control`), cards 12px (`rounded-card`) and
  panels 16px. Pills are fully rounded.
- **Elevation:** hairline borders plus light shadows `shadow-level-1..3`. Focus shows a
  visible ring.

- **Dark mode:** follows the operating system (`prefers-color-scheme`). Every token is redefined
  in `index.css`; components need no dark-specific classes. In dark mode the primary is a light
  indigo with dark text on it, so buttons and links keep at least 4.5:1 contrast.
- **Photos:** seven Unsplash photos are bundled in `src/assets/images/` (credits in
  `CREDITS.md`) and exported from `constants/images.ts`. They are decorative (empty `alt`).
  Text over a photo uses the fixed `ink-deep` overlay and `on-ink` text tokens, which do not
  change with the theme.
- **Motion:** `animate-rise` (a 0.45 s fade-up) on photo banners, the sign-in form and the
  dashboard cards. It is switched off under `prefers-reduced-motion`.

## Score thresholds
Scores below 60 are **critical** (rose), 60–79 **warning** (amber), and 80 or above
**success** (emerald). A score is never shown by color alone: the number and a text label
("Needs attention", "Moderate", "Strong") always appear with it.

## Components (`components/ui`)
| Component | Notes |
|---|---|
| `Button` / `ButtonLink` | `primary`, `secondary`, `destructive` and `ghost` variants. `disabledReason` keeps the button focusable and exposes why it is disabled. |
| `Card`, `CardHeader` | The section container |
| `Field`, `Input`, `Textarea` | Label, hint and error wiring through `aria-describedby` |
| `Notice` | info / warning / critical / success. Warning and critical use `role="alert"`. |
| `Pill` | Status and keyword tokens (mono, 11px) |
| `ScoreRing`, `ScoreBar` | Accessible gauges (`role="img"` / `role="meter"`) |
| `StatTile` | KPI tile |
| `EmptyState`, `ErrorState`, `Skeleton`, `PageLoading` | Data states. `ErrorState` shows the request id. |
| `Tabs` | Roving tabindex, arrow/Home/End keys |
| `PhotoBanner` | Page title over a photo. Used by `PageHeader` when it gets a `photo` (section landing pages) and by the dashboard. |
| `ResumePaper` (`components/resume`) | An A4 page preview of a resume in a template. Sizes use container query units, so it scales to any width without JavaScript. It is paper, not UI: white with dark text in both themes. |
| `TemplatePicker` (`components/resume`) | Radio group of templates, each a live `ResumePaper`. Used by the quick builder and the Resume Builder. |

## Resume templates
The PDF templates live in `backend/app/output/templates.py`; the preview copies their values in
`frontend/src/constants/templates.ts`. When a template is added or changed, update both.
All are single column with title-case standard headings (the ATS check relies on them).

| Template | Type | Header | Headings |
|---|---|---|---|
| Classic | Sans | Left | Navy, ruled |
| Modern | Sans | Left, large name | Indigo, ruled |
| Executive | Serif | Centred | Navy, ruled |
| Minimal | Sans | Centred, wide margins | Grey, no rule |
| Compact | Sans | Left, tight spacing | Black, no rule |
| Serif | Serif | Left | Black, ruled |

## Pages with photos
| Page | Photo |
|---|---|
| Product page (`/welcome`) | `register` (hero), `jobs`, `applications` |
| Sign in, Forgot / Reset password | `signin` (split screen, shown from 1024px) |
| Register | `register` |
| Dashboard | `dashboard` |
| My Resumes | `resumes` |
| Job Analyzer, Job Match, Skill Gap Matrix | `jobs` |
| Tailor Resume | `register` |
| Applications | `applications` |
| Interview Prep | `interview` |

## Layout
- **≥ 1024px:** a fixed 256px sidebar.
- **< 1024px:** a modal drawer, built on a native `<dialog>`.
- **< 768px:** a bottom tab bar with five destinations.
- Screens that are not built yet appear as disabled navigation items tagged with their phase.
