import { ArrowRight, BriefcaseBusiness, Check, type FileText, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/States";
import { useApplicationList } from "@/hooks/useApplications";
import { useMarket, useOutcomes } from "@/hooks/useInsights";
import { useMasterSummary } from "@/hooks/useResumes";
import { useSession } from "@/hooks/useSession";
import { useTailoringList } from "@/hooks/useTailoring";
import { cn } from "@/lib/cn";
import { formatDay, StatusPill } from "@/pages/applications/status";
import { AtAGlance } from "@/pages/dashboard/AtAGlance";
import { PageHeader } from "@/pages/resumes/common";
import { CLOSED } from "@/services/applicationService";

const NEXT_STEPS: { title: string; body: string; phase: number; to: string }[] = [
  { title: "Create your master resume", body: "Build it in a few minutes with the quick builder, or upload the one you have.", phase: 2, to: "/resumes/new" },
  { title: "Analyze a job description", body: "Paste or upload a posting to extract its requirements.", phase: 3, to: "/jobs/new" },
  { title: "Match your resume to a job", body: "See which requirements your resume shows evidence for, and where the gaps are.", phase: 4, to: "/match" },
  { title: "Tailor with evidence", body: "Every proposed change is checked against your master resume.", phase: 5, to: "/tailor" },
  { title: "Track your applications", body: "Record the resume version you sent and get follow-up reminders.", phase: 7, to: "/applications" },
  { title: "Prepare for the interview", body: "Practice questions built from the job, your evidence and your gaps.", phase: 8, to: "/interview" },
];

export function DashboardPage() {
  const session = useSession();
  const firstName = session.data?.user.display_name.split(/\s+/)[0] ?? "";
  const { master } = useMasterSummary();
  const market = useMarket();
  const outcomes = useOutcomes();
  // A step is done only when the data shows it.
  const done: Record<number, boolean> = {
    2: Boolean(master),
    3: Boolean(market.data?.jobs_analyzed),
    7: Boolean(outcomes.data && outcomes.data.total.sent + outcomes.data.unsent > 0),
  };
  const steps = NEXT_STEPS.map((step) =>
    step.phase === 2 && master
      ? { ...step, title: "Your master resume", body: `Version ${master.current_version}. Keep it current; every tailored resume starts here.`, to: `/resumes/${master.id}` }
      : step,
  );
  const doneCount = steps.filter((s) => done[s.phase]).length;
  const tailoring = useTailoringList();
  const next = nextStep({
    master: Boolean(master),
    job: done[3] ?? false,
    tailored: Boolean(tailoring.data?.length),
    applied: done[7] ?? false,
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ""}`}
        description={`Next step: ${next.hint}`}
        actions={
          <>
            {master ? null : (
              <ButtonLink to="/resumes/upload">
                <UploadCloud className="size-4" aria-hidden /> Upload one
              </ButtonLink>
            )}
            <ButtonLink to={next.to} variant="primary">
              <next.icon className="size-4" aria-hidden /> {next.label}
            </ButtonLink>
          </>
        }
      />

      <AtAGlance />

      <div className="grid items-start gap-6 xl:grid-cols-5">
        <Card padded={false} className="xl:col-span-3" aria-labelledby="steps-title">
          <div className="px-5 pt-5 sm:px-6">
            <CardHeader
              id="steps-title"
              title="Getting started"
              description={`Six steps from your resume to the interview. ${doneCount} of 6 done.`}
            />
          </div>
          <ol className="divide-y divide-hairline border-t border-hairline">
            {steps.map(({ title, body, phase, to }, index) => (
              <li key={phase} className="group relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-container-low sm:px-6">
                <span
                  className={cn(
                    "tnum flex size-6 shrink-0 items-center justify-center rounded-full border text-label-sm font-semibold",
                    done[phase] ? "border-success bg-success text-surface-container-lowest" : "border-hairline-strong text-on-surface-variant",
                  )}
                >
                  {done[phase] ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={to} className="text-body-md font-semibold text-on-surface after:absolute after:inset-0">
                    {title}
                    {done[phase] ? <span className="sr-only"> (done)</span> : null}
                  </Link>
                  <p className="text-body-md text-on-surface-variant sm:truncate">{body}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-on-surface" aria-hidden />
              </li>
            ))}
          </ol>
        </Card>
        <OpenApplications />
      </div>
    </div>
  );
}

/** The five newest open applications, each with its follow-up date. */
function OpenApplications() {
  const list = useApplicationList();
  const open = (list.data ?? []).filter((a) => !CLOSED.has(a.status)).slice(0, 5);
  const pad = "px-5 pb-5 sm:px-6";
  return (
    <Card padded={false} className="xl:col-span-2" aria-labelledby="pipeline-title">
      <div className="px-5 pt-5 sm:px-6">
        <CardHeader
          id="pipeline-title"
          title="Open applications"
          description="What you are waiting on, newest first."
          action={
            open.length ? (
              <Link to="/applications" className="text-label-md font-semibold text-primary hover:underline">
                View all
              </Link>
            ) : null
          }
        />
      </div>
      {list.isPending ? (
        <div className={cn("space-y-3", pad)}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.isError ? (
        <p role="alert" className={cn("text-body-md text-on-surface-variant", pad)}>
          Your applications could not be loaded.{" "}
          <button type="button" onClick={() => void list.refetch()} className="font-semibold text-primary hover:underline">
            Try again
          </button>
        </p>
      ) : open.length === 0 ? (
        <p className={cn("text-body-md text-on-surface-variant", pad)}>
          Nothing open.{" "}
          <Link to="/applications/new" className="font-semibold text-primary hover:underline">
            Add an application
          </Link>{" "}
          to see it here with its follow-up date.
        </p>
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {open.map((a) => (
            <li key={a.id} className="relative flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-container-low sm:px-6">
              <div className="min-w-0">
                <Link to={`/applications/${a.id}`} className="block truncate text-body-md font-semibold text-on-surface after:absolute after:inset-0">
                  {a.role}
                </Link>
                <p className="truncate text-body-sm text-on-surface-variant">
                  {a.company}
                  {a.follow_up_due ? " · follow-up due" : a.follow_up_on ? ` · follow up ${formatDay(a.follow_up_on)}` : ""}
                </p>
              </div>
              <StatusPill status={a.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Progress = { master: boolean; job: boolean; tailored: boolean; applied: boolean };

/** The one thing to do next, in the order the workflow needs it. */
export function nextStep(p: Progress): { label: string; hint: string; to: string; icon: typeof FileText } {
  if (!p.master) return { label: "Build my resume", hint: "create your master resume, or upload the one you have.", to: "/resumes/new", icon: Sparkles };
  if (!p.job) return { label: "Analyze a job", hint: "paste a job posting you want to apply for.", to: "/jobs/new", icon: ScanSearch };
  if (!p.tailored) return { label: "Tailor my resume", hint: "make a copy of your resume aimed at your saved job.", to: "/tailor", icon: Sparkles };
  if (!p.applied) return { label: "Track an application", hint: "record where you sent your tailored resume.", to: "/applications/new", icon: BriefcaseBusiness };
  return { label: "Analyze another job", hint: "add the next job, or prepare for an interview.", to: "/jobs/new", icon: ScanSearch };
}
