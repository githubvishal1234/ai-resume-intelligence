import { CheckCircle2, CircleAlert, Download, MinusCircle, XCircle } from "lucide-react";
import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buttonClasses, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/Score";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useResumeList } from "@/hooks/useResumes";
import { cn } from "@/lib/cn";
import { outputService, type AtsReport } from "@/services/outputService";
import { PageHeader } from "@/pages/resumes/common";

const ICON = {
  pass: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
  warn: <CircleAlert className="size-5 shrink-0 text-warning" aria-hidden />,
  fail: <XCircle className="size-5 shrink-0 text-critical" aria-hidden />,
  skip: <MinusCircle className="size-5 shrink-0 text-outline" aria-hidden />,
};
const STATUS_TEXT = { pass: "Passed", warn: "Could improve", fail: "Problem", skip: "Not checked" };

export function BuilderPage() {
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
        <PageHeader title="Resume Builder" />
        <EmptyState
          title="No resume yet"
          description="Upload or create your master resume, then download it as an ATS-friendly PDF."
          action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
        />
      </div>
    );
  }
  const resumeId = list.some((r) => r.id === params.get("resume")) ? (params.get("resume") as string) : list[0]!.id;
  const template = templates.data.some((t) => t.id === params.get("template")) ? (params.get("template") as string) : templates.data[0]!.id;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  const resume = list.find((r) => r.id === resumeId)!;
  const filename = `${resume.title.replace(/[^\w\- ]+/g, "").trim().replace(/ /g, "-") || "resume"}.pdf`;

  return (
    <div>
      <PageHeader
        title="Resume Builder"
        description="Pick a resume and an ATS-safe template, check how screening software reads it, and download the PDF."
      />
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
            <fieldset className="mt-5">
              <legend className="text-label-md text-on-surface">Template</legend>
              <div className="mt-2 space-y-2">
                {templates.data.map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-control border p-3",
                      t.id === template ? "border-primary bg-primary-fixed/30" : "border-hairline hover:border-hairline-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-template`}
                      value={t.id}
                      checked={t.id === template}
                      onChange={() => update("template", t.id)}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <span className="block text-label-md text-on-surface">{t.name}</span>
                      <span className="block text-body-sm text-on-surface-variant">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <a
              href={outputService.pdfUrl(resumeId, template)}
              download={filename}
              className={buttonClasses("primary", "md", "mt-5 w-full")}
            >
              <Download className="size-4" aria-hidden /> Download PDF
            </a>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              Single column, standard fonts and headings, real text. The final template set is still to be approved.
            </p>
          </Card>
        </div>
        <AtsPanel resumeId={resumeId} template={template} />
      </div>
    </div>
  );
}

function AtsPanel({ resumeId, template }: { resumeId: string; template: string }) {
  const report = useQuery({
    queryKey: ["output", "ats", resumeId, template],
    queryFn: () => outputService.ats(resumeId, template),
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
