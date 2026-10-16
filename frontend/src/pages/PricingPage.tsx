import { Check, Clock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PRODUCT_NAME } from "@/constants/branding";
import { formatPrice, FREE_FEATURES, PRO_FEATURES, PRO_PRICE, YEARLY_SAVING_PERCENT } from "@/constants/pricing";
import { useJoinProWaitlist, useProWaitlist } from "@/hooks/useAccount";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/cn";
import { ApiError } from "@/services/apiClient";

type Billing = "monthly" | "yearly";

const FAQ = [
  { q: "Is the Free plan really free?", a: "Yes. There is no trial period and no card is asked for. Everything listed under Free stays free." },
  { q: "Why a waitlist for Pro?", a: "Pro checkout isn't open yet. Joining the waitlist marks your account so you hear when it opens. Nothing is charged now." },
  { q: "Will I keep my resumes if I upgrade?", a: "Yes. Pro is an upgrade to the same account, so your resumes, jobs and applications stay where they are." },
  { q: "Are prices in rupees?", a: "Yes, prices are in Indian rupees." },
];

function Feature({ children }: { children: string }) {
  return (
    <li className="flex gap-3">
      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export function PricingPage() {
  const signedIn = Boolean(useSession().data);
  const [billing, setBilling] = useState<Billing>("monthly");
  const price = billing === "monthly" ? PRO_PRICE.monthly : PRO_PRICE.yearly;
  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <PublicHeader signedIn={signedIn} />
      <main>
        <section aria-labelledby="pricing-title" className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-linear-to-b from-primary-fixed/60 to-transparent" />
          <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-14 text-center sm:px-6">
            <h1 id="pricing-title" className="font-display text-[36px] leading-tight tracking-tight sm:text-[44px]">Simple pricing</h1>
            <p className="mx-auto mt-3 max-w-2xl text-body-lg text-on-surface-variant">
              Build, check and track your resumes for free. Pro adds AI writing help that is checked against your own resume.
            </p>
            <div role="radiogroup" aria-label="Billing period" className="mx-auto mt-8 inline-flex rounded-full border border-hairline bg-surface-container-lowest p-1">
              {(["monthly", "yearly"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={billing === b}
                  onClick={() => setBilling(b)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-label-md transition-colors",
                    billing === b ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {b === "monthly" ? "Monthly" : `Yearly · save ${YEARLY_SAVING_PERCENT}%`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Plans" className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 sm:px-6 md:grid-cols-2">
          <article aria-labelledby="plan-free" className="flex flex-col rounded-panel border border-hairline bg-surface-container-lowest p-6 shadow-level-1 sm:p-8">
            <h2 id="plan-free" className="font-display text-headline-md">Free</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">Everything you need to build and send a strong resume.</p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-[40px] leading-none tnum">{formatPrice(0)}</span>
              <span className="text-body-md text-on-surface-variant">forever</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-body-md">
              {FREE_FEATURES.map((f) => <Feature key={f}>{f}</Feature>)}
            </ul>
            <div className="mt-8">
              {signedIn ? (
                <ButtonLink to="/" className="w-full">Go to your dashboard</ButtonLink>
              ) : (
                <ButtonLink to="/register" className="w-full">Start free</ButtonLink>
              )}
            </div>
          </article>

          <article aria-labelledby="plan-pro" className="relative flex flex-col rounded-panel border-2 border-primary bg-surface-container-lowest p-6 shadow-level-3 sm:p-8">
            <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-label-sm text-on-primary">
              <Clock className="size-3.5" aria-hidden /> Launching soon
            </span>
            <h2 id="plan-pro" className="flex items-center gap-2 font-display text-headline-md">
              Pro <Sparkles className="size-5 text-primary" aria-hidden />
            </h2>
            <p className="mt-1 text-body-md text-on-surface-variant">AI help to write faster, without inventing anything.</p>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-1">
              <span className="font-display text-[40px] leading-none tnum">{formatPrice(price)}</span>
              <span className="text-body-md text-on-surface-variant">{billing === "monthly" ? "per month" : "per year"}</span>
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant tnum">
              {billing === "monthly"
                ? `Or ${formatPrice(PRO_PRICE.yearly)} a year, ${YEARLY_SAVING_PERCENT}% less.`
                : `That's ${formatPrice(Math.round(PRO_PRICE.yearly / 12))} a month, billed yearly.`}
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-body-md">
              {PRO_FEATURES.map((f) => <Feature key={f}>{f}</Feature>)}
            </ul>
            <div className="mt-8">
              <ProAction signedIn={signedIn} />
            </div>
          </article>
        </section>

        <section aria-labelledby="pricing-faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <h2 id="pricing-faq" className="text-center font-display text-headline-lg">Pricing questions</h2>
          <div className="mt-8 divide-y divide-hairline rounded-card border border-hairline bg-surface-container-lowest">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none text-body-lg font-medium">{q}</summary>
                <p className="mt-3 text-body-md text-on-surface-variant">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-hairline py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-body-sm text-on-surface-variant sm:px-6">
          <p>© {new Date().getFullYear()} {PRODUCT_NAME}</p>
          <p>
            <Link to="/welcome" className="underline hover:text-primary">Product</Link>
            {" · "}
            <Link to="/login" className="underline hover:text-primary">Sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** The Pro button: sign up first when signed out, otherwise join (or show) the waitlist. */
function ProAction({ signedIn }: { signedIn: boolean }) {
  const [params] = useSearchParams();
  const waitlist = useProWaitlist(signedIn);
  const join = useJoinProWaitlist();
  if (!signedIn) {
    return (
      <>
        <ButtonLink to="/register?plan=pro" variant="primary" className="w-full">Join the Pro waitlist</ButtonLink>
        <p className="mt-2 text-center text-body-sm text-on-surface-variant">Create a free account first. No payment now.</p>
      </>
    );
  }
  if (waitlist.data?.joined) {
    return (
      <Notice tone="success" title="You're on the Pro waitlist">
        {waitlist.data.joined_at ? `You joined on ${new Date(waitlist.data.joined_at).toLocaleDateString(undefined, { dateStyle: "medium" })}. ` : ""}
        Keep using everything in Free meanwhile.
      </Notice>
    );
  }
  return (
    <>
      {params.get("join") === "pro" ? (
        <Notice tone="info" title="Your free account is ready" className="mb-3">
          One more click to join the Pro waitlist.
        </Notice>
      ) : null}
      <Button className="w-full" loading={join.isPending || waitlist.isPending} onClick={() => join.mutate()}>
        Join the Pro waitlist
      </Button>
      {join.error ? (
        <p role="alert" className="mt-2 text-body-sm text-critical">
          {join.error instanceof ApiError ? join.error.message : "Something went wrong. Try again."}
        </p>
      ) : (
        <p className="mt-2 text-center text-body-sm text-on-surface-variant">No payment now. We'll let you know when Pro opens.</p>
      )}
    </>
  );
}
