import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText, Sparkles, UploadCloud } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useJobList } from "@/hooks/useJobs";
import { useMasterSummary } from "@/hooks/useResumes";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { AiProgress } from "@/components/ui/AiProgress";
import { useDeleteControls } from "@/hooks/useDeleteControls";
import {
  tailoringKeys,
  useDiscardTailoring,
  useQuickTailor,
  useStartTailoring,
  useTailorWithAnswers,
  useTailoringList,
} from "@/hooks/useTailoring";
import { cn } from "@/lib/cn";
import { ApiError } from "@/services/apiClient";
import { tailoringService, type Session, type SessionSummary, type SkillAnswer } from "@/services/tailoringService";
import { formatDate, PageHeader } from "@/pages/resumes/common";

export function TailorIndexPage() {
  const sessions = useTailoringList();
  const jobs = useJobList();
  const { master, data: resumes, isPending: masterPending } = useMasterSummary();
  // Archived masters are resumes pasted for one session, not the user's own master.
  const pasted = new Set((resumes ?? []).filter((r) => r.kind === "master" && r.status === "archived").map((r) => r.id));
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
      <QuickTailor master={master} />
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
                <SessionCard session={s} pasted={pasted.has(s.master_resume_id)} />
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
// What the two waits really do, in order (see AiProgress for how the timing is shown).
const READING_STEPS = ["Reading the resume", "Reading the job description", "Finding the skills the job asks for"];
const TAILOR_STEPS = [
  "Adding the skills you confirmed",
  "Keeping only what the job needs",
  "Rewriting the headline, summary and bullets",
  "Checking every fact against the resume",
];
const MIN_JOB = 50;

function QuickTailor({ master }: { master: { title: string; current_version: number } | null }) {
  const id = useId();
  const [jobText, setJobText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [useMaster, setUseMaster] = useState(false);
  const quick = useQuickTailor();
  const tailor = useTailorWithAnswers();
  const [started, setStarted] = useState<Session | null>(null);
  const upload = useMutation({ mutationFn: tailoringService.resumeText, onSuccess: setResumeText });
  const navigate = useNavigate();
  const ready = jobText.trim().length >= MIN_JOB && (useMaster || resumeText.trim().length >= MIN_RESUME);
  const error = quick.error ?? upload.error ?? tailor.error;
  const run = (s: Session, skills: SkillAnswer[]) =>
    tailor.mutate({ id: s.id, skills }, { onSuccess: (done) => navigate(`/tailor/${done.id}`) });
  const client = useQueryClient();
  const back = (s: Session) => {
    setStarted(null); // the pasted text is still here to change; the draft session goes
    void tailoringService.discard(s.id).then(() => client.invalidateQueries({ queryKey: tailoringKeys.list() }));
  };
  if (started) {
    return (
      <SkillQuestions
        session={started}
        pending={tailor.isPending}
        error={tailor.error}
        onTailor={(skills) => run(started, skills)}
        onBack={() => back(started)}
      />
    );
  }
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader
        id={`${id}-title`}
        title="Step 1: Paste the job and the resume"
        description="Works for your own resume or a candidate's. A pasted or uploaded resume is saved on its own and never replaces your master."
      />
      {error ? (
        <Notice tone="critical" title={upload.isError ? "Couldn't read that file" : "Couldn't tailor"} className="mb-4">
          {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Job description" hint={`The posting you're targeting (at least ${MIN_JOB} characters).`}>
          {({ id: fieldId, describedBy }) => (
            <Textarea id={fieldId} rows={16} aria-describedby={describedBy} value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the job description here" />
          )}
        </Field>
        <div className="space-y-3">
          {useMaster && master ? (
            <div className="space-y-1.5">
              <p className="text-label-md text-on-surface">Resume</p>
              <div className="flex min-h-[22rem] flex-col items-center justify-center gap-2 rounded-control border border-primary-fixed-dim bg-surface-container-low p-6 text-center">
                <FileText className="size-8 text-primary" aria-hidden />
                <p className="font-display text-headline-sm text-on-surface">{master.title}</p>
                <p className="text-body-md text-on-surface-variant">Version {master.current_version}. Tailoring makes a copy; your master stays as it is.</p>
                <Button size="sm" variant="secondary" onClick={() => setUseMaster(false)}>Paste a resume instead</Button>
              </div>
            </div>
          ) : (
            <Field label="Resume" hint={`Paste or upload the whole resume (at least ${MIN_RESUME} characters).`}>
              {({ id: fieldId, describedBy }) => (
                <Textarea id={fieldId} rows={14} aria-describedby={describedBy} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste the resume here" />
              )}
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-hairline px-3 text-label-md text-on-surface hover:bg-surface-container-low focus-within:shadow-focus", upload.isPending && "opacity-60")}>
              <UploadCloud className="size-4" aria-hidden />
              {upload.isPending ? "Reading…" : "Upload PDF, DOCX or TXT"}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUseMaster(false);
                    upload.mutate(file);
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {master ? (
              <Button size="sm" variant={useMaster ? "primary" : "secondary"} icon={<FileText className="size-4" aria-hidden />} onClick={() => setUseMaster(!useMaster)} aria-pressed={useMaster}>
                Use my master resume
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!ready}
          loading={quick.isPending || tailor.isPending}
          icon={<ArrowRight className="size-4" aria-hidden />}
          onClick={() =>
            quick.mutate(
              { resumeText: useMaster ? null : resumeText, jobText },
              // Nothing to ask when the resume already shows every skill the job names.
              { onSuccess: (s) => (s.missing_skills.length ? setStarted(s) : run(s, [])) },
            )
          }
        >
          Next: check the job&apos;s skills
        </Button>
        {quick.isPending || tailor.isPending ? null : (
          <p className="text-body-sm text-on-surface-variant">Next, you&apos;ll say which of the job&apos;s skills you&apos;ve used.</p>
        )}
      </div>
      {quick.isPending ? (
        <div className="mt-4"><AiProgress title="Getting your questions ready" seconds={6} steps={READING_STEPS} /></div>
      ) : tailor.isPending ? (
        <div className="mt-4"><AiProgress title="Tailoring with maximum focus" seconds={35} steps={TAILOR_STEPS} /></div>
      ) : null}
    </Card>
  );
}

type Answer = { where: string; note: string };

/** Step 2: the job's skills the resume doesn't show. Only the ones marked "Yes" are added. */
function SkillQuestions({
  session: s,
  pending,
  error,
  onTailor,
  onBack,
}: {
  session: Session;
  pending: boolean;
  error: Error | null;
  onTailor: (skills: SkillAnswer[]) => void;
  onBack: () => void;
}) {
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const set = (skill: string, answer: Answer | null) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (answer) next[skill] = answer;
      else delete next[skill];
      return next;
    });
  const yes = Object.entries(answers).map(([skill, a]) => ({ skill, ...a }));
  const count = s.missing_skills.length;
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader
        id={`${id}-title`}
        title="Step 2: Have you used these?"
        description={`The job asks for ${count} skill${count === 1 ? "" : "s"} the resume doesn't show. Mark the ones you've really used and say where: they'll appear in the tailored resume. Everything left at "No" stays out.`}
      />
      {error ? (
        <Notice tone="critical" title="Couldn't tailor" className="mb-4">
          {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
      <ul className="space-y-2">
        {s.missing_skills.map((skill) => {
          const a = answers[skill];
          return (
            <li key={skill} className={cn("rounded-control border p-3", a ? "border-primary-fixed-dim" : "border-hairline")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body-md font-semibold text-on-surface">{skill}</span>
                <div role="group" aria-label={`Have you used ${skill}?`} className="flex gap-1">
                  <Button size="sm" variant={a ? "secondary" : "primary"} aria-pressed={!a} onClick={() => set(skill, null)}>No</Button>
                  <Button size="sm" variant={a ? "primary" : "secondary"} aria-pressed={Boolean(a)} onClick={() => set(skill, a ?? { where: s.places[0]?.id ?? "", note: "" })}>Yes</Button>
                </div>
              </div>
              {a ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label={`Where did you use ${skill}?`}>
                    {({ id: fieldId, describedBy }) => (
                      <Select id={fieldId} aria-describedby={describedBy} value={a.where} onChange={(e) => set(skill, { ...a, where: e.target.value })}>
                        {s.places.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        <option value="">Somewhere else (course, personal practice)</option>
                      </Select>
                    )}
                  </Field>
                  <Field
                    label={`What did you do with ${skill}?`}
                    hint={a.where ? "Your own words, with real numbers if you have them. This becomes a bullet there." : "Optional. Without a role or project it's added to the skills list only."}
                  >
                    {({ id: fieldId, describedBy }) => (
                      <Textarea id={fieldId} aria-describedby={describedBy} rows={2} maxLength={300} value={a.note} onChange={(e) => set(skill, { ...a, note: e.target.value })} />
                    )}
                  </Field>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button loading={pending} icon={<Sparkles className="size-4" aria-hidden />} onClick={() => onTailor(yes)}>
          Tailor with maximum focus
        </Button>
        <Button variant="ghost" disabledReason={pending ? "Tailoring is under way" : undefined} icon={<ArrowLeft className="size-4" aria-hidden />} onClick={onBack}>
          Back to the text
        </Button>
        {pending ? null : (
          <p className="text-body-sm text-on-surface-variant">
            {yes.length} of {count} marked as used. Only add skills you really have; interviewers will ask.
          </p>
        )}
      </div>
      {pending ? (
        <div className="mt-4"><AiProgress title="Tailoring with maximum focus" seconds={35} steps={TAILOR_STEPS} /></div>
      ) : null}
    </Card>
  );
}

/**
 * One tailoring session. Removing it takes it off the list only: a finished one stays on record,
 * so the tailored resume it made still knows its job (for the ATS check and interview prep).
 */
function SessionCard({ session: s, pasted }: { session: SessionSummary; pasted: boolean }) {
  const discard = useDiscardTailoring(s.id);
  const del = useDeleteControls({
    name: s.job_title,
    verb: "Remove",
    confirmLabel: "Remove session",
    note:
      s.status === "finalized"
        ? "It leaves this list. The tailored resume it created stays in My Resumes; delete it there if you no longer need it."
        : "It leaves this list, with the changes still waiting for review.",
    action: discard,
  });
  return (
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
            {pasted ? "From the pasted resume" : `From master version ${s.base_version}`} · {formatDate(s.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.status === "finalized" ? <Pill tone="matched">Tailored resume created</Pill> : <Pill tone="info">In review</Pill>}
          <Pill>{s.accepted} of {s.total} accepted</Pill>
          {del.button}
        </div>
      </div>
      {del.confirm}
    </Card>
  );
}
