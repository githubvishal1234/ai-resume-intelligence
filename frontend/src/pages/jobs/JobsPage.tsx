import { Plus, Telescope } from "lucide-react";
import { Link } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useJobList } from "@/hooks/useJobs";
import { formatDate, PageHeader } from "@/pages/resumes/common";

const SOURCE: Record<string, string> = { paste: "Pasted", upload: "Uploaded", url: "From link" };

export function JobsPage() {
  const list = useJobList();
  if (list.isPending) return <PageLoading label="Loading jobs" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Job Analyzer"
        description="Saved job descriptions and what each one asks for."
        actions={
          list.data.length ? (
            <ButtonLink to="/jobs/new" variant="primary">
              <Plus className="size-4" aria-hidden /> Analyze a job
            </ButtonLink>
          ) : null
        }
      />
      {list.data.length === 0 ? (
        <EmptyState
          icon={<Telescope className="size-8" aria-hidden />}
          title="No jobs yet"
          description="Paste or upload a job description to see its requirements, skills and key facts."
          action={
            <ButtonLink to="/jobs/new" variant="primary">
              <Plus className="size-4" aria-hidden /> Analyze a job
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.data.map((job) => (
            <li key={job.id}>
              <Card className="relative hover:border-primary">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary"
                    >
                      {job.title}
                    </Link>
                    <p className="mt-1 text-body-md text-on-surface-variant">
                      {[job.company, job.location].filter(Boolean).join(" · ") || "Company not set"}
                    </p>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {SOURCE[job.source] ?? job.source} · {formatDate(job.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone="brand">{job.required_count} required</Pill>
                    <Pill>{job.skill_count} skills</Pill>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
