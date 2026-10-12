import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLElement> & { padded?: boolean }) {
  return (
    <section
      {...rest}
      className={cn(
        "rounded-card border border-hairline bg-surface-container-lowest shadow-level-1",
        padded && "p-5 sm:p-6",
        className,
      )}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-headline-sm text-on-surface">
          {title}
        </h2>
        {description ? <p className="mt-1 text-body-md text-on-surface-variant">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
