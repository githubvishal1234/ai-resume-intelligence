import { Check } from "lucide-react";
import { useId } from "react";
import { templateStyle, TEMPLATE_STYLES, type TemplateCategory, type TemplateStyle } from "@/constants/templates";
import { cn } from "@/lib/cn";

export type Filters = { category: TemplateCategory | ""; colour: string; font: "" | "sans" | "serif"; header: "" | TemplateStyle["header"] };
export const NO_FILTERS: Filters = { category: "", colour: "", font: "", header: "" };

const CATEGORIES: TemplateCategory[] = ["Professional", "Modern", "Creative", "Simple"];
const HEADERS = [
  { id: "plain", label: "Plain header" },
  { id: "banner", label: "Colour band" },
  { id: "stripe", label: "Side stripe" },
] as const;

/** One swatch per colour name, using the first template's accent of that colour. */
const COLOURS = [...new Map(TEMPLATE_STYLES.map((t) => [t.colour, t.accent])).entries()];

export function matches(id: string, f: Filters): boolean {
  const t = templateStyle(id);
  return (
    (!f.category || t.category === f.category) &&
    (!f.colour || t.colour === f.colour) &&
    (!f.font || t.serif === (f.font === "serif")) &&
    (!f.header || t.header === f.header)
  );
}

function Chips<T extends string>({ legend, options, value, onChange }: { legend: string; options: { id: T; label: string }[]; value: T | ""; onChange: (v: T | "") => void }) {
  const name = useId();
  const all = [{ id: "" as const, label: "All" }, ...options];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => (
          <label
            key={o.id || "all"}
            className={cn(
              "relative inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3.5 text-label-md transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
              value === o.id ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-hairline-strong text-on-surface-variant hover:border-outline",
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Style, colour, font and header filters for a list of templates. */
export function TemplateFilters({ value, onChange, className }: { value: Filters; onChange: (f: Filters) => void; className?: string }) {
  const name = useId();
  const set = <K extends keyof Filters>(k: K) => (v: Filters[K]) => onChange({ ...value, [k]: v });
  return (
    <div className={cn("flex flex-wrap gap-x-8 gap-y-4", className)}>
      <Chips legend="Style" options={CATEGORIES.map((c) => ({ id: c, label: c }))} value={value.category} onChange={set("category")} />
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">Colour</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {[["", ""] as const, ...COLOURS].map(([colour, hex]) => {
            const selected = value.colour === colour;
            return (
              <label
                key={colour || "all"}
                title={colour || "All colours"}
                className={cn(
                  "relative flex size-9 cursor-pointer items-center justify-center rounded-full border-2 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                  selected ? "border-primary" : "border-transparent",
                )}
              >
                <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => set("colour")(colour)} aria-label={colour || "All colours"} />
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-full ring-1 ring-hairline-strong"
                  style={{ background: hex || "conic-gradient(#1f3a5f, #0f6366, #2f6b3a, #8a1c3b, #5b3aa8, #1f3a5f)" }}
                >
                  {selected ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Chips legend="Font" options={[{ id: "sans", label: "Sans-serif" }, { id: "serif", label: "Serif" }]} value={value.font} onChange={set("font")} />
      <Chips legend="Header" options={HEADERS.map((h) => ({ id: h.id, label: h.label }))} value={value.header} onChange={set("header")} />
    </div>
  );
}
