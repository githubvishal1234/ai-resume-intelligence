import { Pill, type PillTone } from "@/components/ui/Pill";
import { STATUS_LABEL, type ApplicationStatus } from "@/services/applicationService";

const STATUS_TONE: Record<ApplicationStatus, PillTone> = {
  saved: "neutral",
  applied: "info",
  screening: "info",
  interviewing: "brand",
  offer: "matched",
  accepted: "matched",
  rejected: "critical",
  withdrawn: "neutral",
};

/** Dates without a time ("2026-10-12") are shown as calendar dates, never shifted by time zone. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function StatusPill({ status }: { status: ApplicationStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}
