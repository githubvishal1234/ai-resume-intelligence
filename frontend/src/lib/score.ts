/** Score thresholds from DESIGN.md: <60 critical, 60-79 warning, >=80 success. */
export type ScoreLevel = "critical" | "warning" | "success";

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function scoreLevel(value: number): ScoreLevel {
  const v = clampScore(value);
  if (v < 60) return "critical";
  if (v < 80) return "warning";
  return "success";
}

export const SCORE_LEVEL_LABEL: Record<ScoreLevel, string> = {
  critical: "Needs attention",
  warning: "Moderate",
  success: "Strong",
};
