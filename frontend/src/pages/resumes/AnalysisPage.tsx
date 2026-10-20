import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/Score";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useAnalysis, useMasterSummary, useResume } from "@/hooks/useResumes";
import type { Analysis } from "@/services/resumeService";
import { PageHeader } from "./common";

const ICON = {
  pass: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
  warn: <CircleAlert className="size-5 shrink-0 text-warning" aria-hidden />,
  fail: <XCircle className="size-5 shrink-0 text-critical" aria-hidden />,
};
const STATUS_TEXT = { pass: "Passed", warn: "Could improve", fail: "Missing" };

/** /analysis: jump to the master resume's analysis, or explain what is needed first. */
export function AnalysisRedirect() {
  const { master, isPending, isError, error } = useMasterSummary();
  if (isPending) return <PageLoading />;
  if (isError) return <ErrorState error={error} />;
  if (master) return <Navigate to={`/resumes/${master.id}/analysis`} replace />;
  return (
    <EmptyState title="Nothing to analyze yet" description="Upload or create your master resume first."
      action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>} />
  );
}

export function AnalysisPage() {
  const { resumeId = "" } = useParams();
  const resume = useResume(resumeId);
  const analysis = useAnalysis(resumeId);
  if (analysis.isPending || resume.isPending) return <PageLoading label="Analyzing" />;
  if (analysis.isError) return <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />;
  if (resume.isError) return <ErrorState error={resume.error} />;
  const a = analysis.data;
  const groups: Record<"fail" | "warn" | "pass", Analysis["checks"]> = { fail: [], warn: [], pass: [] };
  for (const check of a.checks) groups[check.status].push(check);

  return (
    <div>
      <PageHeader title="Resume analysis" photo="analysis" description={`${resume.data.title} · version ${a.version}`}
        back={{ to: `/resumes/${resumeId}`, label: resume.data.title }}
        actions={<ButtonLink to={`/resumes/${resumeId}/edit`} variant="primary">Edit resume</ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col items-center text-center">
          <ScoreRing value={a.score} size={140} label="Resume checks" />
          <p className="mt-4 text-label-md text-on-surface">Completeness and writing checks</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Share of {a.checks.length} rule-based checks passed (method {a.method_version}). It measures resume
            conventions, not how employers will respond.
          </p>
        </Card>
        <div className="space-y-6">
          {(["fail", "warn", "pass"] as const).map((status) =>
            groups[status].length ? (
              <Card key={status} aria-labelledby={`grp-${status}`}>
                <CardHeader id={`grp-${status}`} title={`${STATUS_TEXT[status]} (${groups[status].length})`} />
                <ul className="divide-y divide-hairline">
                  {groups[status].map((c) => (
                    <li key={c.id} className="flex gap-3 py-3">
                      {ICON[c.status]}
                      <div className="min-w-0">
                        <p className="text-label-md text-on-surface">{c.title} <span className="sr-only">({STATUS_TEXT[c.status]})</span></p>
                        <p className="text-body-md text-on-surface-variant">{c.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
