# Design system

The look is **Vivid** (Phase 19): a bright blue brand, a yellow highlight, soft-blue surfaces,
large rounded cards and light motion. It was designed on the "Resume Intelligence Redesign"
Claude Design canvas. The tokens are a Tailwind 4 `@theme` in `frontend/src/styles/index.css`.
Token names are kept from the earlier Stitch-based system (`bg-surface`, `text-on-surface`, ...),
so screens restyle by changing values, not class names.

## Foundations
- **Color:** soft-blue tonal surfaces (`surface` `#f3f5ff`, `surface-container-*`) under white
  cards, ink text `#0e1530`, a blue primary (`#2a4bf2`, 6.2:1 with white) and a yellow `accent`
  (`#ffc542`, always with dark `on-accent` text). Each semantic status color has foreground,
  surface, border and ink variants: success, warning, critical and info.
- **Fixed colors:** `band` (the brand blue) and `ink-deep` (navy) do not change with the theme,
  so white `on-ink` text on them keeps its contrast. Page header bands, the Pro plan card and
  the dark landing sections use them. `on-ink-success` is the fixed green for success text on
  `ink-deep`; the themed `success-*` tokens turn dark in dark mode and fail there.
- **Type:** DM Sans for UI, Sora for display (headings use weight 700–800 and tight tracking),
  JetBrains Mono for code-like readouts. All fonts are bundled locally through Fontsource, so
  the CSP stays same-origin. Scale tokens: `display-lg`, `headline-lg|md|sm`, `body-lg|md|sm`,
  `label-md|sm`, `code-sm`. Quantitative readouts use `.tnum`.
- **Shape:** controls 12px (`rounded-control`), cards 24px (`rounded-card`), panels 28px
  (`rounded-panel`). Pills are fully rounded.
- **Elevation:** soft, wide, low-opacity shadows (`shadow-level-1..3`) and `shadow-brand` (a
  blue glow under primary buttons and the active nav item). Focus shows a visible ring.
- **Dark mode:** follows the operating system (`prefers-color-scheme`). Every token is redefined
  in `index.css`; components need no dark-specific classes. In dark mode the primary is a light
  blue with dark text on it, so buttons and links keep at least 4.5:1 contrast.
- **Photos:** seven Unsplash photos are bundled in `src/assets/images/` (credits in
  `CREDITS.md`) and exported from `constants/images.ts`. They are decorative (empty `alt`).
- **Motion:** `animate-rise` (fade-up on page headers, cards and plans), `animate-float` /
  `animate-float-slow` (the floating hero cards and the header photo), `animate-fill` (bars grow
  in), `animate-pop` (a changed price or tailoring view), `animate-spin-slow` (dashed decorative
  rings), `animate-marquee` (the fields strip) and the `lift` utility (cards rise on hover).
  Scores count up through `useCountUp` (in `ScoreRing`); screen readers get the final value.
  Under `prefers-reduced-motion` every animation and transition is off and counts show their
  final value at once.
- **On the band:** inside `PhotoBanner` actions and the Pro card, primary buttons turn white and
  secondary ones outlined (child selectors in those components), because a blue button on the
  blue band would disappear.

## Score thresholds
Scores below 60 are **critical** (red), 60–79 **warning** (amber), and 80 or above
**success** (green). A score is never shown by color alone: the number and a text label
("Needs attention", "Moderate", "Strong") always appear with it.

## Components (`components/ui`)
| Component | Notes |
|---|---|
| `Button` / `ButtonLink` | `primary`, `secondary`, `destructive` and `ghost` variants. `disabledReason` keeps the button focusable and exposes why it is disabled. |
| `Card`, `CardHeader` | The section container |
| `Field`, `Input`, `Textarea` | Label, hint and error wiring through `aria-describedby` |
| `Notice` | info / warning / critical / success. Warning and critical use `role="alert"`. |
| `Pill` | Status and keyword tokens (mono, 11px) |
| `ScoreRing`, `ScoreBar` | Accessible gauges (`role="img"` / `role="meter"`). The ring counts up, the bar fills in. |
| `StatTile` | KPI tile |
| `EmptyState`, `ErrorState`, `Skeleton`, `PageLoading` | Data states. `ErrorState` shows the request id. |
| `Tabs` | Roving tabindex, arrow/Home/End keys |
| `PhotoBanner` | Page title on the blue `band` with the section's photo framed on the right (md and up). Used by `PageHeader` when it gets a `photo` (section landing pages) and by the dashboard. |
| `ResumePaper` (`components/resume`) | An A4 page preview of a resume in a template. Sizes use container query units, so it scales to any width without JavaScript. It is paper, not UI: white with dark text in both themes. |
| `TemplatePicker` (`components/resume`) | Radio group of templates, each a live `ResumePaper`. Used by the quick builder and the Resume Builder. |

