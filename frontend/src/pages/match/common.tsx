import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useDeleteControls } from "@/hooks/useDeleteControls";
import { JOB_DELETE_NOTE, useDeleteJob, useJobList } from "@/hooks/useJobs";
import { useMatchList } from "@/hooks/useMatches";
import { scoreLevel } from "@/lib/score";
import type { JobSummary } from "@/services/jobService";
import type { EvidenceRef, MatchStatus, MatchSummary, Severity } from "@/services/matchService";
import { PageHeader } from "@/pages/resumes/common";

export const STATUS_ICON: Record<MatchStatus, React.ReactNode> = {
  strong: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
  partial: <CircleDashed className="size-5 shrink-0 text-warning" aria-hidden />,
  missing: <XCircle className="size-5 shrink-0 text-critical" aria-hidden />,
};

export const SEVERITY_TONE: Record<Severity, PillTone> = {
  critical: "critical",
  high: "missing",
  medium: "info",
  low: "neutral",
};

const SCORE_TONE = { critical: "critical", warning: "missing", success: "matched" } as const;

export function ScorePill({ value }: { value: number }) {
  return <Pill tone={SCORE_TONE[scoreLevel(value)]}>{value}/100</Pill>;
}

export function EvidenceList({ evidence }: { evidence: EvidenceRef[] }) {
  if (!evidence.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {evidence.map((e, i) => (
        <li key={`${e.entity_id ?? e.kind}-${i}`} className="rounded-control bg-surface-container-low px-3 py-2 text-body-sm">
          <span className="text-label-sm text-on-surface-variant">{e.label}</span>
          <span className="block text-on-surface">“{e.excerpt}”</span>
        </li>
      ))}
    </ul>
  );
}

/** Jobs with their latest match score; each links to `${to(jobId)}`. Shared by Job Match and Skill Gaps. */
export function JobMatchIndex({ title, description, to }: { title: string; description: string; to: (jobId: string) => string }) {
  const jobs = useJobList();
  const matches = useMatchList();
  if (jobs.isPending || matches.isPending) return <PageLoading label="Loading jobs" />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;
  if (matches.isError) return <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />;
  const byJob = new Map(matches.data.map((m) => [m.job_id, m]));

  return (
    <div>
      <PageHeader title={title} description={description} photo="match" />
      {jobs.data.length === 0 ? (
        <EmptyState
          title="No jobs to match yet"
          description="Analyze a job description first, then match your master resume against it."
          action={<ButtonLink to="/jobs/new" variant="primary">Analyze a job</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {jobs.data.map((job) => (
            <li key={job.id}>
              <MatchJobCard job={job} match={byJob.get(job.id)} to={to(job.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A saved job with its latest match. Each card is a job, so deleting removes the saved job. */
function MatchJobCard({ job, match: m, to }: { job: JobSummary; match: MatchSummary | undefined; to: string }) {
  const remove = useDeleteJob(job.id);
  const del = useDeleteControls({ name: job.title, note: `This removes the saved job everywhere. ${JOB_DELETE_NOTE}`, action: remove });
  return (
    <Card className="relative hover:border-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to={to} className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary">
            {job.title}
          </Link>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {[job.company, job.location].filter(Boolean).join(" · ") || "Company not set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m ? (
            <>
              <ScorePill value={m.overall} />
              {m.stale ? <Pill tone="missing">Out of date</Pill> : null}
            </>
          ) : (
            <Pill>Not matched yet</Pill>
          )}
          {del.button}
        </div>
      </div>
      {del.confirm}
    </Card>
  );
}
