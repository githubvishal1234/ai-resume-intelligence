import { clampScore, SCORE_LEVEL_LABEL, scoreLevel, type ScoreLevel } from "@/lib/score";
import { cn } from "@/lib/cn";

const STROKE: Record<ScoreLevel, string> = {
  critical: "stroke-critical",
  warning: "stroke-warning",
  success: "stroke-success",
};
const FILL: Record<ScoreLevel, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  success: "bg-success",
};

/** Circular gauge. Never colour-only: always shows the number and exposes a text label. */
export function ScoreRing({
  value,
  size = 96,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const v = clampScore(value);
  const level = scoreLevel(v);
  const stroke = Math.max(6, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${Math.round(v)} out of 100, ${SCORE_LEVEL_LABEL[level]}`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-hairline" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className={cn("transition-[stroke-dashoffset]", STROKE[level])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-display text-headline-md leading-none text-on-surface">{Math.round(v)}</span>
        <span className="tnum font-mono text-label-sm text-on-surface-variant">/100</span>
      </div>
    </div>
  );
}

/** Linear meter with a mono readout (e.g. `88/100`). */
export function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = clampScore(value);
  const level = scoreLevel(v);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-label-md text-on-surface">{label}</span>
        <span className="tnum font-mono text-code-sm text-on-surface-variant">
          {Math.round(v)}/100 · {SCORE_LEVEL_LABEL[level]}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-valuetext={`${Math.round(v)} out of 100, ${SCORE_LEVEL_LABEL[level]}`}
        className="h-2 overflow-hidden rounded-full bg-hairline"
      >
        <div className={cn("h-full rounded-full", FILL[level])} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
