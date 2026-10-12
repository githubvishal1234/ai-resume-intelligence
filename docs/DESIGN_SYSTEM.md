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

## Layout
- **≥ 1024px:** a fixed 256px sidebar.
- **< 1024px:** a modal drawer, built on a native `<dialog>`.
- **< 768px:** a bottom tab bar with five destinations.
- Screens that are not built yet appear as disabled navigation items tagged with their phase.
