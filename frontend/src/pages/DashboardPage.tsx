import { BriefcaseBusiness, FileText, GitCompareArrows, MessagesSquare, ScanSearch, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { CapabilitiesCard } from "@/components/system/CapabilitiesCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useMasterSummary } from "@/hooks/useResumes";
import { useSession } from "@/hooks/useSession";

const NEXT_STEPS: { icon: typeof FileText; title: string; body: string; phase: number; to?: string }[] = [
  { icon: FileText, title: "Upload your master resume", body: "Your verified source of truth for every tailored version.", phase: 2, to: "/resumes/upload" },
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
      <header>
        <h1 className="font-display text-headline-lg text-on-surface">Welcome{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-body-lg text-on-surface-variant">Here is where your resume workflow starts.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="steps-title">
          <CardHeader id="steps-title" title="Getting started" description="The workflow unlocks as each phase ships." />
          <ol className="space-y-3">
            {steps.map(({ icon: Icon, title, body, phase, to }) => (
              <li key={phase} className="relative flex items-start gap-3 rounded-control border border-hairline p-4 has-[a]:hover:border-primary">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  {to ? (
                    <Link to={to} className="text-label-md text-on-surface after:absolute after:inset-0 hover:text-primary">{title}</Link>
                  ) : (
                    <p className="text-label-md text-on-surface">{title}</p>
                  )}
                  <p className="text-body-md text-on-surface-variant">{body}</p>
                </div>
                {to ? <Pill tone="matched">Available</Pill> : <Pill tone="neutral">Phase {phase}</Pill>}
              </li>
            ))}
          </ol>
        </Card>
        <CapabilitiesCard />
      </div>
    </div>
  );
}
