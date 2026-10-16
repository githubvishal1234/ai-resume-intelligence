import { Check } from "lucide-react";
import { useId } from "react";
import { templateStyle } from "@/constants/templates";
import { cn } from "@/lib/cn";
import type { ResumeDoc } from "@/services/resumeService";
import { ResumePaper } from "./ResumePaper";

export type TemplateOption = { id: string; name: string; description: string };

/** Radio group of templates, each shown as a live page preview of `doc`. */
export function TemplatePicker({
  templates,
  value,
  onChange,
  doc,
  legend = "Template",
  columns = "sm:grid-cols-2 xl:grid-cols-3",
}: {
  templates: TemplateOption[];
  value: string;
  onChange: (id: string) => void;
  doc: ResumeDoc;
  legend?: string;
  columns?: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className={cn("grid gap-4", columns)}>
        {templates.map((t) => {
          const selected = t.id === value;
          return (
            <label
              key={t.id}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-3 rounded-card border bg-surface-container-lowest p-3 transition",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                selected ? "border-primary shadow-level-2 ring-2 ring-primary/25" : "border-hairline hover:border-hairline-strong hover:shadow-level-1",
              )}
            >
              <input type="radio" name={name} value={t.id} checked={selected} onChange={() => onChange(t.id)} className="sr-only" />
              <div className="overflow-hidden rounded-control bg-surface-container-low p-3">
                <ResumePaper doc={doc} template={t.id} label={`${t.name} template preview`} />
              </div>
              <div className="flex items-start justify-between gap-2 px-1">
                <span>
                  <span className="block text-label-md text-on-surface">{t.name}</span>
                  <span className="block text-body-sm text-on-surface-variant">{t.description || templateStyle(t.id).description}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-primary bg-primary text-on-primary" : "border-hairline-strong",
                  )}
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
