import { Download, FileSignature, Plus, Quote, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LetterPaper } from "@/components/resume/LetterPaper";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Button, buttonClasses, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useCreateLetter, useDeleteLetter, useLetter, useLetterList, useUpdateLetter } from "@/hooks/useCoverLetters";
import { useJobList } from "@/hooks/useJobs";
import { useResume, useResumeList } from "@/hooks/useResumes";
import { coverLetterService, type Letter } from "@/services/coverLetterService";
import { outputService } from "@/services/outputService";
import { formatDate, PageHeader } from "@/pages/resumes/common";

function useTemplates() {
  return useQuery({ queryKey: ["output", "templates"], queryFn: outputService.templates, staleTime: Infinity });
}

export function CoverLettersPage() {
  const letters = useLetterList();
  if (letters.isPending) return <PageLoading label="Loading cover letters" />;
  if (letters.isError) return <ErrorState error={letters.error} onRetry={() => void letters.refetch()} />;
  return (
    <div>
      <PageHeader
        title="Cover Letter Builder"
        photo="register"
        description="A first draft from your own resume, matched to the job: every claim in it is a line you already wrote."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <NewLetter />
        <section aria-labelledby="letters-title">
          <h2 id="letters-title" className="mb-3 font-display text-headline-sm text-on-surface">Your cover letters</h2>
          {letters.data.length === 0 ? (
            <EmptyState
              icon={<FileSignature className="size-8" aria-hidden />}
              title="No cover letters yet"
              description="Pick a resume and a saved job, and you get a draft that answers the job's requirements with your real experience."
            />
          ) : (
            <ul className="space-y-3">
              {letters.data.map((l) => (
                <li key={l.id}>
                  <Card className="relative hover:border-primary">
                    <Link to={`/cover-letters/${l.id}`} className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary">
                      {l.title}
                    </Link>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {l.company || "No company"} · edited {formatDate(l.updated_at)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function NewLetter() {
  const resumes = useResumeList();
  const jobs = useJobList();
  const templates = useTemplates();
  const create = useCreateLetter();
  const navigate = useNavigate();
  const [resumeId, setResumeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [template, setTemplate] = useState("classic");
  const list = resumes.data ?? [];
  const chosen = resumeId || list.find((r) => r.kind === "master")?.id || list[0]?.id || "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { resume_id: chosen || null, job_id: jobId || null, template },
      { onSuccess: (l) => navigate(`/cover-letters/${l.id}`) },
    );
  };

  return (
    <Card>
      <CardHeader title="New cover letter" description="Drafted in a second, from your resume. You edit it before anyone sees it." />
      {resumes.data && list.length === 0 ? (
        <Notice tone="info" title="Add your master resume first">
          The draft quotes your resume. <Link to="/resumes/upload" className="font-semibold underline">Upload or build one</Link>.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Resume">
            {({ id }) => (
              <Select id={id} value={chosen} onChange={(e) => setResumeId(e.target.value)}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind === "master" ? "Master: " : "Tailored: "}
                    {r.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Job" hint="Pick a saved job so the letter answers its requirements.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">No specific job</option>
                {(jobs.data ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.company ? ` · ${j.company}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Style">
            {({ id }) => (
              <Select id={id} value={template} onChange={(e) => setTemplate(e.target.value)}>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={create.isPending} icon={<Plus className="size-4" aria-hidden />}>
            Draft my cover letter
          </Button>
          {create.isError ? <p role="alert" className="text-body-sm text-critical-ink"><ApiErrorText error={create.error} /></p> : null}
        </form>
      )}
    </Card>
  );
}

export function CoverLetterEditPage() {
  const { letterId = "" } = useParams();
  const letter = useLetter(letterId);
  if (letter.isPending) return <PageLoading label="Loading cover letter" />;
  if (letter.isError) return <ErrorState error={letter.error} onRetry={() => void letter.refetch()} />;
  return <Editor key={letter.data.id} letter={letter.data} />;
}

function Editor({ letter }: { letter: Letter }) {
  const [draft, setDraft] = useState({
    title: letter.title,
    recipient_name: letter.recipient_name,
    company: letter.company,
    body: letter.body,
    template: letter.template,
  });
  const save = useUpdateLetter(letter.id);
  const remove = useDeleteLetter();
  const navigate = useNavigate();
  const templates = useTemplates();
  const resume = useResume(letter.resume_id ?? "");
  const [confirming, setConfirming] = useState(false);
  const dirty = (Object.keys(draft) as (keyof typeof draft)[]).some((k) => draft[k] !== letter[k]);
  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const stop = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty]);

  const contact = resume.data?.content.contact ?? { full_name: "", email: "", phone: "", location: "", links: [] };
  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;

  return (
    <div>
      <PageHeader
        title={draft.title || "Cover letter"}
        description={`Edited ${formatDate(letter.updated_at)} · ${words} words`}
        back={{ to: "/cover-letters", label: "Cover letters" }}
        actions={
          <>
            <Button variant="primary" loading={save.isPending} disabledReason={dirty ? undefined : "No changes to save"} onClick={() => save.mutate(draft)} icon={<Save className="size-4" aria-hidden />}>
              Save
            </Button>
            {dirty ? (
              <Button variant="secondary" disabledReason="Save your changes first, then download" icon={<Download className="size-4" aria-hidden />}>
                Download PDF
              </Button>
            ) : (
              <a href={coverLetterService.pdfUrl(letter.id)} download className={buttonClasses("secondary")}>
                <Download className="size-4" aria-hidden /> Download PDF
              </a>
            )}
          </>
        }
      />
      {save.isError ? <p role="alert" className="mb-4 text-body-sm text-critical-ink"><ApiErrorText error={save.error} /></p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title (only you see this)">{({ id }) => <Input id={id} value={draft.title} maxLength={200} onChange={(e) => set("title")(e.target.value)} />}</Field>
              <Field label="Style">
                {({ id }) => (
                  <Select id={id} value={draft.template} onChange={(e) => set("template")(e.target.value)}>
                    {(templates.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Hiring manager" hint="Leave empty for “Dear Hiring Manager”.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={draft.recipient_name} maxLength={200} onChange={(e) => set("recipient_name")(e.target.value)} />}
              </Field>
              <Field label="Company">{({ id }) => <Input id={id} value={draft.company} maxLength={200} onChange={(e) => set("company")(e.target.value)} />}</Field>
            </div>
            <div className="mt-4">
              <Field label="Letter" hint="Leave a blank line between paragraphs. The greeting and sign-off are added for you.">
                {({ id, describedBy }) => (
                  <Textarea id={id} aria-describedby={describedBy} rows={16} maxLength={10000} value={draft.body} onChange={(e) => set("body")(e.target.value)} />
                )}
              </Field>
            </div>
          </Card>

          {letter.evidence.length ? (
            <Card>
              <CardHeader title="Evidence in this draft" description="Each paragraph answers a requirement with a line from your resume, word for word." />
              <ul className="space-y-3">
                {letter.evidence.map((p, i) => (
                  <li key={i} className="flex gap-3 rounded-control border border-hairline bg-surface-container-low p-3">
                    <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      {p.requirement ? <p className="text-label-md font-semibold text-on-surface">{p.requirement}</p> : null}
                      <p className="mt-0.5 text-body-md text-on-surface">“{p.excerpt}”</p>
                      <p className="mt-0.5 text-body-sm text-on-surface-variant">{p.source}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <section aria-labelledby="letter-delete">
            <h2 id="letter-delete" className="mb-2 text-label-md text-on-surface">Delete</h2>
            {confirming ? (
              <Notice
                tone="critical"
                title="Delete this cover letter?"
                action={
                  <div className="flex gap-2">
                    <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate(letter.id, { onSuccess: () => navigate("/cover-letters", { replace: true }) })}>
                      Delete
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
                  </div>
                }
              >
                This cannot be undone.
              </Notice>
            ) : (
              <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
                Delete cover letter
              </Button>
            )}
          </section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <p className="mb-2 text-label-md text-on-surface-variant">Live preview</p>
          <LetterPaper contact={contact} recipient={draft.recipient_name} company={draft.company} body={draft.body} template={draft.template} />
          <ButtonLink to="/builder" variant="ghost" className="mt-3">Matching resume PDF →</ButtonLink>
        </div>
      </div>
    </div>
  );
}
