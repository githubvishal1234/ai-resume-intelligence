import { ChevronLeft, ChevronRight, MessagesSquare, Play, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  useAddAiQuestions,
  useCompletePractice,
  useCreatePrep,
  useDeletePrep,
  useEvaluateAnswer,
  usePracticeSession,
  usePrep,
  usePrepList,
  useSaveAnswer,
  useStartPractice,
} from "@/hooks/useInterview";
import { useJobList } from "@/hooks/useJobs";
import { useMasterSummary, useResumeList } from "@/hooks/useResumes";
import { cn } from "@/lib/cn";
import { ApiError } from "@/services/apiClient";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type PracticeSession,
  type PracticeSessionSummary,
  type PrepDetail,
  type Question,
} from "@/services/interviewService";
import { formatDate, PageHeader } from "@/pages/resumes/common";

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

// ---- index -----------------------------------------------------------------------------
export function InterviewIndexPage() {
  const preps = usePrepList();
  const jobs = useJobList();
  const { master, isPending: masterPending } = useMasterSummary();
  if (preps.isPending || jobs.isPending || masterPending) return <PageLoading label="Loading" />;
  if (preps.isError) return <ErrorState error={preps.error} onRetry={() => void preps.refetch()} />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Interview Prep"
        photo="interview"
        description="Questions built from a job's requirements, your resume's evidence and your skill gaps, with a place to practice your answers."
      />
      {!master ? (
        <EmptyState
          title="Add your master resume first"
          description="Questions point at the evidence in your resume."
          action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
        />
      ) : jobs.data.length === 0 ? (
        <EmptyState
          title="Analyze a job first"
          description="Questions are built for a specific job description."
          action={<ButtonLink to="/jobs/new" variant="primary">Analyze a job</ButtonLink>}
        />
      ) : (
        <BuildPrep jobs={jobs.data.map((j) => ({ id: j.id, label: [j.title, j.company].filter(Boolean).join(" · ") }))} />
      )}

      <section className="mt-8" aria-labelledby="preps-title">
        <h2 id="preps-title" className="mb-3 font-display text-headline-sm text-on-surface">Your question sets</h2>
        {preps.data.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No question sets yet.</p>
        ) : (
          <ul className="space-y-3">
            {preps.data.map((p) => (
              <li key={p.id}>
                <Card className="relative hover:border-primary">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/interview/${p.id}`}
                        className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary"
                      >
                        {p.job_title}
                      </Link>
                      <p className="mt-1 text-body-sm text-on-surface-variant">
                        {[p.company, `${p.resume_title ?? "Resume"} v${p.resume_version}`, formatDate(p.created_at)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone="brand">{p.question_count} questions</Pill>
                      <Pill>{p.session_count} practice sessions</Pill>
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

function BuildPrep({ jobs }: { jobs: { id: string; label: string }[] }) {
  const id = useId();
  const resumes = useResumeList();
  const create = useCreatePrep();
  const navigate = useNavigate();
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [resumeId, setResumeId] = useState("");
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader id={`${id}-t`} title="Build interview questions" description="Pick the job you're interviewing for." />
      {create.isError ? (
        <Notice tone="critical" title="Could not build questions" className="mb-4">
          {errorText(create.error)}
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-job`} className="block text-label-md text-on-surface">Job</label>
          <Select id={`${id}-job`} value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-resume`} className="block text-label-md text-on-surface">Resume</label>
          <Select id={`${id}-resume`} value={resumeId} onChange={(e) => setResumeId(e.target.value)} aria-describedby={`${id}-rh`}>
            <option value="">Best fit for this job</option>
            {(resumes.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.kind === "master" ? "Master: " : "Tailored: "}
                {r.title}
              </option>
            ))}
          </Select>
          <p id={`${id}-rh`} className="text-body-sm text-on-surface-variant">
            Best fit uses your newest tailored resume for this job, or your master resume.
          </p>
        </div>
      </div>
      <Button
        className="mt-4"
        loading={create.isPending}
        icon={<MessagesSquare className="size-4" aria-hidden />}
        onClick={() =>
          create.mutate({ jobId, resumeId: resumeId || null }, { onSuccess: (prep) => navigate(`/interview/${prep.id}`) })
        }
      >
        Build questions
      </Button>
    </Card>
  );
}

// ---- prep ------------------------------------------------------------------------------
export function PrepPage() {
  const { prepId = "" } = useParams();
  const prep = usePrep(prepId);
  const start = useStartPractice(prepId);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (prep.isPending) return <PageLoading label="Loading questions" />;
  if (prep.isError) return <ErrorState error={prep.error} onRetry={() => void prep.refetch()} />;
  const p = prep.data;
  const begin = (ids: string[] | null) =>
    start.mutate(ids, { onSuccess: (s) => navigate(`/interview/sessions/${s.id}`) });
  const toggle = (qid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });

  return (
    <div>
      <PageHeader
        title={`Interview questions: ${p.job_title}`}
        description={`${p.question_count} questions from ${p.resume_title ?? "your resume"} (version ${p.resume_version}) · ${p.method_version}`}
        back={{ to: "/interview", label: "Interview Prep" }}
        actions={
          <>
            <Button loading={start.isPending && selected.size === 0} icon={<Play className="size-4" aria-hidden />} onClick={() => begin(null)}>
              Practice all
            </Button>
            <Button
              variant="secondary"
              loading={start.isPending && selected.size > 0}
              disabledReason={selected.size ? undefined : "Tick the questions you want to practice"}
              onClick={() => begin(p.questions.filter((q) => selected.has(q.id)).map((q) => q.id))}
            >
              Practice selected ({selected.size})
            </Button>
          </>
        }
      />
      {start.isError ? (
        <Notice tone="critical" title="Could not start practice" className="mb-4">
          {errorText(start.error)}
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {CATEGORY_ORDER.map((category) => {
            const items = p.questions.filter((q) => q.category === category);
            if (!items.length) return null;
            return (
              <section key={category} aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className="mb-2 flex items-center gap-2 font-display text-headline-sm text-on-surface">
                  {CATEGORY_LABEL[category]} <Pill>{items.length}</Pill>
                </h2>
                <ul className="space-y-3">
                  {items.map((q) => (
                    <li key={q.id}>
                      <QuestionCard question={q} selected={selected.has(q.id)} onToggle={() => toggle(q.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="space-y-6">
          <AiQuestionsCard prep={p} />
          <SessionsCard prep={p} />
          <DeletePrep prep={p} />
        </div>
      </div>
    </div>
  );
}

function Evidence({ question: q }: { question: Question }) {
  if (!q.evidence.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-label-md text-on-surface-variant">From your resume</p>
      <ul className="space-y-1.5">
        {q.evidence.map((e, i) => (
          <li key={`${e.entity_id ?? e.kind}-${i}`} className="rounded-control bg-surface-container-low p-2.5 text-body-sm">
            <span className="text-label-md text-on-surface">{e.label}</span>
            <span className="block break-words text-on-surface-variant">“{e.excerpt}”</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tips({ question: q, open = false }: { question: Question; open?: boolean }) {
  return (
    <details className="mt-3" open={open}>
      <summary className="cursor-pointer text-label-md text-primary">How to answer</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-body-md text-on-surface">
        {q.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

function QuestionCard({ question: q, selected, onToggle }: { question: Question; selected: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <Card className={cn(selected && "border-primary")}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 accent-primary"
          aria-describedby={`${id}-why`}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-body-lg text-on-surface">
            {q.text}
          </label>
          {q.source === "ai" ? <Pill tone="brand" className="mt-1">AI-written</Pill> : null}
          <p id={`${id}-why`} className="mt-1 text-body-sm text-on-surface-variant">
            Why: {q.why}
          </p>
          <Evidence question={q} />
          <Tips question={q} />
        </div>
      </div>
    </Card>
  );
}

function AiQuestionsCard({ prep }: { prep: PrepDetail }) {
  const caps = useCapabilities();
  const add = useAddAiQuestions(prep.id);
  const id = useId();
  if (!caps.data?.ai.configured) return null;
  const count = prep.questions.filter((q) => q.source === "ai").length;
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader
        id={`${id}-t`}
        title="More questions from AI"
        description="The AI suggests questions this interviewer may ask, beyond the ones above. They are marked AI-written."
      />
      {add.isError ? (
        <Notice tone="critical" title="That didn't work" className="mb-3">
          {errorText(add.error)}
        </Notice>
      ) : null}
      <Button
        variant="secondary"
        loading={add.isPending}
        icon={<Sparkles className="size-4" aria-hidden />}
        onClick={() => add.mutate()}
      >
        {count ? "Suggest more" : "Suggest questions"}
      </Button>
      {count ? <p className="mt-2 text-body-sm text-on-surface-variant">{count} AI-written so far.</p> : null}
    </Card>
  );
}

function SessionsCard({ prep }: { prep: PrepDetail }) {
  const id = useId();
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader id={`${id}-t`} title="Practice sessions" />
      {prep.sessions.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">You haven't practiced this set yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {prep.sessions.map((s) => (
            <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link to={`/interview/sessions/${s.id}`} className="text-label-md text-primary hover:underline">
                {formatDate(s.created_at)}
              </Link>
              <p className="text-body-sm text-on-surface-variant">{sessionLine(s)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function sessionLine(s: PracticeSessionSummary): string {
  const parts = [
    s.status === "completed" ? "Finished" : "In progress",
    `${s.answered_count} of ${s.question_count} answered`,
    s.average_rating !== null ? `your rating ${s.average_rating}/5` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function DeletePrep({ prep }: { prep: PrepDetail }) {
  const remove = useDeletePrep(prep.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <Notice
      tone="critical"
      title="Delete this question set?"
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/interview", { replace: true }) })}
          >
            Delete question set
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      }
    >
      Its practice sessions and answers are removed too. This cannot be undone.
    </Notice>
  ) : (
    <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
      Delete question set
    </Button>
  );
}

// ---- practice --------------------------------------------------------------------------
export function PracticePage() {
  const { sessionId = "" } = useParams();
  const session = usePracticeSession(sessionId);
  const [index, setIndex] = useState(0);
  if (session.isPending) return <PageLoading label="Loading practice session" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  const s = session.data;
  const back = { to: `/interview/${s.prep_id}`, label: "Questions" };

  if (s.status === "completed") {
    return (
      <div>
        <PageHeader title={`Practice review: ${s.job_title}`} description={sessionLine(s)} back={back} />
        <ul className="space-y-3">
          {s.questions.map((q, i) => {
            const a = s.answers.find((x) => x.question_id === q.id);
            return (
              <li key={q.id}>
                <Card>
                  <p className="text-label-md text-on-surface-variant">Question {i + 1}</p>
                  <p className="text-body-lg text-on-surface">{q.text}</p>
                  {a?.answer ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-body-md text-on-surface">{a.answer}</p>
                  ) : (
                    <p className="mt-2 text-body-md text-on-surface-variant">Not answered.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a?.self_rating ? <Pill mono={false}>Your rating {a.self_rating}/5</Pill> : null}
                    {a?.feedback ? <Pill tone="brand" mono={false}>Coach score {a.feedback.score}/5</Pill> : null}
                  </div>
                  {a?.notes ? <p className="mt-2 text-body-sm text-on-surface-variant">Notes: {a.notes}</p> : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const current = Math.min(index, s.questions.length - 1);
  const question = s.questions[current];
  if (!question) return <ErrorState error={new Error("This session has no questions.")} />;
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Practice: ${s.job_title}`} description={sessionLine(s)} back={back} />
      <ol aria-label="Questions" className="mb-4 flex flex-wrap gap-1.5">
        {s.questions.map((q, i) => {
          const answered = s.answers.some((a) => a.question_id === q.id && a.answer);
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === current ? "step" : undefined}
                aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
                className={cn(
                  "size-8 rounded-full border font-mono text-code-sm",
                  i === current
                    ? "border-primary bg-primary text-on-primary"
                    : answered
                      ? "border-primary bg-primary-fixed text-on-primary-fixed"
                      : "border-hairline bg-surface-container-lowest text-on-surface-variant",
                )}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <AnswerCard
        key={question.id}
        session={s}
        question={question}
        position={current}
        onMove={(to) => setIndex(Math.max(0, Math.min(to, s.questions.length - 1)))}
      />
    </div>
  );
}

const RATINGS = [
  [1, "Not ready"],
  [2, "Rough"],
  [3, "Okay"],
  [4, "Good"],
  [5, "Ready"],
] as const;

function AnswerCard({
  session: s,
  question: q,
  position,
  onMove,
}: {
  session: PracticeSession;
  question: Question;
  position: number;
  onMove: (to: number) => void;
}) {
  const id = useId();
  const saved = s.answers.find((a) => a.question_id === q.id);
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [rating, setRating] = useState<number | null>(saved?.self_rating ?? null);
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const save = useSaveAnswer(s.id);
  const evaluate = useEvaluateAnswer(s.id);
  const complete = useCompletePractice(s.id);
  const caps = useCapabilities();
  const ai = caps.data?.ai;
  const last = position === s.questions.length - 1;
  const dirty = answer.trim() !== (saved?.answer ?? "") || rating !== (saved?.self_rating ?? null) || notes.trim() !== (saved?.notes ?? "");

  useEffect(() => {
    // Warn before closing the tab with an answer that has not been saved yet.
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);

  const persist = async () => {
    if (dirty) await save.mutateAsync({ questionId: q.id, input: { answer, self_rating: rating, notes } });
  };
  const go = async (to: number) => {
    await persist();
    onMove(to);
  };
  const failure = save.error ?? evaluate.error ?? complete.error;

  return (
    <Card aria-labelledby={`${id}-q`}>
      <p className="text-label-md text-on-surface-variant">
        Question {position + 1} of {s.questions.length} · {CATEGORY_LABEL[q.category]}
      </p>
      <h2 id={`${id}-q`} className="mt-1 font-display text-headline-sm text-on-surface">
        {q.text}
      </h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">Why: {q.why}</p>
      <Evidence question={q} />
      <Tips question={q} />

      <div className="mt-5 space-y-1.5">
        <label htmlFor={`${id}-a`} className="block text-label-md text-on-surface">
          Your answer
        </label>
        <Textarea id={`${id}-a`} rows={7} maxLength={10_000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <fieldset className="mt-4">
        <legend className="text-label-md text-on-surface">How ready do you feel?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RATINGS.map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-label-md has-[:focus-visible]:shadow-focus",
                rating === value ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-hairline text-on-surface-variant",
              )}
            >
              <input
                type="radio"
                name={`${id}-r`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              {value} · {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 space-y-1.5">
        <label htmlFor={`${id}-n`} className="block text-label-md text-on-surface">
          Notes to self (optional)
        </label>
        <Textarea id={`${id}-n`} rows={2} className="min-h-16" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {saved?.feedback ? (
        <div className="mt-4 rounded-control border border-hairline p-3" aria-label="Coach feedback">
          <p className="text-label-md text-on-surface">
            Coach feedback · {saved.feedback.score}/5 <span className="text-on-surface-variant">({saved.feedback.source})</span>
          </p>
          <FeedbackList title="Strengths" items={saved.feedback.strengths ?? []} />
          <FeedbackList title="To improve" items={saved.feedback.improvements ?? []} />
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="mt-3 text-body-sm text-critical">
          {errorText(failure)}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<ChevronLeft className="size-4" aria-hidden />} disabledReason={position === 0 ? "This is the first question" : undefined} onClick={() => void go(position - 1)}>
          Previous
        </Button>
        {last ? (
          <Button
            loading={save.isPending || complete.isPending}
            onClick={() =>
              void (async () => {
                await persist();
                await complete.mutateAsync();
              })()
            }
          >
            Save and finish
          </Button>
        ) : (
          <Button loading={save.isPending} onClick={() => void go(position + 1)}>
            Save and next <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
        <Button
          variant="secondary"
          loading={evaluate.isPending}
          disabledReason={
            !ai?.configured
              ? "AI feedback is not set up yet"
              : !answer.trim()
                ? "Write an answer first"
                : undefined
          }
          onClick={() =>
            void (async () => {
              await persist();
              await evaluate.mutateAsync(q.id);
            })()
          }
        >
          Get AI feedback
        </Button>
        {!ai?.configured ? (
          <span aria-hidden className="text-body-sm text-on-surface-variant">
            AI feedback is not set up yet.
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="text-body-sm text-on-surface-variant">{title}</p>
      <ul className="list-disc pl-5 text-body-md text-on-surface">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
