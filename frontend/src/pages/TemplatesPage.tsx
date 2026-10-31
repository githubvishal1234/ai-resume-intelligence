import { ArrowRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { matches, NO_FILTERS, TemplateFilters, type Filters } from "@/components/resume/TemplateFilters";
import { Button } from "@/components/ui/Button";
import { TEMPLATE_STYLES } from "@/constants/templates";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/cn";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

const KINDS = [
  { id: "resume", label: "Resumes" },
  { id: "cv", label: "CVs" },
] as const;

/** Public gallery of every template, with filters, each linking into the matching builder. */
export function TemplatesPage() {
  const signedIn = Boolean(useSession().data);
  const [kind, setKind] = useState<"resume" | "cv">("resume");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const ofKind = TEMPLATE_STYLES.filter((t) => t.kind === kind);
  const shown = ofKind.filter((t) => matches(t.id, filters));
  const builder = kind === "cv" ? "/cv-builder" : "/resumes/new";

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <PublicHeader signedIn={signedIn} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
        <div className="max-w-3xl animate-rise">
          <p className="text-label-md font-semibold uppercase tracking-wider text-primary">Templates</p>
          <h1 className="mt-2 font-display text-[40px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[52px]">
            {TEMPLATE_STYLES.length} templates, every one ATS-safe
          </h1>
          <p className="mt-3 text-body-lg text-on-surface-variant">
            Colour bands, side stripes, ribbons and classic serif. Every design is a single column of real text, so screening software reads it top to bottom.
          </p>
        </div>

        <div className="mt-10 rounded-card border border-hairline bg-surface-container-lowest px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Document type" className="inline-flex rounded-full bg-surface-container-high p-1">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    setFilters(NO_FILTERS);
                  }}
                  className={cn("rounded-full px-4 py-1.5 text-label-md transition", kind === k.id ? "bg-surface-container-lowest font-semibold text-on-surface shadow-level-1" : "text-on-surface-variant hover:text-on-surface")}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-body-md text-on-surface-variant" aria-live="polite">
              Showing <span className="tnum font-semibold text-on-surface">{shown.length}</span> of {ofKind.length}
            </p>
          </div>
          <TemplateFilters value={filters} onChange={setFilters} />
        </div>

        {shown.length === 0 ? (
          <div className="mt-10 rounded-card border border-dashed border-hairline-strong px-6 py-14 text-center">
            <p className="font-display text-headline-sm">No template matches all of those</p>
            <Button variant="secondary" size="sm" className="mt-4" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((t) => (
              <li key={t.id} className="group relative rounded-card border border-hairline bg-surface-container-lowest p-3 shadow-level-1 transition hover:-translate-y-0.5 hover:shadow-level-3">
                <div className="rounded-control bg-surface-container-low p-3">
                  <ResumePaper doc={SAMPLE_RESUME} template={t.id} label={`Sample ${kind === "cv" ? "CV" : "resume"} in the ${t.name} template`} />
                </div>
                <div className="flex items-start justify-between gap-2 px-1 pt-3">
                  <div className="min-w-0">
                    <h2 className="text-label-md font-semibold text-on-surface">{t.name}</h2>
                    <p className="text-body-sm text-on-surface-variant">{t.category} · {t.serif ? "Serif" : "Sans-serif"}</p>
                  </div>
                  <span aria-hidden className="mt-1 size-4 shrink-0 rounded-full ring-1 ring-hairline-strong" style={{ background: t.accent }} />
                </div>
                <Link
                  to={`${builder}?template=${encodeURIComponent(t.id)}`}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-control bg-primary px-3 py-2 text-label-md font-semibold text-on-primary after:absolute after:inset-0 hover:bg-primary/90"
                >
                  Use this template<span className="sr-only">: {t.name}</span> <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
