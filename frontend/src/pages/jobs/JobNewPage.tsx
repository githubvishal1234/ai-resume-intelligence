import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardPaste, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { FileDrop } from "@/components/resume/FileDrop";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PageLoading } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useCreateJob, useUploadJob } from "@/hooks/useJobs";
import { applyServerErrors } from "@/lib/formErrors";
import { ApiError } from "@/services/apiClient";
import { PageHeader } from "@/pages/resumes/common";

const MIN = 50;
const MAX = 50_000;

const pasteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(MIN, `Paste the full job description (at least ${MIN} characters).`)
    .max(MAX, `The job description is too long (at most ${MAX.toLocaleString()} characters).`),
  title: z.string().trim().max(200, "Keep the title under 200 characters."),
  company: z.string().trim().max(200, "Keep the company name under 200 characters."),
  location: z.string().trim().max(200, "Keep the location under 200 characters."),
});
type PasteValues = z.infer<typeof pasteSchema>;

type Tab = "paste" | "upload";

export function JobNewPage() {
  const [tab, setTab] = useState<Tab>("paste");
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/jobs/${id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Analyze a job"
        description="Paste a job description or upload it as a file. We pull out its requirements, skills and key facts."
        back={{ to: "/jobs", label: "Jobs" }}
      />
      <Tabs
        label="How to add the job"
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        tabs={[
          { id: "paste", label: "Paste text", icon: <ClipboardPaste className="size-4" aria-hidden /> },
          { id: "upload", label: "Upload file", icon: <UploadCloud className="size-4" aria-hidden /> },
        ]}
      >
        {tab === "paste" ? <PasteForm onCreated={open} /> : null}
        {tab === "upload" ? <UploadForm onCreated={open} /> : null}
      </Tabs>
      <p className="mt-4 text-body-sm text-on-surface-variant">
        Analysis is rule-based: requirements are copied from the posting and never invented. Facts such as salary
        or years of experience appear only when the posting states them.
      </p>
    </div>
  );
}

function PasteForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateJob();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<PasteValues>({
    resolver: zodResolver(pasteSchema),
    defaultValues: { text: "", title: "", company: "", location: "" },
  });
  const length = useWatch({ control, name: "text" }).trim().length;

  const onSubmit = handleSubmit(async ({ text, ...meta }) => {
    setFormError(null);
    try {
      const job = await create.mutateAsync({ text, meta });
      onCreated(job.id);
    } catch (error) {
      setFormError(applyServerErrors(error, ["text", "title", "company", "location"], setError));
    }
  });

  return (
    <Card>
      {formError ? (
        <Notice tone="critical" title="Could not analyze this job" className="mb-4">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Job description"
          hint={`${length.toLocaleString()} characters · include the requirements section`}
          error={errors.text?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea id={id} rows={14} aria-describedby={describedBy} invalid={invalid} {...register("text")} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Job title (optional)" hint="Taken from the posting if left empty" error={errors.title?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("title")} />
            )}
          </Field>
          <Field label="Company (optional)" error={errors.company?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("company")} />
            )}
          </Field>
          <Field label="Location (optional)" error={errors.location?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("location")} />
            )}
          </Field>
        </div>
        <Button type="submit" loading={create.isPending}>
          Analyze job
        </Button>
      </form>
    </Card>
  );
}

function UploadForm({ onCreated }: { onCreated: (id: string) => void }) {
  const upload = useUploadJob();
  return (
    <Card>
      {upload.isPending ? (
        <PageLoading label="Reading the job description" />
      ) : (
        <FileDrop
          label="Job description file"
          prompt="Drop the job description here, or choose a file"
          onFile={(file) => upload.mutate(file, { onSuccess: (job) => onCreated(job.id) })}
        />
      )}
      {upload.isError ? (
        <Notice tone="critical" title="This file could not be used" className="mt-4">
          {upload.error instanceof ApiError ? upload.error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
    </Card>
  );
}
