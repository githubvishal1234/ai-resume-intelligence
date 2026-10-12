import { Pill } from "@/components/ui/Pill";

const TONE = { high: "matched", medium: "missing", low: "critical" } as const;
const LABEL = { high: "High confidence", medium: "Check this", low: "Low confidence" } as const;

export function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  return <Pill tone={TONE[level]}>{LABEL[level]}</Pill>;
}
