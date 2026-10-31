import { Check, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * What a long AI request is doing while the user waits. The steps are in the request's real
 * order, but their timing is typical, not measured: the bar never fills and the last step stays
 * active until the request finishes and this panel goes away.
 */
export function AiProgress({ title, steps, seconds }: { title: string; steps: string[]; seconds: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, []);
  const active = Math.min(steps.length - 1, Math.floor((elapsed / seconds) * steps.length));
  const share = Math.min(0.92, elapsed / seconds);
  return (
    <div className="animate-fade rounded-card border border-hairline bg-surface-container-low p-4">
      <p className="text-label-md font-semibold text-on-surface">{title}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container" aria-hidden>
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-linear"
          style={{ transform: `scaleX(${share})` }}
        />
      </div>
      <ol className="mt-3 space-y-1.5">
        {steps.map((step, i) => (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 text-body-sm",
              i === active ? "font-semibold text-on-surface" : i < active ? "text-on-surface" : "text-on-surface-variant",
            )}
          >
            {i < active ? (
              <Check className="size-4 shrink-0 animate-pop text-success" aria-hidden />
            ) : i === active ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            ) : (
              <Circle className="size-4 shrink-0" aria-hidden />
            )}
            {step}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-body-sm text-on-surface-variant">Usually about {seconds} seconds.</p>
      {/* One short announcement per step, not one per tick of the bar. */}
      <p className="sr-only" role="status" aria-live="polite">
        {`Step ${active + 1} of ${steps.length}: ${steps[active]}`}
      </p>
    </div>
  );
}
