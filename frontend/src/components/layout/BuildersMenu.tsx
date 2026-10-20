import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LetterPaper } from "@/components/resume/LetterPaper";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { cn } from "@/lib/cn";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

const SAMPLE_LETTER =
  "I'm writing to apply for the Senior Backend Engineer role at Northwind. Backend engineer with 6 years of experience building data-heavy Python services and APIs.\n\n" +
  "You're looking for solid knowledge of PostgreSQL. As Senior Software Engineer at Acme Analytics, I led migration of the reporting pipeline to PostgreSQL, cutting query latency by 40%.";

const BUILDERS: { to: string; title: string; body: string; tone: string; preview: ReactNode }[] = [
  {
    to: "/resumes/new",
    title: "Resume Builder",
    body: "A one-page, ATS-safe resume in six templates, built step by step.",
    tone: "bg-accent",
    preview: <ResumePaper doc={SAMPLE_RESUME} template="modern" label="Sample resume" />,
  },
  {
    to: "/cv-builder",
    title: "CV Builder",
    body: "A full-length CV that leads with education, with room for publications and languages.",
    tone: "bg-[#f4a493]",
    preview: <ResumePaper doc={SAMPLE_RESUME} template="cv-academic" label="Sample CV" />,
  },
  {
    to: "/cover-letters",
    title: "Cover Letter Builder",
    body: "A draft matched to the job, where every claim is a line from your resume.",
    tone: "bg-[#8cc9cf]",
    preview: (
      <LetterPaper contact={SAMPLE_RESUME.contact} recipient="Dana Lee" company="Northwind" body={SAMPLE_LETTER} template="classic" label="Sample cover letter" />
    ),
  },
];

/** "Builders" disclosure in the public header: three cards with live page previews. */
export function BuildersMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex items-center gap-1 py-2 hover:text-primary", open && "font-medium text-primary")}
      >
        Builders <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="absolute inset-x-0 top-full z-40 border-b border-hairline bg-surface-container-lowest shadow-level-3">
          <ul className="mx-auto grid max-h-[80dvh] max-w-6xl gap-6 overflow-y-auto px-4 py-8 sm:grid-cols-3 sm:px-6">
            {BUILDERS.map((b) => (
              <li key={b.to}>
                <Link to={b.to} onClick={() => setOpen(false)} className="group block rounded-card focus-visible:outline-offset-4">
                  <div className={cn("h-44 overflow-hidden rounded-card px-6 pt-5 transition-transform lg:h-56 group-hover:-translate-y-1", b.tone)}>
                    <div className="mx-auto w-[88%] shadow-level-2">{b.preview}</div>
                  </div>
                  <p className="mt-4 font-display text-headline-sm text-on-surface group-hover:text-primary">{b.title}</p>
                  <p className="mt-1 text-body-md text-on-surface-variant">{b.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
