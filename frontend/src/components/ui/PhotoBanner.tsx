import type { ReactNode } from "react";
import { PHOTOS, type PhotoName } from "@/constants/images";
import { cn } from "@/lib/cn";

/**
 * A page title over a photo. The overlay uses fixed ink tokens (not the themed surfaces), so the
 * white text keeps its contrast in light and dark mode. The photo is decorative (empty alt).
 */
export function PhotoBanner({
  photo,
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  photo: PhotoName;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate animate-rise overflow-hidden rounded-panel bg-ink-deep shadow-level-2", className)}>
      <img src={PHOTOS[photo]} alt="" decoding="async" className="absolute inset-0 -z-10 size-full object-cover" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-ink-deep/95 via-ink-deep/85 to-ink-deep/60 sm:bg-linear-to-r sm:from-ink-deep/95 sm:via-ink-deep/80 sm:to-ink-deep-indigo/25"
      />
      <div className="flex min-h-44 flex-wrap items-end justify-between gap-4 p-6 sm:min-h-52 sm:p-8">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? <p className="mb-2 text-label-sm uppercase tracking-wider text-on-ink-muted">{eyebrow}</p> : null}
          <h1 className="font-display text-headline-lg text-on-ink">{title}</h1>
          {description ? <p className="mt-2 text-body-lg text-on-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
