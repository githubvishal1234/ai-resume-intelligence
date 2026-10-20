import { GitCompareArrows, Network, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ScoreBar, ScoreRing } from "@/components/ui/Score";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useJob } from "@/hooks/useJobs";
import { useLatestMatch, useRunMatch } from "@/hooks/useMatches";
import { useMasterSummary } from "@/hooks/useResumes";
import { ApiError } from "@/services/apiClient";
import { TIER_LABEL, type Tier } from "@/services/jobService";
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  type Match,
  type MatchStatus,
  type Severity,
  type SkillGap,
} from "@/services/matchService";
import { formatDate, PageHeader } from "@/pages/resumes/common";
import { PlanProofButton } from "@/pages/insights/PlanProofButton";
import { EvidenceList, JobMatchIndex, STATUS_ICON } from "./common";

export function MatchIndexPage() {
  return (
    <JobMatchIndex
      title="Job Match"
      description="How well your master resume covers each job, with the evidence behind every score."
      to={(id) => `/jobs/${id}/match`}
    />
  );
}

export function GapIndexPage() {
  return (
    <JobMatchIndex
      title="Skill Gap Matrix"
      description="Pick a job to see which of its skills your resume shows, only lists, or is missing."
      to={(id) => `/jobs/${id}/gaps`}
    />
  );
}

/** Loads the job and its latest match; offers to run one when there is none or it is out of date. */
function WithMatch({ view, children }: { view: "match" | "gaps"; children: (match: Match) => ReactNode }) {
  const { jobId = "" } = useParams();
  const job = useJob(jobId);
  const latest = useLatestMatch(jobId);
  const run = useRunMatch(jobId);
  const { master, isPending: masterPending } = useMasterSummary();

  if (job.isPending || latest.isPending || masterPending) return <PageLoading label="Loading match" />;
  if (job.isError) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  if (latest.isError) return <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />;
  const j = job.data;
  const m = latest.data;
  const title = view === "match" ? "Job match" : "Skill gaps";
  const runError =
    run.error instanceof ApiError ? run.error.message : run.isError ? "Something went wrong. Please try again." : null;
  const runButton = (label: string) => (
    <Button
      variant={m ? "secondary" : "primary"}
      loading={run.isPending}
      icon={<RefreshCw className="size-4" aria-hidden />}
      onClick={() => run.mutate()}
    >
      {label}
    </Button>
  );

  return (
    <div>
      <PageHeader
        title={`${title}: ${j.title}`}
        description={
          m
            ? `${m.resume_title} · version ${m.resume_version} · matched ${formatDate(m.created_at)}`
            : [j.company, j.location].filter(Boolean).join(" · ") || undefined
        }
        back={{ to: `/jobs/${j.id}`, label: j.title }}
        actions={
          m ? (
            <>
              {view === "match" ? (
                <ButtonLink to={`/jobs/${j.id}/gaps`}>
                  <Network className="size-4" aria-hidden /> Skill gaps
                </ButtonLink>
              ) : (
                <ButtonLink to={`/jobs/${j.id}/match`}>
                  <GitCompareArrows className="size-4" aria-hidden /> Requirement match
                </ButtonLink>
              )}
              {runButton("Re-run match")}
            </>
          ) : null
        }
      />
      {runError ? (
        <Notice tone="critical" title="Could not run the match" className="mb-4">
          {runError}
        </Notice>
      ) : null}
      {!m ? (
        master ? (
          <EmptyState
            icon={<GitCompareArrows className="size-8" aria-hidden />}
            title="Not matched yet"
            description={`Compare "${master.title}" (version ${master.current_version}) with this job's requirements. Your resume is only read, never changed.`}
            action={runButton("Match my resume")}
          />
        ) : (
          <EmptyState
            title="Add your master resume first"
            description="Matching compares your master resume with this job's requirements."
            action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
          />
        )
      ) : (
        <>
          {m.stale ? (
            <Notice tone="warning" title="This match is out of date" className="mb-4" action={runButton("Re-run match")}>
              Your resume or the job analysis changed after this match was computed.
            </Notice>
          ) : null}
          {children(m)}
        </>
      )}
    </div>
  );
}

const STATUS_ORDER: MatchStatus[] = ["missing", "partial", "strong"];
const TIER_ORDER: Tier[] = ["required", "preferred", "nice_to_have"];

