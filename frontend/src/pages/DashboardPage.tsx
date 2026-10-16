import { ArrowRight, BriefcaseBusiness, FileText, GitCompareArrows, MessagesSquare, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { CapabilitiesCard } from "@/components/system/CapabilitiesCard";
import { ButtonLink } from "@/components/ui/Button";
import { CardHeader } from "@/components/ui/Card";
import { PhotoBanner } from "@/components/ui/PhotoBanner";
import { Pill } from "@/components/ui/Pill";
import { useMasterSummary } from "@/hooks/useResumes";
import { useSession } from "@/hooks/useSession";

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
  const steps = NEXT_STEPS.map((step) =>
    step.phase === 2 && master
      ? { ...step, title: "Your master resume", body: `Version ${master.current_version}. Keep it current; every tailored resume starts here.`, to: `/resumes/${master.id}` }
      : step,
  );
  return (
    <div className="space-y-6">
      <PhotoBanner
        photo="dashboard"
        eyebrow="Dashboard"
        title={`Welcome${firstName ? `, ${firstName}` : ""}`}
        description="Here is where your resume workflow starts."
        actions={
          <>
            {master ? (
              <ButtonLink to="/jobs/new" variant="primary">
                <ScanSearch className="size-4" aria-hidden /> Analyze a job
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/resumes/new" variant="primary">
                  <Sparkles className="size-4" aria-hidden /> Build my resume
                </ButtonLink>
                <ButtonLink to="/resumes/upload">
                  <UploadCloud className="size-4" aria-hidden /> Upload one
                </ButtonLink>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2" aria-labelledby="steps-title">
          <CardHeader id="steps-title" title="Getting started" description="Six steps from your resume to the interview." />
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
                  {to ? <Pill tone="matched">Available</Pill> : <Pill tone="neutral">Phase {phase}</Pill>}
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
