import { Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useJobList } from "@/hooks/useJobs";
import { useMasterSummary } from "@/hooks/useResumes";
import { Field, Textarea } from "@/components/ui/Field";
import { useQuickTailor, useStartTailoring, useTailoringList } from "@/hooks/useTailoring";
import { ApiError } from "@/services/apiClient";
import { formatDate, PageHeader } from "@/pages/resumes/common";

export function TailorIndexPage() {
  const sessions = useTailoringList();
  const jobs = useJobList();
  const { master, isPending: masterPending } = useMasterSummary();
  if (sessions.isPending || jobs.isPending || masterPending) return <PageLoading label="Loading" />;
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Tailor Resume"
        photo="register"
        description="Paste a job description and a resume, and get a copy of the resume aimed at that job. Nothing is invented: every change is checked against the resume you paste."
      />
      <QuickTailor />
      <h2 className="mb-3 mt-8 font-display text-headline-sm text-on-surface">Or tailor your master resume for a saved job</h2>
      {!master ? (
        <EmptyState
          title="Add your master resume first"
          description="Tailoring starts from your master resume."
          action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
        />
      ) : jobs.data.length === 0 ? (
        <EmptyState
          title="Analyze a job first"
          description="Tailoring proposes changes for a specific job description."
          action={<ButtonLink to="/jobs/new" variant="primary">Analyze a job</ButtonLink>}
        />
      ) : (
        <StartTailoring jobs={jobs.data.map((j) => ({ id: j.id, label: [j.title, j.company].filter(Boolean).join(" · ") }))} />
      )}

      <section className="mt-8" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="mb-3 font-display text-headline-sm text-on-surface">Your tailoring sessions</h2>
        {sessions.data.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No sessions yet.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.data.map((s) => (
              <li key={s.id}>
                <Card className="relative hover:border-primary">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={s.status === "finalized" && s.result_resume_id ? `/resumes/${s.result_resume_id}` : `/tailor/${s.id}`}
                        className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary"
                      >
                        {s.job_title}
                      </Link>
                      <p className="mt-1 text-body-sm text-on-surface-variant">
                        From master version {s.base_version} · {formatDate(s.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.status === "finalized" ? <Pill tone="matched">Tailored resume created</Pill> : <Pill tone="info">In review</Pill>}
                      <Pill>{s.accepted} of {s.total} accepted</Pill>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StartTailoring({ jobs }: { jobs: { id: string; label: string }[] }) {
  const id = useId();
  // "Tailor" on a job's page arrives with ?job=<id>: start with that job picked.
  const [params] = useSearchParams();
  const wanted = params.get("job");
  const [jobId, setJobId] = useState(jobs.some((j) => j.id === wanted) ? wanted! : (jobs[0]?.id ?? ""));
  const start = useStartTailoring();
  const navigate = useNavigate();
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader id={`${id}-title`} title="Start tailoring" description="Pick the job to tailor your master resume for." />
      {start.isError ? (
        <Notice tone={start.error instanceof ApiError && start.error.status === 422 ? "info" : "critical"} title="No session started" className="mb-4">
          {start.error instanceof ApiError ? start.error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={`${id}-job`} className="block text-label-md text-on-surface">Job</label>
          <select
            id={`${id}-job`}
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="h-10 w-full rounded-control border border-hairline bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary focus:shadow-focus focus:outline-none"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </select>
        </div>
        <Button
          loading={start.isPending}
          icon={<Sparkles className="size-4" aria-hidden />}
          onClick={() => start.mutate(jobId, { onSuccess: (s) => navigate(`/tailor/${s.id}`) })}
        >
          Propose changes
        </Button>
      </div>
    </Card>
  );
}

const MIN_RESUME = 200;
const MIN_JOB = 50;

function QuickTailor() {
  const id = useId();
  const [jobText, setJobText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const quick = useQuickTailor();
  const navigate = useNavigate();
  const ready = jobText.trim().length >= MIN_JOB && resumeText.trim().length >= MIN_RESUME;
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader
        id={`${id}-title`}
        title="Paste and tailor"
        description="Works for your own resume or a candidate's. The pasted resume is saved on its own and never replaces your master."
      />
      {quick.isError ? (
        <Notice tone="critical" title="Couldn't tailor" className="mb-4">
          {quick.error instanceof ApiError ? quick.error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Job description" hint={`The posting you're targeting (at least ${MIN_JOB} characters).`}>
          {({ id: fieldId, describedBy }) => (
            <Textarea id={fieldId} rows={16} aria-describedby={describedBy} value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the job description here" />
          )}
        </Field>
        <Field label="Resume" hint={`The whole resume as text (at least ${MIN_RESUME} characters).`}>
          {({ id: fieldId, describedBy }) => (
            <Textarea id={fieldId} rows={16} aria-describedby={describedBy} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste the resume here" />
          )}
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!ready}
          loading={quick.isPending}
          icon={<Sparkles className="size-4" aria-hidden />}
          onClick={() => quick.mutate({ resumeText, jobText }, { onSuccess: (s) => navigate(`/tailor/${s.id}`) })}
        >
          Tailor this resume
        </Button>
        <p className="text-body-sm text-on-surface-variant" aria-live="polite">
          {quick.isPending ? "Reading both and rewriting for the job. This can take up to a minute." : "You'll review every change before the tailored resume is made."}
        </p>
      </div>
    </Card>
  );
}
