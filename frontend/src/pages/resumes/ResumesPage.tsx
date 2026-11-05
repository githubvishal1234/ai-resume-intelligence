import { FilePlus2, FileText, Sparkles, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useDeleteControls } from "@/hooks/useDeleteControls";
import { useDeleteResume, useResumeList } from "@/hooks/useResumes";
import type { ResumeSummary } from "@/services/resumeService";
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
        photo="resumes"
        description="Your master resume is the verified source of truth. Tailored versions are built from it."
        actions={
          master ? (
            <>
              <ButtonLink to="/resumes/new" variant="primary">
                <Sparkles className="size-4" aria-hidden /> Quick builder
              </ButtonLink>
              <ButtonLink to="/resumes/upload">
                <UploadCloud className="size-4" aria-hidden /> Upload new version
              </ButtonLink>
            </>
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
          <p className="text-body-md text-on-surface-variant">
            None yet. <Link to="/tailor" className="font-medium text-primary hover:underline">Tailor your master resume</Link> for a job to create one.
          </p>
        ) : (
          <ul className="space-y-2">
            {tailored.map((t) => (
              <li key={t.id}>
                <TailoredCard resume={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One tailored version: the whole card opens it; its delete button sits above that link. */
function TailoredCard({ resume: t }: { resume: ResumeSummary }) {
  const remove = useDeleteResume(t.id);
  const del = useDeleteControls({
    name: t.title,
    note: "This tailored resume and its versions are removed. Your master resume isn't affected. This can't be undone.",
    action: remove,
  });
  return (
    <Card className="relative hover:border-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/resumes/${t.id}`} className="min-w-0 text-label-md text-on-surface after:absolute after:inset-0 hover:text-primary">
          {t.title}
        </Link>
        <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <Pill tone="info">Tailored</Pill> updated {formatDate(t.updated_at)}
          {del.button}
        </span>
      </div>
      {del.confirm}
    </Card>
  );
}
