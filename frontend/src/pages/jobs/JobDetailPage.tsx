import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { zodResolver } from "@hookform/resolvers/zod";
import { BriefcaseBusiness, GitCompareArrows, PenLine, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useAiAnalyzeJob, useDeleteJob, useJob, useReanalyzeJob, useUpdateJob } from "@/hooks/useJobs";
import { applyServerErrors } from "@/lib/formErrors";
import { TIER_LABEL, type JobDetail, type Requirement, type Tier } from "@/services/jobService";
import { formatDate, PageHeader } from "@/pages/resumes/common";

const TIERS: Tier[] = ["required", "preferred", "nice_to_have"];
const TIER_TONE: Record<Tier, PillTone> = { required: "brand", preferred: "info", nice_to_have: "neutral" };
const CATEGORY_LABEL: Record<Requirement["category"], string> = {
  skill: "Skill",
  experience: "Experience",
  education: "Education",
  certification: "Certification",
  responsibility: "Responsibility",
  other: "Other",
};

export function JobDetailPage() {
  const { jobId = "" } = useParams();
  const job = useJob(jobId);
  const reanalyze = useReanalyzeJob(jobId);
  const [editing, setEditing] = useState(false);

  if (job.isPending) return <PageLoading label="Loading job" />;
  if (job.isError) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  const j = job.data;
  const a = j.analysis;

  return (
    <div>
      <PageHeader
        title={j.title}
        description={[j.company, j.location].filter(Boolean).join(" · ") || undefined}
        back={{ to: "/jobs", label: "Jobs" }}
        actions={
          <>
            <ButtonLink to={`/jobs/${j.id}/match`} variant="primary">
              <GitCompareArrows className="size-4" aria-hidden /> Match my resume
            </ButtonLink>
            <ButtonLink to="/tailor">
              <Sparkles className="size-4" aria-hidden /> Tailor
            </ButtonLink>
            <ButtonLink to={`/applications/new?job=${j.id}`}>
              <BriefcaseBusiness className="size-4" aria-hidden /> Track application
            </ButtonLink>
            <Button variant="secondary" icon={<PenLine className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <Button
              variant="secondary"
              loading={reanalyze.isPending}
              icon={<RefreshCw className="size-4" aria-hidden />}
              onClick={() => reanalyze.mutate()}
            >
              Re-run analysis
            </Button>
          </>
        }
      />
      {editing ? <EditDetails job={j} onDone={() => setEditing(false)} /> : null}
      <Facts job={j} />
      <AiAnalysis job={j} />
      {a.warnings.map((w) => (
        <Notice key={w} tone="warning" title="Check this analysis" className="mb-4">
          {w}
        </Notice>
      ))}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card aria-labelledby="req-title">
            <CardHeader
              id="req-title"
              title="Requirements"
              description="Grouped by how strongly the posting asks for them."
            />
            {a.requirements.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No requirements were found in this posting.</p>
            ) : (
              <div className="space-y-6">
                {TIERS.map((tier) => {
                  const items = a.requirements.filter((r) => r.tier === tier);
                  if (!items.length) return null;
                  return (
                    <section key={tier} aria-label={TIER_LABEL[tier]}>
                      <h3 className="mb-2 flex items-center gap-2 text-label-md text-on-surface">
                        {TIER_LABEL[tier]} <Pill tone={TIER_TONE[tier]}>{items.length}</Pill>
                      </h3>
                      <ul className="divide-y divide-hairline rounded-control border border-hairline">
                        {items.map((r) => (
                          <li key={r.id} className="p-3">
                            <p className="text-body-md text-on-surface">{r.text}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Pill mono={false}>{CATEGORY_LABEL[r.category]}</Pill>
                              {r.skills.map((s) => (
                                <Pill key={s} tone="info">
                                  {s}
                                </Pill>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </Card>

          {a.responsibilities.length ? (
            <Card aria-labelledby="resp-title">
              <CardHeader id="resp-title" title="What you'd do" />
              <ul className="list-disc space-y-1.5 pl-5 text-body-md text-on-surface">
                {a.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card aria-labelledby="skills-title">
            <CardHeader id="skills-title" title="Skills" description="Recognized from a fixed skills vocabulary." />
            {a.skills.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No known skills were mentioned.</p>
            ) : (
              <div className="space-y-4">
                {TIERS.map((tier) => {
                  const skills = a.skills.filter((s) => s.tier === tier);
                  if (!skills.length) return null;
                  return (
                    <div key={tier}>
                      <h3 className="mb-2 text-label-md text-on-surface-variant">{TIER_LABEL[tier]}</h3>
                      <ul className="flex flex-wrap gap-1.5">
                        {skills.map((s) => (
                          <li key={s.name}>
                            <Pill tone={TIER_TONE[tier]}>{s.name}</Pill>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          {a.keywords.length ? (
            <Card aria-labelledby="kw-title">
              <CardHeader id="kw-title" title="Frequent terms" description="Words the posting repeats most." />
              <ul className="flex flex-wrap gap-1.5">
                {a.keywords.map((k) => (
                  <li key={k}>
                    <Pill>{k}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card aria-labelledby="source-title">
            <CardHeader id="source-title" title="Source" />
            <dl className="space-y-1 text-body-md">
              <div className="flex gap-2">
                <dt className="text-on-surface-variant">Added</dt>
                <dd>{formatDate(j.created_at)}</dd>
              </div>
              {j.source_filename ? (
                <div className="flex min-w-0 gap-2">
                  <dt className="text-on-surface-variant">File</dt>
                  <dd className="break-all">{j.source_filename}</dd>
                </div>
              ) : null}
              {j.source_url ? (
                <div className="flex min-w-0 gap-2">
                  <dt className="text-on-surface-variant">Link</dt>
                  <dd className="break-all">
                    <a href={j.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {j.source_url}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="text-on-surface-variant">Method</dt>
                <dd className="font-mono text-code-sm">{a.analyzer_version}</dd>
              </div>
            </dl>
            <details className="mt-4">
              <summary className="cursor-pointer text-label-md text-primary">Show the original text</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-container-low p-3 font-sans text-body-sm">
                {j.raw_text}
              </pre>
            </details>
          </Card>
        </div>
      </div>
      <DeleteJob job={j} />
    </div>
  );
}

function Facts({ job }: { job: JobDetail }) {
  const a = job.analysis;
  const facts = [
    a.seniority && `Seniority: ${a.seniority}`,
    a.years_experience_min !== null && `${a.years_experience_min}+ years`,
    a.education_level && `Education: ${a.education_level}`,
    a.employment_type,
    a.work_mode,
    a.salary && `Salary: ${a.salary}`,
  ].filter((f): f is string => Boolean(f));
  return (
    <div className="mb-6" aria-label="Key facts">
      {facts.length ? (
        <ul className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f}>
              <Pill mono={false}>{f}</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-md text-on-surface-variant">The posting does not state seniority, salary or work mode.</p>
      )}
    </div>
  );
}

const metaSchema = z.object({
  title: z.string().trim().min(1, "Enter a job title.").max(200, "Keep the title under 200 characters."),
  company: z.string().trim().max(200, "Keep the company name under 200 characters."),
  location: z.string().trim().max(200, "Keep the location under 200 characters."),
});
type MetaValues = z.infer<typeof metaSchema>;

function EditDetails({ job, onDone }: { job: JobDetail; onDone: () => void }) {
  const update = useUpdateJob(job.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MetaValues>({
    resolver: zodResolver(metaSchema),
    defaultValues: { title: job.title, company: job.company ?? "", location: job.location ?? "" },
  });
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await update.mutateAsync(values);
      onDone();
    } catch (error) {
      setFormError(applyServerErrors(error, ["title", "company", "location"], setError));
    }
  });
  return (
    <Card className="mb-6" aria-labelledby="edit-title">
      <CardHeader id="edit-title" title="Edit details" />
      {formError ? (
        <Notice tone="critical" title="Could not save" className="mb-4">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Job title" error={errors.title?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("title")} />}
          </Field>
          <Field label="Company" error={errors.company?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("company")} />}
          </Field>
          <Field label="Location" error={errors.location?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} {...register("location")} />}
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={update.isPending}>
            Save details
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeleteJob({ job }: { job: JobDetail }) {
  const remove = useDeleteJob(job.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="mt-8" aria-labelledby="danger-title">
      <h2 id="danger-title" className="mb-2 text-label-md text-on-surface">
        Delete
      </h2>
      {confirming ? (
        <Notice
          tone="critical"
          title="Delete this job?"
          action={
            <div className="flex gap-2">
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/jobs", { replace: true }) })}
              >
                Delete job
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          }
        >
          The saved description and its analysis are removed. This cannot be undone.
        </Notice>
      ) : (
        <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
          Delete job
        </Button>
      )}
    </section>
  );
}

function AiAnalysis({ job: j }: { job: JobDetail }) {
  const caps = useCapabilities();
  const analyze = useAiAnalyzeJob(j.id);
  const rules = useReanalyzeJob(j.id);
  const a = j.analysis;
  const error = analyze.error ?? rules.error;
  if (!a.ai_provider && !caps.data?.ai.configured) return null;
  return (
    <div className="mb-4 space-y-3">
      {a.ai_provider ? (
        <Notice tone="info" title={`Requirements read by AI (${a.ai_provider} · ${a.ai_model ?? ""})`}>
          <p>
            Each requirement below is quoted from the posting.
            {a.ai_dropped.length
              ? ` ${a.ai_dropped.length === 1 ? "1 item" : `${a.ai_dropped.length} items`} the AI suggested ${a.ai_dropped.length === 1 ? "was" : "were"} left out because the posting does not say ${a.ai_dropped.length === 1 ? "it" : "them"}.`
              : ""}
          </p>
          {a.ai_dropped.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-label-md text-primary">Show what was left out</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {a.ai_dropped.map((d) => (
                  <li key={d} className="break-words">{d}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="mt-3">
            <Button size="sm" variant="secondary" loading={rules.isPending} onClick={() => rules.mutate()}>
              Use the rule-based analysis
            </Button>
          </div>
        </Notice>
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-label-md text-on-surface">Requirements look off?</p>
            <p className="text-body-sm text-on-surface-variant">
              The AI can read the posting again and sort what it asks for. Every requirement it keeps is quoted from the
              posting.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            loading={analyze.isPending}
            icon={<Sparkles className="size-4" aria-hidden />}
            onClick={() => analyze.mutate()}
          >
            Analyze with AI
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
