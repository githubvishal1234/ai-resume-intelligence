import { Check, Clock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PRODUCT_NAME } from "@/constants/branding";
import { formatPrice, FREE_FEATURES, PRO_FEATURES, PRO_PRICE, YEARLY_SAVING_PERCENT } from "@/constants/pricing";
import { useJoinProWaitlist, useProWaitlist } from "@/hooks/useAccount";
import { useBilling, useUpgrade } from "@/hooks/useBilling";
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

function Feature({ children, onBand = false }: { children: string; onBand?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", onBand ? "bg-accent text-on-accent" : "bg-success-surface text-success")}>
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
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
        <section aria-labelledby="pricing-title" className="relative overflow-hidden">
          <svg aria-hidden viewBox="0 0 520 520" className="pointer-events-none absolute -right-40 -top-44 size-[520px] animate-spin-slow opacity-60">
            <circle cx="260" cy="260" r="250" fill="none" className="stroke-primary-fixed-dim" strokeWidth="2" strokeDasharray="6 14" />
          </svg>
          <div aria-hidden className="pointer-events-none absolute left-[6%] top-24 hidden size-20 animate-float rounded-full bg-accent sm:block" />
          <div aria-hidden className="pointer-events-none absolute bottom-10 right-[12%] hidden size-10 rotate-12 rounded-control bg-primary sm:block" />
          <div className="relative mx-auto max-w-5xl animate-rise px-4 pb-12 pt-16 text-center sm:px-6">
            <p className="text-label-md font-semibold uppercase tracking-wider text-primary">Pricing</p>
            <h1 id="pricing-title" className="mt-2 font-display text-[40px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[56px]">Simple pricing</h1>
            <p className="mx-auto mt-3 max-w-2xl text-body-lg text-on-surface-variant">
              Build, check and track your resumes for free. Pro adds AI writing help that is checked against your own resume.
            </p>
            <div role="radiogroup" aria-label="Billing period" className="mx-auto mt-8 inline-flex rounded-full bg-surface-container-lowest p-1.5 shadow-level-2">
              {(["monthly", "yearly"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={billing === b}
                  onClick={() => setBilling(b)}
                  className={cn(
                    "h-11 rounded-full px-5 text-body-md font-semibold transition-colors",
                    billing === b ? "bg-ink-deep text-on-ink" : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {b === "monthly" ? "Monthly" : `Yearly · save ${YEARLY_SAVING_PERCENT}%`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Plans" className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 sm:px-6 md:grid-cols-2">
          <article aria-labelledby="plan-free" className="lift flex animate-rise flex-col rounded-panel border border-hairline bg-surface-container-lowest p-6 shadow-level-2 [animation-delay:100ms] sm:p-8">
            <h2 id="plan-free" className="font-display text-headline-md font-extrabold">Free</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">Everything you need to build and send a strong resume.</p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-[48px] font-extrabold leading-none tracking-[-0.03em] tnum">{formatPrice(0)}</span>
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

          <article aria-labelledby="plan-pro" className="lift relative isolate flex animate-rise flex-col overflow-hidden rounded-panel bg-band p-6 text-on-ink shadow-brand [animation-delay:200ms] sm:p-8">
            <div aria-hidden className="absolute -right-12 -top-12 -z-10 size-44 rounded-full bg-on-ink/10" />
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-label-sm font-bold text-on-accent">
              <Clock className="size-3.5" aria-hidden /> Launching soon
            </span>
            <h2 id="plan-pro" className="mt-3 flex items-center gap-2 font-display text-headline-md font-extrabold">
              Pro <Sparkles className="size-5 text-accent" aria-hidden />
            </h2>
            <p className="mt-1 text-body-md text-on-ink-muted">AI help to write faster, without inventing anything.</p>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-1">
              <span key={price} className="animate-pop font-display text-[48px] font-extrabold leading-none tracking-[-0.03em] tnum">{formatPrice(price)}</span>
              <span className="text-body-md text-on-ink-muted">{billing === "monthly" ? "per month" : "per year"}</span>
            </p>
            <p className="mt-1 text-body-sm text-on-ink-muted tnum">
              {billing === "monthly"
                ? `Or ${formatPrice(PRO_PRICE.yearly)} a year, ${YEARLY_SAVING_PERCENT}% less.`
                : `That's ${formatPrice(Math.round(PRO_PRICE.yearly / 12))} a month, billed yearly.`}
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-body-md">
              {PRO_FEATURES.map((f) => <Feature key={f} onBand>{f}</Feature>)}
            </ul>
            {/* On the blue card: the button turns white and helper text light, in both themes. */}
            <div className="mt-8 [&>.bg-primary]:bg-on-ink [&>.bg-primary]:text-ink-deep [&>.bg-primary:hover]:bg-on-ink-muted [&>p]:text-on-ink-muted [&>p[role=alert]]:text-accent">
              <ProAction signedIn={signedIn} interval={billing} />
            </div>
          </article>
        </section>

        <section aria-labelledby="pricing-faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <h2 id="pricing-faq" className="text-center font-display text-headline-lg font-extrabold tracking-[-0.03em]">Pricing questions</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-card border border-hairline bg-surface-container-lowest p-5 shadow-level-1">
                <summary className="cursor-pointer list-none text-body-lg font-semibold">{q}</summary>
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

/**
 * The Pro button. Signed out: sign up first. Signed in with payments set up: upgrade through
 * Razorpay Checkout (or show the current Pro plan). Without payments: the waitlist, as before.
 */
function ProAction({ signedIn, interval }: { signedIn: boolean; interval: Billing }) {
  const [params] = useSearchParams();
  const billing = useBilling(signedIn);
  const upgrade = useUpgrade();
  if (!signedIn) {
    return (
      <>
        <ButtonLink to="/register?plan=pro" variant="primary" className="w-full">Join the Pro waitlist</ButtonLink>
        <p className="mt-2 text-center text-body-sm text-on-surface-variant">Create a free account first. No payment now.</p>
      </>
    );
  }
  if (billing.isPending) return <Button className="w-full" loading>Upgrade to Pro</Button>;
  if (!billing.data?.configured) return <WaitlistAction />;
  const sub = billing.data.subscription;
  if (billing.data.plan === "pro" && sub) {
    const until = sub.current_end ? new Date(sub.current_end).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;
    return (
      <Notice tone="success" title="You're on Pro">
        {sub.cancel_at_period_end
          ? `Cancelled; Pro stays on${until ? ` until ${until}` : " until the end of this period"}. `
          : `Billed ${sub.interval === "monthly" ? "monthly" : "yearly"}${until ? `, renews ${until}` : ""}. `}
        <Link to="/settings" className="font-semibold underline">Manage in Settings</Link>
      </Notice>
    );
  }
  return (
    <>
      {params.get("join") === "pro" ? (
        <Notice tone="info" title="Your free account is ready" className="mb-3">
          One more step to upgrade to Pro.
        </Notice>
      ) : null}
      <Button className="w-full" loading={upgrade.isPending} onClick={() => upgrade.mutate(interval)}>
        Upgrade to Pro · {formatPrice(PRO_PRICE[interval])} {interval === "monthly" ? "a month" : "a year"}
      </Button>
      {upgrade.error ? (
        <p role="alert" className="mt-2 text-body-sm text-critical">
          {upgrade.error instanceof ApiError || upgrade.error instanceof Error ? upgrade.error.message : "Something went wrong. Try again."}
        </p>
      ) : (
        <p className="mt-2 text-center text-body-sm text-on-surface-variant">Pay with UPI or card on Razorpay's secure page. Cancel any time.</p>
      )}
    </>
  );
}

/** Before payments are set up, Pro is a waitlist. */
function WaitlistAction() {
  const [params] = useSearchParams();
  const waitlist = useProWaitlist(true);
  const join = useJoinProWaitlist();
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
