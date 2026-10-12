import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeEditor } from "@/components/resume/ResumeEditor";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useConfirmImport, useDiscardImport, useImport } from "@/hooks/useResumes";
import { ApiError } from "@/services/apiClient";
import type { ResumeDoc, ResumeImport } from "@/services/resumeService";
import { PageHeader } from "./common";

export function ImportReviewPage() {
  const { importId = "" } = useParams();
  const item = useImport(importId);
  if (item.isPending) return <PageLoading label="Loading your upload" />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  return <Review item={item.data} />;
}

function Review({ item }: { item: ResumeImport }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ResumeDoc>(item.content);
  const confirm = useConfirmImport(item.id);
  const discard = useDiscardImport(item.id);
  const low = item.report.sections.filter((s) => s.confidence === "low" && s.found);
  const missing = item.report.sections.filter((s) => !s.found);

  if (item.status !== "pending_review") {
    return (
      <Notice tone="info" title="This upload was already handled">
        It was {item.status === "confirmed" ? "saved to your master resume" : "discarded"}.
      </Notice>
    );
  }

  const error = confirm.error ?? discard.error;
  return (
    <div className="pb-24">
      <PageHeader
        title="Review your resume"
        description={<>From <span className="font-medium">{item.filename}</span>. Fix anything that looks wrong, then save.</>}
        back={{ to: "/resumes", label: "My Resumes" }}
      />
      <div className="mb-6 space-y-3">
        {item.has_master ? (
          <Notice tone="info" title="This will become a new version of your master resume">
            Your current version stays in the version history and can be restored.
          </Notice>
        ) : null}
        {item.report.warnings.map((w) => (
          <Notice key={w} tone="warning" title="Check the result">{w}</Notice>
        ))}
        {low.length > 0 ? (
          <Notice tone="warning" title="Some sections were hard to read">
            Low confidence: {low.map((s) => s.section).join(", ")}. Please review them carefully.
          </Notice>
        ) : null}
        {missing.length > 0 ? (
          <Notice tone="info" title="Sections not found">
            {missing.map((s) => s.section).join(", ")}. Add them below if your resume has them.
          </Notice>
        ) : null}
      </div>

      <ResumeEditor value={doc} onChange={setDoc} report={item.report} />

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-hairline bg-surface-container-lowest/95 px-4 py-3 backdrop-blur md:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-2">
          {error ? (
            <p role="alert" className="mr-auto text-body-md text-critical">
              {error instanceof ApiError ? error.message : "Something went wrong."}
            </p>
          ) : null}
          <Button
            variant="ghost"
            loading={discard.isPending}
            onClick={() => discard.mutate(undefined, { onSuccess: () => navigate("/resumes") })}
          >
            Discard
          </Button>
          <Button
            loading={confirm.isPending}
            onClick={() => confirm.mutate({ content: doc }, { onSuccess: (r) => navigate(`/resumes/${r.id}`) })}
          >
            {item.has_master ? "Save as new version" : "Save as master resume"}
          </Button>
        </div>
      </div>
    </div>
  );
}
