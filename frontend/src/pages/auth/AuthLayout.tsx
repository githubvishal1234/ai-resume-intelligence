import { FileCheck2, GitCompareArrows, ShieldCheck } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "@/components/layout/BrandMark";
import { PRODUCT_TAGLINE } from "@/constants/branding";
import { PHOTOS, photoSrcSet } from "@/constants/images";

const PROMISES = [
  { icon: FileCheck2, title: "One verified master resume", body: "Every version you send starts from it, and it never changes without you." },
  { icon: GitCompareArrows, title: "Evidence-based matching", body: "See which requirements your resume backs up, and where the real gaps are." },
  { icon: ShieldCheck, title: "Fact-checked tailoring", body: "Proposed changes that add claims your master resume can't support are flagged." },
];

/** Split screen: the form on the left, a photo with the product's promises on wide screens. */
export function AuthLayout() {
  const photo = useLocation().pathname === "/register" ? "register" : "signin";
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <BrandMark />
        <div className="flex flex-1 items-center justify-center py-10">
          <main className="w-full max-w-md animate-rise">
            <Outlet />
          </main>
        </div>
        <p className="text-center text-body-sm text-on-surface-variant lg:text-left">{PRODUCT_TAGLINE}</p>
      </div>

      <aside aria-label="Why use it" className="relative isolate hidden overflow-hidden bg-ink-deep lg:block">
        {/* Lazy, so phones (where this panel is hidden) never download it. */}
        <img src={PHOTOS[photo]} srcSet={photoSrcSet(photo)} sizes="55vw" alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-10 size-full object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-ink-deep via-ink-deep/80 to-ink-deep-indigo/30" />
        <div className="flex h-full flex-col justify-end gap-8 p-12 xl:p-16">
          <p className="max-w-lg font-display text-display-lg text-on-ink">Your resume, backed by evidence.</p>
          <ul className="max-w-lg space-y-5">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-on-ink/10 ring-1 ring-on-ink/20">
                  <Icon className="size-5 text-on-ink" aria-hidden />
                </span>
                <div>
                  <p className="text-body-lg font-semibold text-on-ink">{title}</p>
                  <p className="text-body-md text-on-ink-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
