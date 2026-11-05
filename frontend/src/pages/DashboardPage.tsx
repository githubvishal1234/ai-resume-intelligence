import { ArrowRight, BriefcaseBusiness, FileText, GitCompareArrows, MessagesSquare, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { CapabilitiesCard } from "@/components/system/CapabilitiesCard";
import { ButtonLink } from "@/components/ui/Button";
import { CardHeader } from "@/components/ui/Card";
import { PhotoBanner } from "@/components/ui/PhotoBanner";
import { Pill } from "@/components/ui/Pill";
import { useMarket, useOutcomes } from "@/hooks/useInsights";
import { useMasterSummary } from "@/hooks/useResumes";
import { useSession } from "@/hooks/useSession";
import { useTailoringList } from "@/hooks/useTailoring";
import { AtAGlance } from "@/pages/dashboard/AtAGlance";

const NEXT_STEPS: { icon: typeof FileText; title: string; body: string; phase: number; to?: string }[] = [
  { icon: FileText, title: "Create your master resume", body: "Build it in a few minutes with the quick builder, or upload the one you have.", phase: 2, to: "/resumes/new" },
  { icon: ScanSearch, title: "Analyze a job description", body: "Paste or upload a posting to extract its requirements.", phase: 3, to: "/jobs/new" },
  { icon: GitCompareArrows, title: "Match your resume to a job", body: "See which requirements your resume shows evidence for, and where the gaps are.", phase: 4, to: "/match" },
  { icon: Sparkles, title: "Tailor with evidence", body: "Every proposed change is checked against your master resume.", phase: 5, to: "/tailor" },
  { icon: BriefcaseBusiness, title: "Track your applications", body: "Record the resume version you sent and get follow-up reminders.", phase: 7, to: "/applications" },
  { icon: MessagesSquare, title: "Prepare for the interview", body: "Practice questions built from the job, your evidence and your gaps.", phase: 8, to: "/interview" },
];

export function DashboardPage() {
  const session = useSession();
  const firstName = session.data?.user.display_name.split(/\s+/)[0] ?? "";
  const { master } = useMasterSummary();
  const market = useMarket();
  const outcomes = useOutcomes();
  // A step is done only when the data shows it; the others stay "Available".
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
      <PhotoBanner
        photo="dashboard"
        eyebrow="Dashboard"
        title={`Welcome${firstName ? `, ${firstName}` : ""}`}
        description={`Next step: ${next.hint}`}
        actions={
          <>
            <ButtonLink to={next.to} variant="primary">
              <next.icon className="size-4" aria-hidden /> {next.label}
            </ButtonLink>
            {master ? null : (
              <ButtonLink to="/resumes/upload">
                <UploadCloud className="size-4" aria-hidden /> Upload one
              </ButtonLink>
            )}
          </>
        }
      />

      <AtAGlance />

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2" aria-labelledby="steps-title">
          <CardHeader
            id="steps-title"
            title="Getting started"
            description={`Six steps from your resume to the interview. ${doneCount} of 6 done.`}
          />
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map(({ icon: Icon, title, body, phase, to }, index) => (
              <li
                key={phase}
                style={{ animationDelay: `${index * 40}ms` }}
                className="group relative flex animate-rise flex-col gap-3 rounded-card border border-hairline bg-surface-container-lowest p-5 shadow-level-1 transition has-[a]:hover:-translate-y-1 has-[a]:hover:border-primary-fixed-dim has-[a]:hover:shadow-level-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-control bg-primary-fixed text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {done[phase] ? <Pill tone="matched">Done</Pill> : to ? <Pill tone="brand">Available</Pill> : <Pill tone="neutral">Phase {phase}</Pill>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="inline-flex rounded-full bg-accent/30 px-2.5 py-0.5 text-label-sm font-bold text-on-surface">Step {index + 1}</p>
                  {to ? (
                    <Link to={to} className="mt-2 block font-display text-headline-sm font-bold text-on-surface after:absolute after:inset-0 group-hover:text-primary">
                      {title}
                    </Link>
                  ) : (
                    <p className="mt-2 font-display text-headline-sm font-bold text-on-surface">{title}</p>
                  )}
                  <p className="mt-1 text-body-md text-on-surface-variant">{body}</p>
                </div>
                {to ? (
                  <ArrowRight className="size-4 text-on-surface-variant transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
        <CapabilitiesCard />
      </div>
    </div>
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
