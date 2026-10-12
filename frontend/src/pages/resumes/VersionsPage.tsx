import { Download } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeView } from "@/components/resume/ResumeView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading, Skeleton } from "@/components/ui/States";
import { useRestoreVersion, useResume, useVersion, useVersions } from "@/hooks/useResumes";
import { cn } from "@/lib/cn";
import { ApiError, apiUrl } from "@/services/apiClient";
import { formatDate, PageHeader, SOURCE_LABEL } from "./common";

export function VersionsPage() {
  const { resumeId = "" } = useParams();
  const resume = useResume(resumeId);
  const versions = useVersions(resumeId);
  const [selected, setSelected] = useState<number | null>(null);
  const current = resume.data?.current_version ?? null;
  const shown = selected ?? current;
  const version = useVersion(resumeId, shown);
  const restore = useRestoreVersion(resumeId);
  const navigate = useNavigate();

  if (resume.isPending || versions.isPending) return <PageLoading label="Loading versions" />;
  if (resume.isError) return <ErrorState error={resume.error} />;
  if (versions.isError) return <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />;

  return (
    <div>
      <PageHeader title="Version history" description="Every save is kept. Restoring creates a new version; nothing is overwritten."
        back={{ to: `/resumes/${resumeId}`, label: resume.data.title }} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <nav aria-label="Versions">
          <ul className="space-y-2">
            {versions.data.map((v) => (
              <li key={v.version}>
                <button type="button" onClick={() => setSelected(v.version)} aria-current={shown === v.version ? "true" : undefined}
                  className={cn("w-full rounded-control border p-3 text-left transition-colors",
                    shown === v.version ? "border-primary bg-primary-fixed/40" : "border-hairline bg-surface-container-lowest hover:border-hairline-strong")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label-md text-on-surface">Version {v.version}</span>
                    {v.version === current ? <Pill tone="brand">Current</Pill> : <Pill>{SOURCE_LABEL[v.source] ?? v.source}</Pill>}
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{formatDate(v.created_at)}</p>
                  {v.note ? <p className="mt-1 text-body-sm text-on-surface">{v.note}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <Card>
          {shown !== null && shown !== current ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-container-low p-3">
              <p className="text-body-md">You are viewing version {shown}.</p>
              <Button size="sm" loading={restore.isPending}
                onClick={() => restore.mutate({ version: shown, baseVersion: current ?? 1 }, { onSuccess: (r) => navigate(`/resumes/${r.id}`) })}>
                Restore this version
              </Button>
            </div>
          ) : null}
          {restore.isError ? (
            <Notice tone="critical" title="Could not restore" className="mb-4">
              {restore.error instanceof ApiError ? restore.error.message : "Please try again."}
            </Notice>
          ) : null}
          {version.data?.has_file ? (
            <a href={apiUrl(`/resumes/${resumeId}/versions/${version.data.version}/file`)}
              className="mb-4 inline-flex items-center gap-1.5 text-label-md text-primary hover:underline">
              <Download className="size-4" aria-hidden /> Download the original upload
            </a>
          ) : null}
          {version.isPending ? <Skeleton className="h-64 w-full" /> : version.isError ? <ErrorState error={version.error} /> : <ResumeView doc={version.data.content} />}
        </Card>
      </div>
    </div>
  );
}
