import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eye, EyeOff, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { TextBacked } from "@/components/resume/ResumeEditor";
import { TemplatePicker, type TemplateOption } from "@/components/resume/TemplatePicker";
import { linesToList, listToLines, skillsToText, textToSkills } from "@/components/resume/editorText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { DEFAULT_TEMPLATE, TEMPLATE_STYLES } from "@/constants/templates";
import { useCreateResume, useMasterSummary, useResume, useSaveContent } from "@/hooks/useResumes";
import { useProfilePhoto } from "@/hooks/useProfilePhoto";
import { useSession } from "@/hooks/useSession";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { cn } from "@/lib/cn";
import { clearDraft, readDraft, writeDraft } from "@/lib/draftStorage";
import {
  ACTION_VERBS,
  bulletTips,
  completeness,
  draftSummary,
  resumeChecklist,
  SAMPLE_RESUME,
  SKILL_PRESETS,
  type StepId,
} from "@/lib/resumeHelpers";
import { ApiError } from "@/services/apiClient";
import { outputService } from "@/services/outputService";
import { emptyResume, newId, type Education, type Experience, type ResumeDetail, type ResumeDoc } from "@/services/resumeService";
import { PageHeader } from "./common";

const STEPS: { id: StepId; label: string; title: string; description: string }[] = [
  { id: "style", label: "Style", title: "Pick a style", description: "Every template is real text that applicant tracking systems can read; one-column designs are the safest. You can switch at any time." },
  { id: "contact", label: "Contact", title: "How can employers reach you?", description: "Use a professional email address. A city is enough for location." },
  { id: "experience", label: "Experience", title: "Your work experience", description: "Most recent first. Internships, freelance and volunteer work all count." },
  { id: "education", label: "Education", title: "Your education", description: "Your highest degree is usually enough." },
  { id: "skills", label: "Skills", title: "Your skills", description: "Pick the ones you can talk about in an interview." },
  { id: "summary", label: "Summary", title: "Your summary", description: "Written last, because it sums up the rest." },
  { id: "finish", label: "Finish", title: "Review and save", description: "Check what's missing, then save and download your PDF." },
];

type Draft = { doc: ResumeDoc; template: string; title: string; step: number };

const blankRole = (): Experience => ({ id: newId(), title: "", company: "", location: "", start_date: "", end_date: "", current: false, bullets: [] });
const blankSchool = (): Education => ({ id: newId(), institution: "", degree: "", field_of_study: "", start_date: "", end_date: "", details: [] });
const isBlank = (doc: ResumeDoc) => JSON.stringify(doc) === JSON.stringify(emptyResume());

/** Starts from the master resume when there is one (saving adds a version), else from scratch. */
export function QuickBuilderPage() {
  const session = useSession();
  const masters = useMasterSummary();
  const templates = useQuery({ queryKey: ["output", "templates"], queryFn: outputService.templates, staleTime: Infinity });
  if (masters.isPending || templates.isPending || session.isPending) return <PageLoading label="Loading the builder" />;
  if (masters.isError) return <ErrorState error={masters.error} onRetry={() => void masters.refetch()} />;
  if (templates.isError) return <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />;
  const userId = session.data?.user.id ?? "anonymous";
  // CV templates have their own builder; the quick builder makes resumes.
  const resumeTemplates = templates.data.filter((t) => (t.kind ?? "resume") === "resume");
  if (masters.master) return <FromMaster id={masters.master.id} templates={resumeTemplates} userId={userId} />;
  return <Builder templates={resumeTemplates} userId={userId} />;
}

function FromMaster({ id, templates, userId }: { id: string; templates: TemplateOption[]; userId: string }) {
  const resume = useResume(id);
  if (resume.isPending) return <PageLoading label="Loading your resume" />;
  if (resume.isError) return <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />;
  return <Builder key={`${resume.data.id}:${resume.data.current_version}`} templates={templates} userId={userId} master={resume.data} />;
}