export function MatchPage() {
  return (
    <WithMatch view="match">
      {(m) => {
        const r = m.result;
        return (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-6">
              <Card className="flex animate-rise flex-col items-center border-primary-fixed-dim bg-primary-fixed text-center">
                <ScoreRing value={r.overall} size={140} label="Match score" />
                <p className="mt-4 rounded-full bg-surface-container-lowest px-3 py-1 text-label-md font-semibold text-on-surface">Rule-based match</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  How much of this posting your resume shows evidence for (method {r.method_version}). It is not a
                  prediction of how an employer will respond.
                </p>
              </Card>
              <Card aria-labelledby="sub-title" className="animate-rise [animation-delay:100ms]">
                <CardHeader id="sub-title" title="Breakdown" />
                <ul className="space-y-5">
                  {r.subscores.map((s) => (
                    <li key={s.key}>
                      {s.score === null ? (
                        <p className="flex items-baseline justify-between gap-3 text-label-md text-on-surface">
                          {s.label}
                          <span className="font-mono text-code-sm text-on-surface-variant">Not scored</span>
                        </p>
                      ) : (
                        <ScoreBar label={`${s.label} (weight ${s.weight})`} value={s.score} />
                      )}
                      <p className="mt-1 text-body-sm text-on-surface-variant">{s.explanation}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-body-sm text-on-surface-variant">
                  Weights are a default and may change. Parts that don't apply to this job are left out.
                </p>
              </Card>
            </div>
            <div className="space-y-6">
              {TIER_ORDER.map((tier) => {
                const items = r.requirements
                  .filter((q) => q.tier === tier)
                  .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
                if (!items.length) return null;
                const strong = items.filter((q) => q.status === "strong").length;
                return (
                  <Card key={tier} aria-labelledby={`tier-${tier}`} className="animate-rise [animation-delay:150ms]">
                    <CardHeader id={`tier-${tier}`} title={`${TIER_LABEL[tier]} (${strong} of ${items.length} met)`} />
                    <ul className="space-y-2.5">
                      {items.map((q) => (
                        <li key={q.requirement_id} className="lift flex gap-3 rounded-control border border-hairline bg-surface-container-lowest p-3.5">
                          {STATUS_ICON[q.status]}
                          <div className="min-w-0 flex-1">
                            <p className="text-body-md text-on-surface">
                              {q.text} <span className="sr-only">({STATUS_LABEL[q.status]})</span>
                            </p>
                            <p className="mt-1 text-body-sm text-on-surface-variant">{q.reason}</p>
                            <EvidenceList evidence={q.evidence} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
              {r.keywords_missing.length ? (
                <Card aria-labelledby="kw-missing">
                  <CardHeader
                    id="kw-missing"
                    title="Frequent terms not in your resume"
                    description="Add them only where they truthfully describe your work."
                  />
                  <ul className="flex flex-wrap gap-1.5">
                    {r.keywords_missing.map((k) => (
                      <li key={k}>
                        <Pill tone="missing">{k}</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        );
      }}
    </WithMatch>
  );
}

const SEVERITY_ORDER: (Severity | "none")[] = ["critical", "high", "medium", "low", "none"];
const SEVERITY_HELP: Record<Severity | "none", string> = {
  critical: "Required by the posting and not found in your resume.",
  high: "Preferred by the posting and not found.",
  medium: "Required, but only listed: no role or project shows it.",
  low: "Nice to have, only listed, or covered by an alternative.",
  none: "Shown in your experience or projects.",
};
const STATUS_SHORT: Record<MatchStatus, string> = { strong: "Shown", partial: "Listed only", missing: "Missing" };

export function GapPage() {
  return (
    <WithMatch view="gaps">
      {(m) => {
        const groups = new Map<Severity | "none", SkillGap[]>();
        for (const g of m.result.skills) {
          const key = g.severity ?? "none";
          groups.set(key, [...(groups.get(key) ?? []), g]);
        }
        if (!m.result.skills.length) {
          return (
            <EmptyState
              title="No skills to compare"
              description="The posting names no skills from the vocabulary, so there is no skill gap to show."
            />
          );
        }
        return (
          <div className="space-y-6">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Gap summary">
              {SEVERITY_ORDER.map((sev) => (
                <li key={sev} className="rounded-card border border-hairline bg-surface-container-lowest p-4">
                  <p className="text-label-md text-on-surface-variant">{sev === "none" ? "No gap" : SEVERITY_LABEL[sev]}</p>
                  <p className="tnum mt-1 font-display text-headline-md text-on-surface">{groups.get(sev)?.length ?? 0}</p>
                </li>
              ))}
            </ul>
            {SEVERITY_ORDER.map((sev) => {
              const items = groups.get(sev);
              if (!items?.length) return null;
              return (
                <Card key={sev} aria-labelledby={`sev-${sev}`} padded={false}>
                  <div className="p-5 pb-3 sm:p-6 sm:pb-3">
                    <CardHeader
                      id={`sev-${sev}`}
                      title={sev === "none" ? "No gap" : `${SEVERITY_LABEL[sev]} gaps`}
                      description={SEVERITY_HELP[sev]}
                    />
                  </div>
                  <div>
                    <table className="w-full text-left text-body-md">
                      <thead className="border-y border-hairline bg-surface-container-low text-label-md text-on-surface-variant">
                        <tr>
                          <th scope="col" className="px-4 py-2 sm:px-6">Skill</th>
                          <th scope="col" className="px-3 py-2">Posting</th>
                          <th scope="col" className="px-3 py-2">Your resume</th>
                          <th scope="col" className="hidden px-5 py-2 sm:table-cell sm:px-6">Where</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {items.map((g) => (
                          <tr key={g.skill}>
                            <th scope="row" className="px-4 py-3 font-medium text-on-surface sm:px-6">
                              {g.skill}
                            </th>
                            <td className="px-3 py-3">{TIER_LABEL[g.tier]}</td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1.5">
                                {STATUS_ICON[g.status]}
                                {STATUS_SHORT[g.status]}
                              </span>
                              {g.covered_by_alternative ? (
                                <span className="block text-body-sm text-on-surface-variant">Met by an alternative</span>
                              ) : g.status !== "strong" ? (
                                <span className="mt-1 block">
                                  <PlanProofButton skill={g.skill} jobId={m.job_id} />
                                </span>
                              ) : null}
                            </td>
                            <td className="hidden px-5 py-3 text-body-sm text-on-surface-variant sm:table-cell sm:px-6">
                              {g.evidence.length ? [...new Set(g.evidence.map((e) => e.label))].join(", ") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      }}
    </WithMatch>
  );
}
