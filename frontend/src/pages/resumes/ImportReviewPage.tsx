import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeEditor } from "@/components/resume/ResumeEditor";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useAiParseImport, useConfirmImport, useDiscardImport, useImport } from "@/hooks/useResumes";
import { ApiError } from "@/services/apiClient";
import type { ResumeDoc, ResumeImport } from "@/services/resumeService";
import { PageHeader } from "./common";

export function ImportReviewPage() {
  const { importId = "" } = useParams();
  const item = useImport(importId);
  if (item.isPending) return <PageLoading label="Loading your upload" />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  // Re-mount when the AI replaces (or restores) the draft, so the editor starts from it.
  return <Review key={item.data.report.ai ? "ai" : "rules"} item={item.data} />;
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

      {item.ai_available || item.report.ai ? <AiAssist item={item} /> : null}

      {/* Section confidence describes the rule-based reading, so it is hidden for the AI one. */}
      <ResumeEditor value={doc} onChange={setDoc} report={item.report.ai ? undefined : item.report} />

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

function AiAssist({ item }: { item: ResumeImport }) {
  const parse = useAiParseImport(item.id);
  const ai = item.report.ai;
  const error = parse.error;
  return (
    <div className="mb-6 space-y-3">
      {ai ? (
        <Notice tone="info" title={`Filled in by AI (${ai.provider} · ${ai.model})`}>
          <p>
            {ai.kept} values were read and matched to your file.
            {ai.dropped.length
              ? ` ${ai.dropped.length} ${ai.dropped.length === 1 ? "was" : "were"} left out because your file does not contain ${ai.dropped.length === 1 ? "it" : "them"}.`
              : " Nothing was left out."}{" "}
            Check every section before saving.
          </p>
          {ai.dropped.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-label-md text-primary">Show what was left out</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {ai.dropped.map((d) => (
                  <li key={d} className="break-words">{d}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              loading={parse.isPending}
              icon={<Undo2 className="size-4" aria-hidden />}
              onClick={() => parse.mutate(true)}
            >
              Use the original reading
            </Button>
          </div>
        </Notice>
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-label-md text-on-surface">Did we miss something?</p>
            <p className="text-body-sm text-on-surface-variant">
              The AI can read your file again. It only keeps text that is really in your file, and it replaces the
              draft below, including any edits you made here.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            loading={parse.isPending}
            icon={<Sparkles className="size-4" aria-hidden />}
            onClick={() => parse.mutate(false)}
          >
            Improve with AI
          </Button>
        </div>
      )}
      {error ? (
        <Notice tone="critical" title="That didn't work">
          <ApiErrorText error={error} />
        </Notice>
      ) : null}
    </div>
  );
}
