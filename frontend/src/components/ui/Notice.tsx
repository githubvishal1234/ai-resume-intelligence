import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type NoticeTone = "info" | "warning" | "critical" | "success";

const TONES: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  info: { box: "bg-info-surface border-info-border text-info-ink", icon: Info },
  warning: { box: "bg-warning-surface border-warning-border text-warning-ink", icon: AlertTriangle },
  critical: { box: "bg-critical-surface border-critical-border text-critical-ink", icon: OctagonAlert },
  success: { box: "bg-success-surface border-success-border text-success-ink", icon: CheckCircle2 },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === "critical" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border p-4", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label-md font-semibold">{title}</p>
        {children ? <div className="mt-1 text-body-md">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
