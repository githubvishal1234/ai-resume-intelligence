import { BarChart3, Clock, MailCheck, Send, Trophy, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useOutcomes } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/pages/resumes/common";
import type { Funnel, OutcomeGroup } from "@/services/insightsService";

export const pct = (rate: number | null | undefined) => (rate == null ? "–" : `${Math.round(rate * 100)}%`);

export function CallbackInsightsPage() {
  const q = useOutcomes();
  if (q.isPending) return <PageLoading label="Loading insights" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;

  return (
    <div>
      <PageHeader
        title="Callback Insights"
        photo="insights"
        description="Which resume version and which match level actually get replies, from your own applications."
      />
      {o.total.sent === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-8" aria-hidden />}
          title="No sent applications yet"
          description="Track applications with the resume version you sent and move them along as you hear back. Results show up here."
          action={<ButtonLink to="/applications/new" variant="primary">Track an application</ButtonLink>}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Sent" value={o.total.sent} icon={<Send className="size-4" aria-hidden />} hint={o.unsent ? `${o.unsent} saved, not sent` : "Applied or later"} />
            <StatTile label="Response rate" value={pct(o.total.response_rate)} icon={<MailCheck className="size-4" aria-hidden />} hint={`${o.total.responded} reached screening`} />
            <StatTile label="Interview rate" value={pct(o.total.interview_rate)} icon={<Users className="size-4" aria-hidden />} hint={`${o.total.interviewed} interviewed`} />
            <StatTile
              label="Median wait"
              value={o.median_days_to_response == null ? "–" : `${o.median_days_to_response}d`}
              icon={<Clock className="size-4" aria-hidden />}
              hint="Sent to first response"
            />
          </div>

          <Headline groups={o.by_resume} />

          <Card>
            <CardHeader title="Your funnel" description="Status history counts: an interview that ended in a rejection still counts as an interview." />
            <FunnelSteps funnel={o.total} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By resume version" description="The exact version recorded on each application." />
              <GroupBars groups={o.by_resume} minSample={o.min_sample} highlightBest />
            </Card>
            <Card>
              <CardHeader title="By match score" description="The latest match for each application's job." />
              <GroupBars groups={o.by_match} minSample={o.min_sample} />
            </Card>
          </div>
          <p className="font-mono text-label-sm text-on-surface-variant">
            Method {o.method_version}. Groups under {o.min_sample} sent applications are shown but not ranked: rates on so few
            are mostly chance.
          </p>
        </div>
      )}
    </div>
  );
}

/** One plain sentence comparing the best and worst resume versions, only when both are comparable. */
export function headline(groups: OutcomeGroup[]): string | null {
  const comparable = groups.filter((g) => g.enough_data && g.funnel.response_rate != null);
  if (comparable.length < 2) return null;
  const best = comparable[0]!;
  const worst = comparable[comparable.length - 1]!;
  const b = best.funnel.response_rate ?? 0;
  const w = worst.funnel.response_rate ?? 0;
  if (b <= w) return null;
  if (w === 0) return `“${best.label}” got ${pct(b)} replies; “${worst.label}” got none so far.`;
  const ratio = (b / w).toFixed(1).replace(/\.0$/, "");
  return `“${best.label}” gets replies ${ratio}× as often as “${worst.label}” (${pct(b)} vs ${pct(w)}).`;
}

function Headline({ groups }: { groups: OutcomeGroup[] }) {
  const text = headline(groups);
  if (!text) return null;
  return (
    <section className="relative isolate overflow-hidden rounded-card bg-ink-deep p-6 text-on-ink shadow-level-2">
      <div aria-hidden className="absolute -right-12 -top-12 -z-10 size-48 rounded-full bg-primary/40 blur-3xl" />
      <p className="inline-flex items-center gap-2 text-label-sm uppercase tracking-wider text-on-ink-muted">
        <Trophy className="size-4 text-accent" aria-hidden /> What your applications say
      </p>
      <p className="mt-2 max-w-3xl font-display text-headline-md leading-snug">{text}</p>
      <p className="mt-2 text-body-sm text-on-ink-muted">Correlation from your own history, not a guarantee: role, timing and company matter too.</p>
    </section>
  );
}

const STEPS: { key: keyof Funnel; label: string; tone: string }[] = [
  { key: "sent", label: "Sent", tone: "bg-primary-fixed-dim" },
  { key: "responded", label: "Responded", tone: "bg-primary" },
  { key: "interviewed", label: "Interviewed", tone: "bg-success" },
  { key: "offers", label: "Offers", tone: "bg-accent" },
];

function FunnelSteps({ funnel }: { funnel: Funnel }) {
  const max = Math.max(1, funnel.sent);
  return (
    <ol className="space-y-3">
      {STEPS.map(({ key, label, tone }) => {
        const n = funnel[key] as number;
        return (
          <li key={key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
            <span className="text-label-md text-on-surface">{label}</span>
            <div className="h-7 overflow-hidden rounded-full bg-surface-container">
              <div
                className={cn("h-full animate-fill rounded-full", tone)}
                style={{ width: `${Math.max(n ? 4 : 0, (n / max) * 100)}%` }}
              />
            </div>
            <span className="tnum min-w-16 text-right font-mono text-code-sm text-on-surface-variant">
              {n}
              {key !== "sent" ? ` · ${pct(funnel.sent ? n / funnel.sent : null)}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function GroupBars({ groups, minSample, highlightBest = false }: { groups: OutcomeGroup[]; minSample: number; highlightBest?: boolean }) {
  const best = highlightBest ? groups.find((g) => g.enough_data && g.funnel.responded > 0) : undefined;
  return (
    <ul className="space-y-4">
      {groups.map((g) => (
        <li key={g.label}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-label-md font-semibold text-on-surface">{g.label}</span>
            {g === best ? (
              <Pill tone="matched">
                <Trophy className="size-3" aria-hidden /> Best so far
              </Pill>
            ) : null}
            {!g.enough_data ? <Pill tone="neutral">{`Under ${minSample}: not ranked`}</Pill> : null}
            <span className="tnum ml-auto font-mono text-code-sm text-on-surface-variant">
              {g.funnel.sent} sent · {pct(g.funnel.response_rate)} reply · {pct(g.funnel.interview_rate)} interview
            </span>
          </div>
          <div
            className={cn("relative h-3 overflow-hidden rounded-full bg-surface-container", !g.enough_data && "opacity-60")}
            role="img"
            aria-label={`${g.label}: ${pct(g.funnel.response_rate)} responded, ${pct(g.funnel.interview_rate)} interviewed`}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/45" style={{ width: `${(g.funnel.response_rate ?? 0) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${(g.funnel.interview_rate ?? 0) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
