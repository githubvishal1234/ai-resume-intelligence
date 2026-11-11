import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { arrange, RESUME_ORDER, type SectionKey } from "@/constants/templates";
import { sectionOrder, suggestionReason } from "@/lib/sectionOrder";
import type { ResumeDoc } from "@/services/resumeService";

const LABEL: Record<SectionKey, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
};

/**
 * The resume's section order, moved with up and down buttons. Until the user moves one, the
 * suggested order for their experience applies; "Use the suggested order" goes back to it.
 */
export function SectionOrderEditor({
  doc,
  onChange,
  busy = false,
  className,
}: {
  doc: ResumeDoc;
  onChange: (order: SectionKey[]) => void;
  busy?: boolean;
  className?: string;
}) {
  const id = useId();
  const order = arrange(RESUME_ORDER, sectionOrder(doc));
  const custom = doc.section_order.length > 0;
  const move = (from: number, to: number) => {
    const next = [...order];
    [next[from], next[to]] = [next[to]!, next[from]!];
    onChange(next);
  };
  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <h3 id={`${id}-title`} className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">Section order</h3>
      <ol className="mt-2 divide-y divide-hairline rounded-control border border-hairline">
        {order.map((key, i) => (
          <li key={key} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-5 text-body-sm tabular-nums text-on-surface-variant">{i + 1}</span>
            <span className="flex-1 text-body-md text-on-surface">{LABEL[key]}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move ${LABEL[key]} up`}
              disabledReason={i === 0 ? "Already first" : busy ? "Saving" : undefined}
              icon={<ArrowUp className="size-4" aria-hidden />}
              onClick={() => move(i, i - 1)}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move ${LABEL[key]} down`}
              disabledReason={i === order.length - 1 ? "Already last" : busy ? "Saving" : undefined}
              icon={<ArrowDown className="size-4" aria-hidden />}
              onClick={() => move(i, i + 1)}
            />
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-body-sm text-on-surface-variant">
          {custom ? "Your own order, used in the preview and the PDF." : `Suggested for this resume. ${suggestionReason(doc)}`}
        </p>
        {custom ? (
          <Button size="sm" variant="secondary" disabledReason={busy ? "Saving" : undefined} icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => onChange([])}>
            Use the suggested order
          </Button>
        ) : null}
      </div>
    </section>
  );
}