## Resume templates
There are **80 templates**: 78 resumes and 2 CVs. The PDF templates live in
`backend/app/output/templates.py`; the preview copies their values in
`frontend/src/constants/templates.ts`. When a template is added or changed, update both. Every
template is real, selectable text with title-case standard headings in a fixed reading order (the
ATS check relies on them). The public gallery is `/templates`, filtered by style, layout, photo,
colour, font and header.

### The six originals
| Template | Type | Header | Headings |
|---|---|---|---|
| Classic | Sans | Left | Navy, ruled |
| Modern | Sans | Left, large name | Indigo, ruled |
| Executive | Serif | Centred | Navy, ruled |
| Minimal | Sans | Centred, wide margins | Grey, no rule |
| Compact | Sans | Left, tight spacing | Black, no rule |
| Serif | Serif | Left | Black, ruled |

The two CV templates (Academic CV, Professional CV) lead with education and keep every section.

### Designs in six colours
Each design below comes in navy, teal, burgundy, forest, plum and charcoal (`PALETTES`), so ids
are `<design>-<palette>`, e.g. `banner-teal`. 12 designs × 6 = 72 templates. Every palette keeps
white text above 4.5:1, which a test checks.

| Design | Layout | Header | What sets it apart |
|---|---|---|---|
| Banner | One column | Name and contact on a solid colour band | Ruled headings |
| Stripe | One column | Plain, accent stripe down the left edge | Colour headings |
| Ribbon | One column | Plain | Headings on a light tint of the accent |
| Elegant | One column | Centred, serif | Tinted heading ribbons |
| Statement | One column | Serif name on a colour band, centred | Ruled serif headings |
| Split | One column | Name left, contact stacked right | Dates right-aligned |
| Monogram | One column | Initials in an accent square, serif | Dates right-aligned |
| Ledger | One column | Plain, compact | Dates right-aligned, skills in a 3-column grid |
| Portrait | One column | Photo beside the name | Ruled headings |
| Sidebar | Sidebar | Name and contact at the top of a solid colour sidebar | Skills, certifications and education in the sidebar |
| Portfolio | Sidebar | Photo, name and contact in a tinted sidebar | As Sidebar, with dark text |
| Timeline | Timeline | Plain | Roles and education with dates in a gutter beside an accent line; skills grid |

### Layouts and reading order
- **One column:** sections in `RESUME_ORDER` (or `CV_ORDER`).
- **Sidebar:** the PDF fills the sidebar frame first, then the main column (`SIDEBAR_ORDER`:
  skills, certifications, education, then summary, experience, projects). Extracted text reads
  sidebar then main, and the ATS heading-order check uses that order. Page 2 onward continues
  the main column only. The preview mirrors this with a CSS grid.
- **Timeline:** each role and education entry is a two-cell row, dates then content, so text
  still reads dates, title, bullets.

### ATS labels
| Label | Templates | Meaning |
|---|---|---|
| ATS-safe | All one-column layouts | One column of text; the safest for any screening system |
| ATS-friendly | Sidebar, Portfolio, Timeline | Read in a fixed order, but some older parsers handle columns and tables less well |

`atsLevel()` in `constants/templates.ts` derives the label from the layout. It shows on gallery
cards, and the template picker shows a notice when an ATS-friendly design is chosen. The ATS check
adds a `layout.columns` warning for sidebar and timeline layouts.

### Photos
Portrait and Portfolio show the user's profile photo, which is optional: one photo per account,
uploaded in Settings or inline in the template picker when a photo template is chosen. Uploads are
re-encoded as a 600 px square JPEG with no metadata and drawn round in the PDF. Without a photo the
PDF simply has none; previews show initials instead. The ATS check adds a `photo.included` warning
when a photo is in the PDF.

### Not offered
No skill bars or proficiency ratings: they would show levels a resume doesn't contain.

## Pages with photos
| Page | Photo |
|---|---|
| Product page (`/welcome`) | `interview` (hero, with floating example cards) |
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
