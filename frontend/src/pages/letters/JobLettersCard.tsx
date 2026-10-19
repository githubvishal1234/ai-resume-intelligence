import { FileSignature, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useCreateLetter, useJobLetters } from "@/hooks/useCoverLetters";
import { formatDate } from "@/pages/resumes/common";

/** Cover letters written for one job, and a one-click draft for it from the master resume. */
export function JobLettersCard({ jobId }: { jobId: string }) {
  const letters = useJobLetters(jobId);
  const create = useCreateLetter();
  const navigate = useNavigate();
  return (
    <Card aria-labelledby="job-letters-title">
      <CardHeader id="job-letters-title" title="Cover letters" description="Drafted from your master resume, answering this job's requirements." />
      {letters.data?.length ? (
        <ul className="mb-4 space-y-2">
          {letters.data.map((l) => (
            <li key={l.id}>
              <Link to={`/cover-letters/${l.id}`} className="flex min-h-6 items-start gap-2 text-body-md text-primary hover:underline">
                <FileSignature className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  {l.title}
                  <span className="block text-body-sm text-on-surface-variant">Edited {formatDate(l.updated_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        variant={letters.data?.length ? "secondary" : "primary"}
        size="sm"
        loading={create.isPending}
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => create.mutate({ job_id: jobId }, { onSuccess: (l) => navigate(`/cover-letters/${l.id}`) })}
      >
        {letters.data?.length ? "Draft another" : "Draft a cover letter"}
      </Button>
      {create.isError ? <p role="alert" className="mt-2 text-body-sm text-critical-ink"><ApiErrorText error={create.error} /></p> : null}
    </Card>
  );
}
