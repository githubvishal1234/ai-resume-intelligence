# Design system

The look is **Ink & Emerald**: stone neutrals, one emerald brand colour, amber used sparingly as a
highlight, crisp cards with hairline borders, and dark "ink" panels with a faint grid on the
product page. The tokens are a Tailwind 4 `@theme` in `frontend/src/styles/index.css`. Token names
are kept from the earlier systems (`bg-surface`, `text-on-surface`, ...), so screens restyle by
changing values, not class names.

## Foundations
- **Color (light):** stone surfaces (`surface` `#fafaf9`, `surface-container-*` from `#f7f7f5` to
  `#e4e3df`) under white cards, ink text `#0c0f0e`, muted text `#57534e`. The primary is emerald
  `#047857` (5.5:1 with white); `primary-fixed` `#ecfdf5` is its light tint for selected chips
  and pills. The `accent` is amber `#f59e0b`, always with dark `on-accent` text. Each semantic
  status colour has foreground, surface, border and ink variants: success (green), warning
  (amber), critical (red) and info (cyan `#0e7490`, kept apart from the emerald brand).
- **Color (dark):** near-black surfaces (`#0b0d0c` to `#272d29`), text `#f5f5f4`, and a light
  emerald primary `#34d399` with dark `on-primary` text, so buttons and links keep at least 4.5:1.
- **Fixed colors:** `band` (deep emerald `#064e3b`, 9.9:1 with white) and `ink-deep` (`#0c0f0e`)
  do not change with the theme, so white `on-ink` text on them keeps its contrast. Page header
  bands, the Pro plan card and the dark product-page panels use them. `on-ink-success`
  (`#a7f3d0`) is the fixed mint for emphasis on `ink-deep`; the themed `success-*` tokens turn
  dark in dark mode and fail there.
- **Type:** DM Sans for UI, Sora for display (headings weight 700, tight tracking), JetBrains Mono
  for eyebrows, step numbers and code-like readouts. All fonts are bundled locally through
  Fontsource, so the CSP stays same-origin. Scale tokens: `display-lg`, `headline-lg|md|sm`,
  `body-lg|md|sm`, `label-md|sm`, `code-sm`. Quantitative readouts use `.tnum`.
- **Shape:** controls 10px (`rounded-control`), cards 14px (`rounded-card`), panels 20px
  (`rounded-panel`). Pills are fully rounded.
- **Elevation:** crisp, low shadows (`shadow-level-1..3`) and `shadow-brand` (an emerald glow
  under primary buttons and the active nav item). Focus shows a visible emerald ring.
- **Cards:** one card style, the `card` utility in `index.css`: the lowest surface, a 1px
  `hairline` border, `rounded-card`, `shadow-level-1`, and in dark mode a faint white top edge
  (`--card-edge`) so cards read as layers rather than flat fills. Feature illustrations sit on a
  neutral "stage" (`surface-container-low` with a hairline border) instead of coloured fills.
- **Grid:** the `bg-grid` utility draws a faint 32px grid in the current text colour. The
  product-page hero and ink panels use it under a radial mask, often with a blurred emerald glow.
- **Light / dark:** the user chooses System, Light or Dark (Settings > Appearance), and a sun/moon
  button in both headers flips light and dark. The choice is saved in `localStorage` (key
  `theme`). `public/theme.js` sets `<html data-theme="light|dark">` before first paint, so there
  is no flash; it is a separate file because the CSP allows only same-origin scripts.
  `src/lib/theme.ts` keeps it in sync afterwards and follows OS changes while the choice is
  System. Every token is redefined under `:root[data-theme="dark"]`; components need no
  dark-specific classes.
- **Photos:** thirteen Unsplash photos are bundled in `src/assets/images/` (credits in
  `CREDITS.md`), each with an 800px version, and exported from `constants/images.ts` (`PHOTOS`,
  `PHOTOS_SMALL`, `photoSrcSet`). They are decorative (empty `alt`).
- **Logo:** the "verified line" mark: resume lines on an emerald square whose last line turns into
  an amber tick (`BrandMark.tsx`, `public/favicon.svg`).
- **Motion:** `animate-rise` (fade-up on headers, cards and plans), `animate-float` (the photo in
  page header bands and a shape on the pricing page), `animate-fill` (bars and the hero match
  score grow in), `animate-pop` (a changed price or tailoring view), `animate-spin-slow` (the
  dashed ring on page header bands and pricing), `animate-marquee` (the skills strip on the
  product page) and the `lift` utility (cards rise on hover). Scores count up through
  `useCountUp` (in `ScoreRing`); screen readers get the final value. Under
  `prefers-reduced-motion` every animation and transition is off and counts show their final
  value at once.
- **On the band:** inside `PhotoBanner` actions and the Pro card, primary buttons turn white and
  secondary ones outlined (child selectors in those components), because an emerald button on
  the emerald band would disappear.

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
| `PhotoBanner` | Page title on the emerald `band` with the section's photo framed on the right (md and up). Used by `PageHeader` when it gets a `photo` (section landing pages) and by the dashboard. |
| `ResumePaper` (`components/resume`) | An A4 page preview of a resume in a template. Sizes use container query units, so it scales to any width without JavaScript. It is paper, not UI: white with dark text in both themes. |
| `TemplatePicker` (`components/resume`) | Radio group of templates, each a live `ResumePaper`. Used by the quick builder and the Resume Builder. |

## Resume templates
There are **81 templates**: 79 resumes and 2 CVs. The PDF templates live in
`backend/app/output/templates.py`; the preview copies their values in
`frontend/src/constants/templates.ts`. When a template is added or changed, update both. Every
template is real, selectable text with title-case standard headings in a fixed reading order (the
ATS check relies on them). The public gallery is `/templates`, filtered by style, layout, photo,
colour, font and header.

### The seven originals
| Template | Type | Header | Headings |
|---|---|---|---|
| Classic | Sans | Left | Navy, ruled |
| Modern | Sans | Left, large name | Indigo, ruled |
| Executive | Serif | Centred | Navy, ruled |
| Minimal | Sans | Centred, wide margins | Grey, no rule |
| Compact | Sans | Left, tight spacing | Black, no rule |
| Serif | Serif | Left | Black, ruled |
| One Page | Sans, 8.8 pt, 1.2 line height, 11 mm margins | Left | Black, ruled, UPPERCASE |

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
The product page hero is a product window built from live components (`ResumePaper`, the match
score, requirement evidence and a flagged claim), not a photo. Photos appear in these places:

| Where | Photo |
|---|---|
| Product page, "Only here" tiles | `insights`, `market`, `proofs` |
| Sign in, Forgot / Reset password | `signin` (split screen, shown from 1024px) |
| Register | `register` |
| Dashboard | `dashboard` |
| My Resumes | `resumes` |
| Resume Analysis | `analysis` |
| Job Analyzer | `jobs` |
| Job Match, Skill Gap Matrix | `match` |
| Tailor Resume, Cover Letters | `register` |
| Applications | `applications` |
| Callback Insights | `insights` |
| Market Map | `market` |
| Proof Board | `proofs` |
| Interview Prep, Story Bank | `interview` |
| Profile Builder | `signin` |

## Layout
- **≥ 1024px:** a fixed 256px sidebar.
- **< 1024px:** a modal drawer, built on a native `<dialog>`.
- **< 768px:** a bottom tab bar with five destinations.
- Screens that are not built yet appear as disabled navigation items tagged with their phase.
- The header holds the global search (Ctrl/Cmd+K or `/`), the light/dark toggle, notifications
  and the account. Public pages use `PublicHeader` with the Builders menu and the same toggle.
