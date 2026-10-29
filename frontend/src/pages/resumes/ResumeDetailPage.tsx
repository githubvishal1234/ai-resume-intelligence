import { Download, History, PenLine, ScanSearch, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeView } from "@/components/resume/ResumeView";
import { SixSecondScan } from "@/components/resume/SixSecondScan";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useDeleteResume, useResume } from "@/hooks/useResumes";
import { formatDate, PageHeader } from "./common";

export function ResumeDetailPage() {
  const { resumeId = "" } = useParams();
  const resume = useResume(resumeId);
  const remove = useDeleteResume(resumeId);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (resume.isPending) return <PageLoading label="Loading resume" />;
  if (resume.isError) return <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />;
  const r = resume.data;

  return (
    <div>
      <PageHeader
        title={r.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {/* An archived master is a resume pasted for quick tailoring, not the user's master. */}
            <Pill tone="brand">{r.kind === "tailored" ? "Tailored" : r.status === "archived" ? "Pasted" : "Master"}</Pill>
            Version {r.current_version} · updated {formatDate(r.updated_at)}
          </span>
        }
        back={{ to: "/resumes", label: "My Resumes" }}
        actions={
          <>
            <ButtonLink to={`/resumes/${r.id}/edit`} variant="primary"><PenLine className="size-4" aria-hidden /> Edit</ButtonLink>
            <ButtonLink to={`/resumes/${r.id}/analysis`}><ScanSearch className="size-4" aria-hidden /> Analysis</ButtonLink>
            <ButtonLink to={`/resumes/${r.id}/versions`}><History className="size-4" aria-hidden /> Versions</ButtonLink>
            <ButtonLink to={`/builder?resume=${r.id}`}><Download className="size-4" aria-hidden /> PDF &amp; ATS check</ButtonLink>
            {r.kind === "master" && r.status === "active" ? (
              <ButtonLink to="/resumes/upload"><UploadCloud className="size-4" aria-hidden /> Upload new version</ButtonLink>
            ) : null}
          </>
        }
      />
      <Card className="mx-auto max-w-3xl">
        <ResumeView doc={r.content} />
      </Card>

      <SixSecondScan doc={r.content} editTo={`/resumes/${r.id}/edit`} />

      <section className="mx-auto mt-8 max-w-3xl" aria-labelledby="danger-title">
        <h2 id="danger-title" className="mb-2 text-label-md text-on-surface">Delete</h2>
        {confirming ? (
          <Notice
            tone="critical"
            title="Delete this resume permanently?"
            action={
              <div className="flex gap-2">
                <Button variant="destructive" loading={remove.isPending}
                  onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/resumes", { replace: true }) })}>
                  Delete permanently
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            }
          >
            All {r.current_version} version(s) and the uploaded files are removed. This cannot be undone.
          </Notice>
        ) : (
          <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
            Delete resume
          </Button>
        )}
      </section>
    </div>
  );
}
