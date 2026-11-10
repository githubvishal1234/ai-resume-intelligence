import { CheckCircle2, CircleAlert, Download, MinusCircle, XCircle } from "lucide-react";
import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CV_SECTIONS } from "@/constants/templates";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { SectionOrderEditor } from "@/components/resume/SectionOrderEditor";
import { TemplatePicker, type TemplateOption } from "@/components/resume/TemplatePicker";
import { buttonClasses, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/Score";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useProfilePhoto } from "@/hooks/useProfilePhoto";
import { useResume, useResumeList, useSaveContent } from "@/hooks/useResumes";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/services/apiClient";
import { outputService, type AtsReport, type SkillsStyle } from "@/services/outputService";
import { PageHeader } from "@/pages/resumes/common";

const ICON = {
  pass: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
  warn: <CircleAlert className="size-5 shrink-0 text-warning" aria-hidden />,
  fail: <XCircle className="size-5 shrink-0 text-critical" aria-hidden />,
  skip: <MinusCircle className="size-5 shrink-0 text-outline" aria-hidden />,
};
const STATUS_TEXT = { pass: "Passed", warn: "Could improve", fail: "Problem", skip: "Not checked" };

const COPY = {
  resume: {
    title: "Resume Builder",
    description: "Pick a resume and an ATS-safe template, check how screening software reads it, and download the PDF.",
  },
  cv: {
    title: "CV Builder",
    description: "A full-length CV: education first for academic roles, every section kept, still readable by screening software.",
  },
};

export function CvBuilderPage() {
  return <BuilderPage kind="cv" />;
}

export function BuilderPage({ kind = "resume" }: { kind?: "resume" | "cv" }) {
  const resumes = useResumeList();
  const templates = useQuery({ queryKey: ["output", "templates"], queryFn: outputService.templates, staleTime: Infinity });
  const [params, setParams] = useSearchParams();
  const id = useId();

  if (resumes.isPending || templates.isPending) return <PageLoading label="Loading" />;
  if (resumes.isError) return <ErrorState error={resumes.error} onRetry={() => void resumes.refetch()} />;
  if (templates.isError) return <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />;

  const list = [...resumes.data].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "master" ? -1 : 1));
  if (list.length === 0) {
    return (
      <div>
        <PageHeader title={COPY[kind].title} />
        <EmptyState
          title="No resume yet"
          description="Upload or create your master resume, then download it as an ATS-friendly PDF."
          action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
        />
      </div>
    );
  }
  const resumeId = list.some((r) => r.id === params.get("resume")) ? (params.get("resume") as string) : list[0]!.id;
  const offered = templates.data.filter((t) => (t.kind ?? "resume") === kind);
  if (offered.length === 0) {
    return (
      <div>
        <PageHeader title={COPY[kind].title} />
        <EmptyState title="No templates available" description="The server offers no templates of this kind yet. Try again after it has been updated." />
      </div>
    );
  }
  const template = offered.some((t) => t.id === params.get("template")) ? (params.get("template") as string) : offered[0]!.id;
  const font = params.get("font") ?? "";
  const skills: SkillsStyle = params.get("skills") === "table" ? "table" : "";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const resume = list.find((r) => r.id === resumeId)!;
  const filename = `${resume.title.replace(/[^\w\- ]+/g, "").trim().replace(/ /g, "-") || "resume"}.pdf`;

  return (
    <div>
      <PageHeader title={COPY[kind].title} description={COPY[kind].description} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card aria-labelledby={`${id}-opts`}>
            <CardHeader id={`${id}-opts`} title="Options" />
            <div className="space-y-1.5">
              <label htmlFor={`${id}-resume`} className="block text-label-md text-on-surface">Resume</label>
              <select
                id={`${id}-resume`}
                value={resumeId}
                onChange={(e) => update("resume", e.target.value)}
                className="h-10 w-full rounded-control border border-hairline bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary focus:shadow-focus focus:outline-none"
              >
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind === "master" ? "Master: " : "Tailored: "}
                    {r.title} (v{r.current_version})
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-4 text-label-md text-on-surface">
              Template: <span className="text-primary">{offered.find((t) => t.id === template)?.name ?? template}</span>
              {font ? <> · Font: <span className="text-primary">{font}</span></> : null}
              {skills ? <> · Skills: <span className="text-primary">Table</span></> : null}
            </p>
            <a
              href={outputService.pdfUrl(resumeId, template, font, skills)}
              download={filename}
              className={buttonClasses("primary", "md", "mt-4 w-full")}
            >
              <Download className="size-4" aria-hidden /> Download PDF
            </a>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              Single column, standard fonts and headings, real text. The final template set is still to be approved.
            </p>
          </Card>
          {kind === "resume" ? <SectionOrderCard resumeId={resumeId} /> : null}
          <LivePreview resumeId={resumeId} template={template} font={font} skills={skills} />
        </div>
        <AtsPanel resumeId={resumeId} template={template} font={font} skills={skills} />
      </div>
      {kind === "cv" ? <CvSections resumeId={resumeId} /> : null}
      <TemplateGallery
        resumeId={resumeId}
        templates={offered}
        value={template}
        font={font}
        onChange={(t) => update("template", t)}
        onFontChange={(f) => update("font", f)}
        skills={skills}
        onSkillsChange={(v) => update("skills", v)}
      />
    </div>
  );
}

