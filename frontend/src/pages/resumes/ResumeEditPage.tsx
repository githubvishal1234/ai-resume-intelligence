import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeEditor } from "@/components/resume/ResumeEditor";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useResume, useSaveContent } from "@/hooks/useResumes";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { ApiError } from "@/services/apiClient";
import type { ResumeDetail, ResumeDoc } from "@/services/resumeService";
import { PageHeader } from "./common";

function SaveBar({ children, error }: { children: React.ReactNode; error: unknown }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-20 border-t border-hairline bg-surface-container-lowest/95 px-4 py-3 backdrop-blur md:bottom-0 lg:left-64">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-2">
        {error ? (
          <p role="alert" className="mr-auto text-body-md text-critical">
            {error instanceof ApiError ? error.message : "Something went wrong."}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function ResumeEditPage() {
  const { resumeId = "" } = useParams();
  const resume = useResume(resumeId);
  if (resume.isPending) return <PageLoading label="Loading resume" />;
  if (resume.isError) return <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />;
  return <Editor key={`${resume.data.id}:${resume.data.current_version}`} resume={resume.data} />;
}

function Editor({ resume }: { resume: ResumeDetail }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ResumeDoc>(resume.content);
  const [note, setNote] = useState("");
  const save = useSaveContent(resume.id);
  const dirty = JSON.stringify(doc) !== JSON.stringify(resume.content);
  const allowLeave = useUnsavedGuard(dirty);
  const conflict = save.error instanceof ApiError && save.error.code === "VERSION_CONFLICT";

  return (
    <div className="pb-24">
      <PageHeader title={`Edit ${resume.title}`} description={`Editing version ${resume.current_version}. Saving creates version ${resume.current_version + 1}.`}
        back={{ to: `/resumes/${resume.id}`, label: "Back to resume" }} />
      {conflict ? (
        <Notice tone="warning" title="This resume changed in another tab or device" className="mb-6"
          action={<Button variant="secondary" onClick={() => window.location.reload()}>Reload latest</Button>}>
          Your edits were not saved. Copy anything you need, then reload to continue from the latest version.
        </Notice>
      ) : null}
      <ResumeEditor value={doc} onChange={setDoc} />
      <div className="mt-6 max-w-xl">
        <Field label="Change note (optional)" hint="Shown in the version history.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      <SaveBar error={conflict ? null : save.error}>
        <Button variant="ghost" onClick={() => navigate(`/resumes/${resume.id}`)}>Cancel</Button>
        <Button
          loading={save.isPending}
          disabledReason={dirty ? undefined : "No changes to save."}
          onClick={() =>
            save.mutate(
              { baseVersion: resume.current_version, content: doc, note: note.trim() || undefined },
              {
                onSuccess: (r) => {
                  allowLeave();
                  navigate(`/resumes/${r.id}`);
                },
              },
            )
          }
        >
          Save new version
        </Button>
      </SaveBar>
    </div>
  );
}
