import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useJobList } from "@/hooks/useJobs";
import { useResumeList } from "@/hooks/useResumes";
import { applyServerErrors } from "@/lib/formErrors";
import type { JobSummary } from "@/services/jobService";
import type { ResumeSummary } from "@/services/resumeService";
import { STATUS_LABEL, STATUSES, type ApplicationDetail, type ApplicationInput } from "@/services/applicationService";

const schema = z.object({
  job_id: z.string(),
  company: z.string().trim().min(1, "Enter the company.").max(200, "Keep the company under 200 characters."),
  role: z.string().trim().min(1, "Enter the role.").max(200, "Keep the role under 200 characters."),
  url: z
    .string()
    .trim()
    .max(2000, "Keep the link under 2000 characters.")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a link that starts with http:// or https://."),
  status: z.enum(STATUSES as [ApplicationInput["status"], ...ApplicationInput["status"][]]),
  applied_on: z.string(),
  follow_up_on: z.string(),
  resume_id: z.string(),
  resume_version: z.string().refine((v) => v === "" || /^[1-9]\d*$/.test(v), "Enter a version number."),
  notes: z.string().max(10_000, "Keep notes under 10,000 characters."),
});
type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape) as (keyof Values)[];

/** A job linked from the job page (`?job=`) fills in an empty company and role. */
function withJobDefaults(values: Values, jobs: JobSummary[]): Values {
  const job = jobs.find((j) => j.id === values.job_id);
  if (!job) return { ...values, job_id: "" };
  return { ...values, company: values.company || job.company || "", role: values.role || job.title };
}

export function toValues(a?: ApplicationDetail, jobId?: string): Values {
  return {
    job_id: a?.job_id ?? jobId ?? "",
    company: a?.company ?? "",
    role: a?.role ?? "",
    url: a?.url ?? "",
    status: a?.status ?? "saved",
    applied_on: a?.applied_on ?? "",
    follow_up_on: a?.follow_up_on ?? "",
    resume_id: a?.resume_id ?? "",
    resume_version: a?.resume_version ? String(a.resume_version) : "",
    notes: a?.notes ?? "",
  };
}

type FormProps = {
  initial: Values;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: ApplicationInput) => Promise<void>;
  onCancel?: () => void;
};

/** Waits for the job and resume lists, so the selects can show their initial values. */
export function ApplicationForm(props: FormProps) {
  const jobs = useJobList();
  const resumes = useResumeList();
  if (jobs.isPending || resumes.isPending) return <PageLoading label="Loading your jobs and resumes" />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;
  if (resumes.isError) return <ErrorState error={resumes.error} onRetry={() => void resumes.refetch()} />;
  return <LoadedForm {...props} jobs={jobs.data} resumes={resumes.data} />;
}

function LoadedForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  jobs,
  resumes,
}: FormProps & { jobs: JobSummary[]; resumes: ResumeSummary[] }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: withJobDefaults(initial, jobs) });

  const pickJob = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (!getValues("company").trim() && job.company) setValue("company", job.company);
    if (!getValues("role").trim()) setValue("role", job.title);
  };
  const pickResume = (resumeId: string) => {
    const resume = resumes.find((r) => r.id === resumeId);
    setValue("resume_version", resume ? String(resume.current_version) : "");
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit({ ...values, resume_version: values.resume_version ? Number(values.resume_version) : null });
    } catch (error) {
      setFormError(applyServerErrors(error, FIELDS, setError));
    }
  });

  const jobField = register("job_id");
  const resumeField = register("resume_id");

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {formError ? (
        <Notice tone="critical" title="Could not save">
          {formError}
        </Notice>
      ) : null}
      <Field label="Saved job (optional)" hint="Linking a job fills in the company and role.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            {...jobField}
            onChange={(e) => {
              void jobField.onChange(e);
              pickJob(e.target.value);
            }}
          >
            <option value="">Not linked</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.company ? ` · ${j.company}` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" error={errors.company?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("company")} />}
        </Field>
        <Field label="Role" error={errors.role?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("role")} />}
        </Field>
      </div>
      <Field label="Posting link (optional)" error={errors.url?.message}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} type="url" inputMode="url" placeholder="https://" aria-describedby={describedBy} invalid={invalid} {...register("url")} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} {...register("status")}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Applied on" hint="Set for you when the status moves past Saved." error={errors.applied_on?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="date" aria-describedby={describedBy} invalid={invalid} {...register("applied_on")} />}
        </Field>
        <Field label="Follow up on" hint="You'll get a reminder on this date." error={errors.follow_up_on?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="date" aria-describedby={describedBy} invalid={invalid} {...register("follow_up_on")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Resume sent (optional)" error={errors.resume_id?.message}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              {...resumeField}
              onChange={(e) => {
                void resumeField.onChange(e);
                pickResume(e.target.value);
              }}
            >
              <option value="">None</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "master" ? "Master: " : "Tailored: "}
                  {r.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Version" hint="The exact version you sent." error={errors.resume_version?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} inputMode="numeric" aria-describedby={describedBy} invalid={invalid} {...register("resume_version")} />
          )}
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        {({ id, describedBy, invalid }) => <Textarea id={id} rows={4} className="min-h-24" aria-describedby={describedBy} invalid={invalid} {...register("notes")} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
