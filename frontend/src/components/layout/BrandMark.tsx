import { PRODUCT_NAME } from "@/constants/branding";

/**
 * "Verified line": two resume lines, and the last line turns into a tick.
 * Keep in sync with public/favicon.svg.
 */
export function BrandIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2a4bf2" />
      <path d="M8 10h16M8 15.5h11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 21h5l3 3.2 8-9" stroke="#ffc542" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandIcon />
      <span className="truncate font-display text-headline-sm leading-tight text-on-surface">{PRODUCT_NAME}</span>
    </div>
  );
}
