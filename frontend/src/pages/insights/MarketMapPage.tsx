import { Check, Compass, Crosshair, Hammer, Telescope } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { ON_DARK_ACTIONS } from "@/components/ui/PhotoBanner";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { ScoreRing } from "@/components/ui/Score";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { useCreateProof, useMarket, useProofs } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/pages/resumes/common";
import type { SkillDemand } from "@/services/insightsService";

type Evidence = NonNullable<SkillDemand["status"]>;

export const EVIDENCE: Record<Evidence, { label: string; tone: PillTone; bar: string }> = {
  strong: { label: "Shown in your work", tone: "matched", bar: "bg-success" },
  partial: { label: "Only listed", tone: "missing", bar: "bg-warning" },
  missing: { label: "No evidence", tone: "critical", bar: "bg-critical" },
};

export function MarketMapPage() {
  const q = useMarket();
  const proofs = useProofs();
  const [filter, setFilter] = useState<Evidence | "all">("all");
  if (q.isPending) return <PageLoading label="Building your market map" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const m = q.data;
  const planned = new Set((proofs.data ?? []).map((p) => p.skill));
  const max = Math.max(1, ...m.skills.map((s) => s.weight));
  const shown = filter === "all" ? m.skills : m.skills.filter((s) => s.status === filter);

  return (
    <div>
      <PageHeader
        title="Market Map"
        photo="market"
        description="What the jobs you are targeting ask for, across every posting you saved, and how much of it your resume proves."
      />
      {m.jobs_analyzed === 0 ? (
        <EmptyState
          icon={<Telescope className="size-8" aria-hidden />}
          title="Save a few job postings first"
          description="The map is built from the jobs you analyze. Three or more gives a clearer picture of your market."
          action={<ButtonLink to="/jobs/new" variant="primary">Analyze a job</ButtonLink>}
        />
      ) : (
        <div className="space-y-6">
          {!m.has_master ? (
            <Notice tone="info" title="Add a master resume to see your coverage" className="mb-2">
              Demand is shown below; evidence needs a master resume to check against.
            </Notice>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="flex flex-wrap items-center gap-6">
              {m.coverage != null ? <ScoreRing value={m.coverage * 100} size={120} label="Market coverage" /> : <Compass className="size-16 text-outline" aria-hidden />}
              <div className="min-w-[14rem] flex-1">
                <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Market coverage</p>
                <p className="mt-1 text-body-lg text-on-surface">
                  {m.coverage != null
                    ? `Your master resume backs ${Math.round(m.coverage * 100)}% of the skill demand in ${m.jobs_analyzed} saved ${m.jobs_analyzed === 1 ? "job" : "jobs"}.`
                    : `${m.jobs_analyzed} saved ${m.jobs_analyzed === 1 ? "job" : "jobs"} analyzed.`}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">Required skills weigh 3, preferred 2, nice to have 1. Listed-only counts half.</p>
              </div>
            </Card>
            {m.top_gap ? <TopGap gap={m.top_gap} total={m.jobs_analyzed} planned={planned.has(m.top_gap.name)} /> : (
              <Card className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-full bg-success-surface text-success"><Check className="size-6" aria-hidden /></span>
                <p className="text-body-lg">Every in-demand skill is shown in your work. Keep the evidence current.</p>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title="Skill demand" description="Longest bar is the most asked-for skill across your saved jobs." />
            <div role="group" aria-label="Filter by evidence" className="mb-5 flex flex-wrap gap-2">
              {(["all", "missing", "partial", "strong"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "min-h-9 rounded-full border px-3.5 text-label-md transition-colors",
                    filter === f ? "border-primary bg-primary text-on-primary" : "border-hairline-strong text-on-surface-variant hover:border-outline",
                  )}
                >
                  {f === "all" ? "All" : EVIDENCE[f].label}
                </button>
              ))}
            </div>
            <ul className="space-y-3">
              {shown.map((s) => (
                <li key={s.name} className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr_15rem]">
                  <div className="min-w-0">
                    <p className="truncate text-label-md font-semibold text-on-surface" title={s.job_titles.join(", ")}>{s.name}</p>
                    <p className="truncate text-body-sm text-on-surface-variant">
                      <span className="tnum font-mono">{s.jobs}/{m.jobs_analyzed} jobs</span> · {s.category}
                    </p>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-surface-container" role="img" aria-label={`${s.name}: in ${s.jobs} of ${m.jobs_analyzed} jobs, ${s.status ? EVIDENCE[s.status].label : "not checked"}`}>
                    <div
                      className={cn("h-full animate-fill rounded-full", s.status ? EVIDENCE[s.status].bar : "bg-primary")}
                      style={{ width: `${Math.max(6, (s.weight / max) * 100)}%` }}
                    />
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                    {s.status ? <Pill tone={EVIDENCE[s.status].tone}>{EVIDENCE[s.status].label}</Pill> : null}
                    {s.required_in ? <Pill tone="neutral">{`Required in ${s.required_in}`}</Pill> : null}
                  </div>
                </li>
              ))}
              {shown.length === 0 ? <li className="text-body-md text-on-surface-variant">No skills in this group.</li> : null}
            </ul>
          </Card>
          <p className="font-mono text-label-sm text-on-surface-variant">
            Method {m.method_version}: skills recognised by the job analyzer, checked with the same evidence rules as Job Match.
          </p>
        </div>
      )}
    </div>
  );
}

function TopGap({ gap, total, planned }: { gap: SkillDemand; total: number; planned: boolean }) {
  const create = useCreateProof();
  return (
    <section className="relative isolate overflow-hidden rounded-card bg-ink-deep p-6 text-on-ink shadow-level-2">
      <div aria-hidden className="absolute -right-10 -top-10 -z-10 size-40 rounded-full bg-accent/25 blur-2xl" />
      <p className="inline-flex items-center gap-2 text-label-sm uppercase tracking-wider text-on-ink-muted">
        <Crosshair className="size-4" aria-hidden /> Biggest gap in your market
      </p>
      <p className="mt-2 font-display text-[32px] font-extrabold leading-tight">{gap.name}</p>
      <p className="mt-1 text-body-lg text-on-ink-muted">
        Asked for in {gap.jobs} of {total} saved {total === 1 ? "job" : "jobs"}
        {gap.required_in ? `, required in ${gap.required_in}` : ""}.{" "}
        {gap.status === "partial" ? "You list it, but no role or project shows it." : "Nothing on your resume shows it yet."}
      </p>
      <div className={cn("mt-5", ON_DARK_ACTIONS)}>
        {planned || create.isSuccess ? (
          <ButtonLink to="/proofs" variant="secondary">
            <Hammer className="size-4" aria-hidden /> Open the Proof Board
          </ButtonLink>
        ) : (
          <Button
            variant="primary"
            loading={create.isPending}
            onClick={() => create.mutate({ skill: gap.name })}
            icon={<Hammer className="size-4" aria-hidden />}
          >
            Plan a proof for {gap.name}
          </Button>
        )}
      </div>
      {create.isError ? <p className="mt-3 text-body-sm"><ApiErrorText error={create.error} /></p> : null}
    </section>
  );
}
