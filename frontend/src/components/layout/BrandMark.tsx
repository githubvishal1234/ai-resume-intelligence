import { PRODUCT_NAME } from "@/constants/branding";

export function BrandIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path d="M9 11h14M9 16h9M9 21h6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23" cy="21" r="4.2" fill="#059669" />
      <path d="m21.2 21 1.3 1.3 2.3-2.5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