function CvSections({ resumeId }: { resumeId: string }) {
  const resume = useResume(resumeId);
  if (!resume.data) return null;
  const have = new Set(resume.data.content.other.map((o) => o.heading.trim().toLowerCase()));
  return (
    <Card className="mt-6" aria-labelledby="cv-sections">
      <CardHeader
        id="cv-sections"
        title="CV sections"
        description="A CV usually adds these to a resume. Add the ones that apply as extra sections in the editor; they print after the standard sections."
      />
      <ul className="flex flex-wrap gap-2">
        {CV_SECTIONS.map((name) => {
          const done = have.has(name.toLowerCase());
          return (
            <li key={name} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-label-md ${done ? "border-success-border bg-success-surface text-success-ink" : "border-hairline-strong text-on-surface-variant"}`}>
              {done ? <CheckCircle2 className="size-4" aria-hidden /> : <MinusCircle className="size-4" aria-hidden />}
              {name}
              <span className="sr-only">{done ? " (added)" : " (not added)"}</span>
            </li>
          );
        })}
      </ul>
      <ButtonLink to={`/resumes/${resumeId}/edit`} className="mt-4">Add sections in the editor</ButtonLink>
    </Card>
  );
}

/** The resume's section order. A change is saved as a new version, so every copy keeps it. */
function SectionOrderCard({ resumeId }: { resumeId: string }) {
  const resume = useResume(resumeId);
  const save = useSaveContent(resumeId);
  if (!resume.data) return null;
  const data = resume.data;
  return (
    <Card>
      <SectionOrderEditor
        doc={data.content}
        busy={save.isPending}
        onChange={(order) =>
          save.mutate({ baseVersion: data.current_version, content: { ...data.content, section_order: order }, note: "Section order" })
        }
      />
      {save.isError ? (
        <Notice tone="critical" title="Couldn't save the order" className="mt-3">
          {save.error instanceof ApiError ? save.error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
    </Card>
  );
}

function LivePreview({ resumeId, template, font, skills }: { resumeId: string; template: string; font: string; skills: SkillsStyle }) {
  const resume = useResume(resumeId);
  const photo = useProfilePhoto();
  if (!resume.data) return null;
  return (
    <div className="hidden space-y-2 lg:block">
      <p className="text-label-md text-on-surface-variant">Preview</p>
      <ResumePaper doc={resume.data.content} template={template} font={font} skillsTable={skills === "table"} photoUrl={photo.url} />
    </div>
  );
}

function TemplateGallery({ resumeId, templates, value, font, onChange, onFontChange, skills, onSkillsChange }: {
  resumeId: string;
  templates: TemplateOption[];
  value: string;
  font: string;
  onChange: (id: string) => void;
  onFontChange: (id: string) => void;
  skills: SkillsStyle;
  onSkillsChange: (style: SkillsStyle) => void;
}) {
  const resume = useResume(resumeId);
  return (
    <section aria-labelledby="gallery-title" className="mt-8">
      <CardHeader id="gallery-title" title="Choose a template" description="Each preview shows your own resume. The ATS check and download follow your choice." />
      {resume.data ? (
        <TemplatePicker templates={templates} value={value} onChange={onChange} doc={resume.data.content} font={font} onFontChange={onFontChange} skills={skills} onSkillsChange={onSkillsChange} />
      ) : resume.isError ? (
        <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />
      ) : (
        <PageLoading label="Loading previews" />
      )}
    </section>
  );
}

function AtsPanel({ resumeId, template, font, skills }: { resumeId: string; template: string; font: string; skills: SkillsStyle }) {
  const report = useQuery({
    queryKey: ["output", "ats", resumeId, template, font, skills],
    queryFn: () => outputService.ats(resumeId, template, font, skills),
  });
  if (report.isPending) return <PageLoading label="Checking the PDF" />;
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  return <AtsView report={report.data} />;
}

function AtsView({ report: r }: { report: AtsReport }) {
  return (
    <div className="space-y-6">
      <Card aria-labelledby="ats-title">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing value={r.score} size={112} label="ATS checks" />
          <div className="min-w-0 flex-1">
            <h2 id="ats-title" className="font-display text-headline-sm text-on-surface">ATS readability</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              We render the PDF and read it back the way screening software does ({r.method_version},{" "}
              {r.pages} page{r.pages === 1 ? "" : "s"}). This checks readability, not your chances.
            </p>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-hairline">
          {r.checks.map((c) => (
            <li key={c.id} className="flex gap-3 py-3">
              {ICON[c.status]}
              <div className="min-w-0">
                <p className="text-label-md text-on-surface">
                  {c.title} <span className="sr-only">({STATUS_TEXT[c.status]})</span>
                </p>
                <p className="text-body-md text-on-surface-variant">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card aria-labelledby="extract-title">
        <CardHeader id="extract-title" title="What screening software reads" description="The text extracted from your PDF, in order." />
        <pre
          tabIndex={0}
          aria-label="Extracted text"
          className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-container-low p-3 font-mono text-code-sm"
        >
          {r.extracted_preview}
        </pre>
      </Card>
    </div>
  );
}
