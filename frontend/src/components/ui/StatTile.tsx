import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface-container-lowest p-4 shadow-level-1">
      <div className="flex items-center justify-between gap-2 text-label-sm uppercase tracking-wide text-on-surface-variant">
        <span>{label}</span>
        {icon}
      </div>
      <div className="tnum mt-2 font-display text-headline-lg text-on-surface">{value}</div>
      {hint ? <div className="mt-1 text-body-sm text-on-surface-variant">{hint}</div> : null}
    </div>
  );
}
