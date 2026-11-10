import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone = "matched" | "missing" | "critical" | "info" | "neutral" | "brand";

const TONES: Record<PillTone, string> = {
  matched: "bg-success-surface border-success-border text-success-ink",
  missing: "bg-warning-surface border-warning-border text-warning-ink",
  critical: "bg-critical-surface border-critical-border text-critical-ink",
  info: "bg-info-surface border-info-border text-info-ink",
  neutral: "bg-surface-container-low border-hairline text-on-surface-variant",
  brand: "bg-primary-fixed border-primary-fixed-dim text-on-primary-fixed",
};

/** Status badges and keyword tokens. `mono` is for code-like readouts only. */
export function Pill({
  tone = "neutral",
  children,
  className,
  mono = false,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label-sm font-medium whitespace-nowrap",
        mono && "font-mono",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
