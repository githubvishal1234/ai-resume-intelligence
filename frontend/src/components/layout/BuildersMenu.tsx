import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LetterPaper } from "@/components/resume/LetterPaper";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { cn } from "@/lib/cn";
import { draftProfile } from "@/lib/profileDraft";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

const SAMPLE_LETTER =
  "I'm writing to apply for the Senior Backend Engineer role at Northwind. Backend engineer with 6 years of experience building data-heavy Python services and APIs.\n\n" +
  "You're looking for solid knowledge of PostgreSQL. As Senior Software Engineer at Acme Analytics, I led migration of the reporting pipeline to PostgreSQL, cutting query latency by 40%.";

const SAMPLE_PROFILE = draftProfile(SAMPLE_RESUME);

/** A small, static stand-in for the Profile Builder's preview card. */
function MiniProfile() {
  return (
    <div role="img" aria-label="Sample profile" className="overflow-hidden rounded-[2px] bg-white text-[#111]">
      <div className="h-6 bg-[linear-gradient(120deg,#2a4bf2,#1a33c2)]" />
      <div className="px-3 pb-3">
        <div className="-mt-4 flex size-9 items-center justify-center rounded-full border-2 border-white bg-[#eef1ff] text-[11px] font-bold text-[#0e1a66]">AM</div>
        <p className="mt-1 text-[11px] font-bold">{SAMPLE_RESUME.contact.full_name}</p>
        <p className="text-[9px] leading-tight">{SAMPLE_PROFILE.headlines[1]}</p>
        <p className="mt-1.5 line-clamp-4 text-[8px] leading-snug text-[#444]">{SAMPLE_PROFILE.about}</p>
      </div>
    </div>
  );
}

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
  {
    to: "/profile-builder",
    title: "Profile Builder",
    body: "A headline and About section for your professional profile, from your resume's own words.",
    tone: "bg-[#b9c4ff]",
    preview: <MiniProfile />,
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
        <div id={id} className="absolute inset-x-0 top-full z-40 whitespace-normal border-b border-hairline bg-surface-container-lowest shadow-level-3">
          <ul className="mx-auto grid max-h-[80dvh] max-w-6xl gap-6 overflow-y-auto px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
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