function Builder({ templates, userId, master }: { templates: TemplateOption[]; userId: string; master?: ResumeDetail }) {
  const navigate = useNavigate();
  const draftKey = `quick-builder:${userId}`;
  const photo = useProfilePhoto();
  const [initial] = useState<Draft>(() => {
    if (master) return { doc: master.content, template: DEFAULT_TEMPLATE, title: master.title, step: 1 };
    return readDraft<Draft>(draftKey) ?? { doc: emptyResume(), template: DEFAULT_TEMPLATE, title: "Master resume", step: 0 };
  });
  const [doc, setDoc] = useState<ResumeDoc>(initial.doc);
  // A template picked in the gallery (?template=) wins over the one saved in the draft.
  const [params] = useSearchParams();
  const [template, setTemplate] = useState(
    [params.get("template"), initial.template].find((id) => templates.some((t) => t.id === id)) ?? templates[0]?.id ?? DEFAULT_TEMPLATE,
  );
  const [title, setTitle] = useState(initial.title);
  const [step, setStep] = useState(Math.min(initial.step, STEPS.length - 1));
  const [showPreview, setShowPreview] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const create = useCreateResume();
  const save = useSaveContent(master?.id ?? "");
  const pending = create.isPending || save.isPending;
  const error = create.error ?? save.error;

  // Only edits to an existing master need the leave warning; a new resume is kept as a draft.
  const allowLeave = useUnsavedGuard(Boolean(master) && JSON.stringify(doc) !== JSON.stringify(master?.content));

  useEffect(() => {
    if (!master) writeDraft(draftKey, { doc, template, title, step } satisfies Draft);
  }, [master, draftKey, doc, template, title, step]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const percent = completeness(doc);
  const current = STEPS[step]!;
  const blank = isBlank(doc);
  // Until something is entered, previews show a clearly labelled sample instead of an empty page.
  const previewDoc = blank ? SAMPLE_RESUME : doc;
  const previewNote = blank ? "Sample shown until you add your details." : "The downloaded PDF uses the same layout with embedded fonts.";
  const wide = current.id === "style";
  const name = doc.contact.full_name.trim();
  const goPdf = (id: string) => navigate(`/builder?resume=${id}&template=${template}`);

  const onSave = () => {
    if (master) {
      save.mutate(
        { baseVersion: master.current_version, content: doc, note: "Edited in the quick builder" },
        { onSuccess: (r) => { allowLeave(); goPdf(r.id); } },
      );
    } else {
      create.mutate(
        { title: title.trim() || "Master resume", content: doc },
        { onSuccess: (r) => { clearDraft(draftKey); goPdf(r.id); } },
      );
    }
  };

  const startOver = () => {
    if (!window.confirm("Clear everything you entered and start again?")) return;
    clearDraft(draftKey);
    setDoc(emptyResume());
    setTitle("Master resume");
    setStep(0);
  };

  return (
    <div className="pb-28 md:pb-20">
      <PageHeader
        title="Quick Resume Builder"
        description={
          master
            ? `Editing your master resume (version ${master.current_version}). Saving creates version ${master.current_version + 1}.`
            : "Seven short steps with a live preview. Your progress is kept in this browser until you save."
        }
        back={{ to: "/resumes", label: "My Resumes" }}
        actions={!master && !isBlank(doc) ? <Button variant="ghost" size="sm" onClick={startOver}>Start over</Button> : null}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="flex justify-between text-label-md">
            <span className="text-on-surface">Step {step + 1} of {STEPS.length}: {current.label}</span>
            <span className="text-on-surface-variant tnum">{percent}% complete</span>
          </div>
          <div role="progressbar" aria-label="Resume completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setShowPreview((v) => !v)}
          icon={showPreview ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} aria-expanded={showPreview}>
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </div>

      {/* relative: keeps the absolutely positioned sr-only labels inside the scroller on phones */}
      <nav aria-label="Builder steps" className="relative -mx-1 mb-6 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-max gap-2">
          {STEPS.map((s, i) => {
            const done = i < STEPS.length - 1 && i > 0 && resumeChecklist(doc).filter((c) => c.step === s.id).every((c) => c.ok);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-body-md font-semibold transition-colors",
                    i === step
                      ? "border-primary bg-primary text-on-primary shadow-brand"
                      : "border-hairline bg-surface-container-lowest text-on-surface-variant hover:border-primary-fixed-dim hover:text-on-surface",
                  )}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-label-sm tnum",
                    done ? "border-success bg-success text-on-primary" : i === step ? "border-on-primary bg-on-primary text-primary" : "border-hairline-strong")}>
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  {s.label}
                  {done ? <span className="sr-only">(complete)</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">

        <section aria-labelledby="step-title" className={cn("min-w-0", wide && "lg:col-span-2")}>
          <Card key={current.id} className="animate-rise">
            <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-headline-lg font-extrabold tracking-[-0.03em] text-on-surface focus:outline-none">
              {current.title}
            </h2>
            <p className="mt-1 mb-6 text-body-md text-on-surface-variant">{current.description}</p>
            {current.id === "style" ? <TemplatePicker templates={templates} value={template} onChange={setTemplate} doc={previewDoc} columns="sm:grid-cols-2 xl:grid-cols-3" /> : null}
            {current.id === "contact" ? <ContactStep doc={doc} onChange={setDoc} /> : null}
            {current.id === "experience" ? <ExperienceStep doc={doc} onChange={setDoc} /> : null}
            {current.id === "education" ? <EducationStep doc={doc} onChange={setDoc} /> : null}
            {current.id === "skills" ? <SkillsStep doc={doc} onChange={setDoc} /> : null}
            {current.id === "summary" ? <SummaryStep doc={doc} onChange={setDoc} /> : null}
            {current.id === "finish" ? (
              <FinishStep doc={doc} master={master} title={title} onTitle={setTitle} onGo={(id) => setStep(STEPS.findIndex((s) => s.id === id))} />
            ) : null}
            {error ? (
              <Notice tone="critical" title="Could not save" className="mt-6">
                {error instanceof ApiError ? error.message : "Something went wrong. Try again."}
              </Notice>
            ) : null}
          </Card>
          {showPreview ? (
            <div className="mt-6 space-y-2 lg:hidden">
              <ResumePaper doc={previewDoc} template={template} photoUrl={photo.url} />
              <p className="text-body-sm text-on-surface-variant">{previewNote}</p>
            </div>
          ) : null}
        </section>

        {wide ? null : (
          <aside aria-label="Live preview" className="hidden lg:block">
            <div className="sticky top-24 space-y-3 rounded-panel bg-surface-container-high p-4">
              <p className="flex items-center gap-2 text-label-md font-semibold text-on-surface">
                <span aria-hidden className="size-2 animate-pulse rounded-full bg-success" />
                Live preview · {TEMPLATE_STYLES.find((t) => t.id === template)?.name ?? template}
              </p>
              <ResumePaper doc={previewDoc} template={template} photoUrl={photo.url} />
              <p className="text-body-sm text-on-surface-variant">{previewNote}</p>
            </div>
          </aside>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-hairline bg-surface-container-lowest/95 px-4 py-3 backdrop-blur md:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2">
          <Button variant="ghost" disabledReason={step === 0 ? "This is the first step." : undefined} onClick={() => setStep((s) => s - 1)} icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next: {STEPS[step + 1]!.label} <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button loading={pending} disabledReason={name ? undefined : "Add your name in the Contact step first."} onClick={onSave}>
              {master ? "Save new version and get PDF" : "Save and get my PDF"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type StepProps = { doc: ResumeDoc; onChange: (doc: ResumeDoc) => void };

function Text({ label, value, onChange, hint, type = "text", placeholder, autoComplete, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; placeholder?: string; autoComplete?: string; readOnly?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} readOnly={readOnly}
          aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function ContactStep({ doc, onChange }: StepProps) {
  const c = doc.contact;
  const set = (patch: Partial<ResumeDoc["contact"]>) => onChange({ ...doc, contact: { ...c, ...patch } });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Text label="Full name" value={c.full_name} autoComplete="name" onChange={(v) => set({ full_name: v })} />
      </div>
      <Text label="Email" type="email" autoComplete="email" value={c.email} onChange={(v) => set({ email: v })} />
      <Text label="Phone" type="tel" autoComplete="tel" value={c.phone} onChange={(v) => set({ phone: v })} />
      <Text label="Location" placeholder="City, Country" value={c.location} onChange={(v) => set({ location: v })} />
      <Text label="Links" hint="LinkedIn, GitHub or portfolio, separated by commas." value={c.links.join(", ")}
        onChange={(v) => set({ links: v.split(",").map((x) => x.trim()).filter(Boolean) })} />
    </div>
  );
}

function EntryCard({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <fieldset className="rounded-control border border-hairline p-4">
      <legend className="px-1 text-label-md text-on-surface-variant">{label}</legend>
      <div className="mb-2 flex justify-end">
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`} onClick={onRemove} icon={<Trash2 className="size-4" aria-hidden />} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function ExperienceStep({ doc, onChange }: StepProps) {
  const roles = doc.experience;
  const setRoles = (experience: Experience[]) => onChange({ ...doc, experience });
  const bulletsId = useId();
  return (
    <div className="space-y-5">
      <Notice tone="info" title="A strong bullet point">
        Action verb + what you did + the result, with a number. For example: “Reduced report time by 40% by automating the weekly export.”
      </Notice>
      {roles.length === 0 ? <p className="text-body-md text-on-surface-variant">No roles yet. Add your most recent one.</p> : null}
      {roles.map((e, i) => {
        const update = (patch: Partial<Experience>) => setRoles(roles.map((r, j) => (j === i ? { ...e, ...patch } : r)));
        const tips = e.bullets.map((b, n) => ({ n: n + 1, tips: bulletTips(b) })).filter((x) => x.tips.length);
        return (
          <EntryCard key={e.id} label={e.title || `Role ${i + 1}`} onRemove={() => setRoles(roles.filter((_, j) => j !== i))}>
            <Text label="Job title" value={e.title} onChange={(v) => update({ title: v })} />
            <Text label="Company" value={e.company} onChange={(v) => update({ company: v })} />
            <Text label="Location" value={e.location} onChange={(v) => update({ location: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Text label="Start" placeholder="Jan 2022" value={e.start_date} onChange={(v) => update({ start_date: v })} />
              {e.current ? (
                <Text label="End" value="Present" readOnly onChange={() => undefined} hint="Untick below to set an end date." />
              ) : (
                <Text label="End" placeholder="Mar 2024" value={e.end_date} onChange={(v) => update({ end_date: v })} />
              )}
            </div>
            <label className="flex items-center gap-2 text-body-md text-on-surface sm:col-span-2">
              <input type="checkbox" className="accent-primary" checked={e.current} onChange={(ev) => update({ current: ev.target.checked, end_date: ev.target.checked ? "Present" : "" })} />
              I currently work here
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Field label="What you achieved" hint="One point per line. Two to five points per role.">
                {({ id, describedBy }) => (
                  <TextBacked id={id} aria-describedby={describedBy ? `${describedBy} ${bulletsId}-${i}` : `${bulletsId}-${i}`} rows={5}
                    value={e.bullets} onChange={(bullets) => update({ bullets })} toText={listToLines} fromText={linesToList} />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Start a new point with an action verb">
                <span className="text-body-sm text-on-surface-variant">Start a point with:</span>
                {ACTION_VERBS.map((verb) => (
                  <button key={verb} type="button" onClick={() => update({ bullets: [...e.bullets, verb] })}
                    className="rounded-full border border-hairline px-2.5 py-0.5 text-label-sm text-on-surface hover:border-primary hover:text-primary">
                    {verb}
                  </button>
                ))}
              </div>
              <div id={`${bulletsId}-${i}`} aria-live="polite">
                {tips.length ? (
                  <ul className="space-y-1 rounded-control bg-warning-surface p-3 text-body-sm text-warning-ink">
                    {tips.map((t) => (
                      <li key={t.n} className="flex gap-2">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>Point {t.n}: {t.tips.join(" ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </EntryCard>
        );
      })}
      <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setRoles([...roles, blankRole()])}>
        {roles.length ? "Add another role" : "Add a role"}
      </Button>
    </div>
  );
}

function EducationStep({ doc, onChange }: StepProps) {
  const items = doc.education;
  const setItems = (education: Education[]) => onChange({ ...doc, education });
  return (
    <div className="space-y-5">
      {items.length === 0 ? <p className="text-body-md text-on-surface-variant">Nothing added yet.</p> : null}
      {items.map((e, i) => {
        const update = (patch: Partial<Education>) => setItems(items.map((r, j) => (j === i ? { ...e, ...patch } : r)));
        return (
          <EntryCard key={e.id} label={e.institution || `Education ${i + 1}`} onRemove={() => setItems(items.filter((_, j) => j !== i))}>
            <div className="sm:col-span-2">
              <Text label="School, college or university" value={e.institution} onChange={(v) => update({ institution: v })} />
            </div>
            <Text label="Degree" placeholder="B.Tech, MBA, Diploma…" value={e.degree} onChange={(v) => update({ degree: v })} />
            <Text label="Field of study" value={e.field_of_study} onChange={(v) => update({ field_of_study: v })} />
            <Text label="Start" placeholder="2018" value={e.start_date} onChange={(v) => update({ start_date: v })} />
            <Text label="End" placeholder="2022" value={e.end_date} onChange={(v) => update({ end_date: v })} />
          </EntryCard>
        );
      })}
      <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setItems([...items, blankSchool()])}>
        {items.length ? "Add another" : "Add education"}
      </Button>
    </div>
  );
}

function SkillsStep({ doc, onChange }: StepProps) {
  const [field, setField] = useState(Object.keys(SKILL_PRESETS)[0]!);
  const has = (name: string) => doc.skills.some((s) => s.name.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    onChange({
      ...doc,
      skills: has(name) ? doc.skills.filter((s) => s.name.toLowerCase() !== name.toLowerCase()) : [...doc.skills, { id: newId(), name, category: "" }],
    });
  return (
    <div className="space-y-6">
      <Field label="Your skills" hint={`Separated by commas. Optional groups, one per line: "Languages: Python, Go". ${doc.skills.length} added.`}>
        {({ id, describedBy }) => (
          <TextBacked id={id} aria-describedby={describedBy} rows={4} value={doc.skills} toText={skillsToText}
            fromText={(text) => textToSkills(text, doc.skills)} onChange={(skills) => onChange({ ...doc, skills })} />
        )}
      </Field>
      <div className="space-y-3 rounded-control bg-surface-container-low p-4">
        <div className="max-w-sm">
          <Field label="Suggestions for your field">
            {({ id }) => (
              <Select id={id} value={field} onChange={(e) => setField(e.target.value)}>
                {Object.keys(SKILL_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Suggested skills for ${field}`}>
          {SKILL_PRESETS[field]!.map((skill) => {
            const on = has(skill);
            return (
              <button key={skill} type="button" aria-pressed={on} onClick={() => toggle(skill)}
                className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-body-sm transition-colors",
                  on ? "border-primary bg-primary text-on-primary" : "border-hairline bg-surface-container-lowest text-on-surface hover:border-primary")}>
                {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                {skill}
              </button>
            );
          })}
        </div>
        <p className="text-body-sm text-on-surface-variant">Only add skills you have used. Interviewers ask about them.</p>
      </div>
    </div>
  );
}

function SummaryStep({ doc, onChange }: StepProps) {
  const [drafted, setDrafted] = useState<string | null>(null);
  const draft = draftSummary(doc);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<Wand2 className="size-4" aria-hidden />}
          disabledReason={draft ? undefined : "Add a role with a title, plus skills or education, first."}
          onClick={() => { setDrafted(doc.summary); onChange({ ...doc, summary: draft }); }}>
          {doc.summary.trim() ? "Replace with a draft from my entries" : "Draft it from my entries"}
        </Button>
        {drafted !== null ? (
          <Button variant="ghost" onClick={() => { onChange({ ...doc, summary: drafted }); setDrafted(null); }}>Undo</Button>
        ) : null}
      </div>
      {drafted !== null ? (
        <Notice tone="info" title="Drafted only from what you entered">
          Nothing was added that isn't in your resume. Read it and make it sound like you.
        </Notice>
      ) : null}
      <Field label="Professional summary" hint={`Two to four sentences. ${doc.summary.trim().length} characters.`}>
        {({ id, describedBy }) => (
          <Textarea id={id} aria-describedby={describedBy} rows={5} value={doc.summary} onChange={(e) => onChange({ ...doc, summary: e.target.value })} />
        )}
      </Field>
      <ul className="list-disc space-y-1 pl-5 text-body-sm text-on-surface-variant">
        <li>Lead with your role and experience level.</li>
        <li>Name two or three skills the jobs you want ask for.</li>
        <li>Mention one result you're proud of, with a number.</li>
      </ul>
    </div>
  );
}

function FinishStep({ doc, master, title, onTitle, onGo }: {
  doc: ResumeDoc; master: ResumeDetail | undefined; title: string; onTitle: (v: string) => void; onGo: (step: StepId) => void;
}) {
  const checks = resumeChecklist(doc);
  const missing = checks.filter((c) => !c.ok).length;
  return (
    <div className="space-y-6">
      {!master ? (
        <div className="max-w-md">
          <Text label="Resume title" hint="Only you see this, in My Resumes." value={title} onChange={onTitle} />
        </div>
      ) : null}
      <div>
        <p className="mb-3 flex items-center gap-2 text-label-md text-on-surface">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {missing === 0 ? "Everything a strong resume needs is here." : `${missing} thing${missing === 1 ? "" : "s"} would make it stronger. You can still save now.`}
        </p>
        <ul className="divide-y divide-hairline rounded-control border border-hairline">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 p-3">
              {c.ok ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="text-label-md text-on-surface">
                  {c.label} <span className="sr-only">{c.ok ? "(done)" : "(missing)"}</span>
                </p>
                {!c.ok ? <p className="text-body-sm text-on-surface-variant">{c.hint}</p> : null}
              </div>
              {!c.ok ? <Button variant="ghost" size="sm" onClick={() => onGo(c.step)}>Fix</Button> : null}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Projects, certifications and other sections can be added in the full editor after saving. Next you'll see the ATS check and can download the PDF.
      </p>
    </div>
  );
}
