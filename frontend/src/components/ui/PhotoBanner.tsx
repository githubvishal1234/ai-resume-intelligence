import type { ReactNode } from "react";
import { PHOTOS_SMALL, type PhotoName } from "@/constants/images";
import { cn } from "@/lib/cn";

/**
 * A page title on the brand band, with the section's photo framed on the right from md up.
 * The band and its text use fixed tokens (`band`, `on-ink`), so contrast holds in light and dark
 * mode. The photo and the shapes are decorative.
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
    <div className={cn("relative isolate animate-rise overflow-hidden rounded-panel bg-band text-on-ink shadow-brand", className)}>
      <svg aria-hidden viewBox="0 0 360 360" className="pointer-events-none absolute -right-24 -top-32 -z-10 size-[360px] animate-spin-slow opacity-30">
        <circle cx="180" cy="180" r="170" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 12" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute -bottom-16 right-1/3 -z-10 size-32 rounded-full bg-accent/90" />
      <div className="flex min-h-44 flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
        <div className="min-w-0 max-w-2xl flex-[2_1_320px]">
          {eyebrow ? (
            <p className="mb-3 inline-flex rounded-full bg-on-ink/15 px-3 py-1 text-label-md font-semibold">{eyebrow}</p>
          ) : null}
          <h1 className="font-display text-headline-lg font-extrabold tracking-[-0.03em] sm:text-[36px] sm:leading-[44px]">{title}</h1>
          {description ? <p className="mt-2 text-body-lg text-on-ink-muted">{description}</p> : null}
          {actions ? (
            // On the band, primary actions turn white and secondary ones outlined, in both themes.
            <div className="mt-5 flex flex-wrap gap-2 [&>.bg-primary]:bg-on-ink [&>.bg-primary]:text-ink-deep [&>.bg-primary]:shadow-level-2 [&>.bg-primary:hover]:bg-on-ink-muted [&>.bg-surface-container-lowest]:border-on-ink/50 [&>.bg-surface-container-lowest]:bg-transparent [&>.bg-surface-container-lowest]:text-on-ink [&>.bg-surface-container-lowest:hover]:bg-on-ink/10">
              {actions}
            </div>
          ) : null}
        </div>
        <div className="hidden h-36 w-56 shrink-0 animate-float overflow-hidden rounded-[24px_24px_24px_72px] ring-4 ring-on-ink/20 md:block">
          {/* Lazy, so phones (where this frame is hidden) never download it. */}
          <img src={PHOTOS_SMALL[photo]} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </div>
      </div>
    </div>
  );
}
