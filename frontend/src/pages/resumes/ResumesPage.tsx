import { FilePlus2, FileText, UploadCloud } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useResumeList } from "@/hooks/useResumes";
import { formatDate, PageHeader } from "./common";

export function ResumesPage() {
  const list = useResumeList();
  if (list.isPending) return <PageLoading label="Loading resumes" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const master = list.data.find((r) => r.kind === "master" && r.status === "active");
  const tailored = list.data.filter((r) => r.kind === "tailored");

  return (
    <div>
      <PageHeader
        title="My Resumes"
        description="Your master resume is the verified source of truth. Tailored versions are built from it."
        actions={
          master ? (
            <ButtonLink to="/resumes/upload">
              <UploadCloud className="size-4" aria-hidden /> Upload new version
            </ButtonLink>
          ) : null
        }
      />
      {master ? (
        <Card className="border-primary-fixed-dim">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <FileText className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-headline-sm text-on-surface">{master.title}</h2>
                  <Pill tone="brand">Master</Pill>
                </div>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  Version {master.current_version} · updated {formatDate(master.updated_at)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={`/resumes/${master.id}`} variant="primary">Open</ButtonLink>
              <ButtonLink to={`/resumes/${master.id}/edit`}>Edit</ButtonLink>
              <ButtonLink to={`/resumes/${master.id}/analysis`}>Analysis</ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No master resume yet"
          description="Upload your current resume (PDF, DOCX or TXT). You will review everything we extract before it is saved."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/resumes/upload" variant="primary">
                <UploadCloud className="size-4" aria-hidden /> Upload resume
              </ButtonLink>
              <ButtonLink to="/resumes/new">
                <FilePlus2 className="size-4" aria-hidden /> Start from scratch
              </ButtonLink>
            </div>
          }
        />
      )}
      <section className="mt-8" aria-labelledby="tailored-title">
        <h2 id="tailored-title" className="mb-3 font-display text-headline-sm text-on-surface">Tailored versions</h2>
        {tailored.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Tailored resumes will appear here once tailoring is available (Phase 5).</p>
        ) : (
          <ul className="space-y-2">
            {tailored.map((t) => (
              <li key={t.id}>
                <Card>
                  <p className="text-label-md">{t.title}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
