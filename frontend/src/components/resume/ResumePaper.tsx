import type { CSSProperties, ReactNode } from "react";
import { templateStyle } from "@/constants/templates";
import { cn } from "@/lib/cn";
import type { ResumeDoc } from "@/services/resumeService";

/** A4 is 595.28pt wide; sizes are in points relative to the container width, so the page scales. */
const pt = (n: number) => `calc(${n} * 100cqw / 595.28)`;
const MM = 2.8346;

const HEADINGS = { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications" };

function dates(start: string, end: string, current = false) {
  return [start, current ? "Present" : end].filter(Boolean).join(" – ");
}

function SectionHeading({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return <p style={style}>{children}</p>;
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((b, i) => (
        <li key={i} style={{ paddingLeft: pt(10), textIndent: pt(-10), marginTop: pt(1) }}>
          <span aria-hidden style={{ display: "inline-block", width: pt(10), textIndent: 0 }}>•</span>
          {b}
        </li>
      ))}
    </ul>
  );
}

/**
 * An in-browser preview of the PDF a template produces, in the same section order as
 * backend/app/output/pdf.py. It is paper, not app UI: white with dark text in both themes.
 * The PDF from the server stays the real output; this is a close approximation.
 */
export function ResumePaper({ doc, template, className, label }: { doc: ResumeDoc; template: string; className?: string; label?: string }) {
  const t = templateStyle(template);
  const body = t.bodyPt;
  const page: CSSProperties = {
    fontFamily: t.serif ? 'Georgia, "Times New Roman", serif' : '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
    fontSize: pt(body),
    lineHeight: 1.35,
    padding: pt(t.marginMm * MM),
    color: "#111111",
    background: "#ffffff",
  };
  const headingStyle: CSSProperties = {
    color: t.accent,
    fontWeight: 700,
    fontSize: pt(t.headingPt),
    lineHeight: 1.3,
    marginTop: pt(body * 0.9),
    marginBottom: pt(3),
    paddingBottom: t.rule ? pt(2) : undefined,
    borderBottom: t.rule ? `${pt(0.6)} solid ${t.accent}` : undefined,
  };
  const meta: CSSProperties = { fontSize: pt(body - 0.5) };
  const gap: CSSProperties = { marginBottom: pt(4) };
  const c = doc.contact;
  const contact = [c.email, c.phone, c.location, ...c.links].filter(Boolean).join(" | ");

  const groups: { category: string; names: string[] }[] = [];
  for (const s of doc.skills) {
    const g = groups.find((x) => x.category === s.category);
    if (g) g.names.push(s.name);
    else groups.push({ category: s.category, names: [s.name] });
  }

  return (
    <div className={cn("@container w-full", className)}>
      <div
        role="img"
        aria-label={label ?? `Preview in the ${t.name} template`}
        className="aspect-[210/297] w-full overflow-hidden rounded-[2px] shadow-level-2 ring-1 ring-black/5"
        style={page}
      >
        {c.full_name ? (
          <p style={{ fontWeight: 700, fontSize: pt(t.namePt), lineHeight: 1.2, textAlign: t.center ? "center" : "left" }}>{c.full_name}</p>
        ) : null}
        {contact ? <p style={{ marginBottom: pt(4), textAlign: t.center ? "center" : "left", overflowWrap: "anywhere" }}>{contact}</p> : null}

        {doc.summary ? (
          <>
            <SectionHeading style={headingStyle}>{HEADINGS.summary}</SectionHeading>
            <p>{doc.summary}</p>
          </>
        ) : null}

        {doc.experience.length ? <SectionHeading style={headingStyle}>{HEADINGS.experience}</SectionHeading> : null}
        {doc.experience.map((e) => (
          <div key={e.id} style={gap}>
            <p style={{ fontWeight: 700 }}>{[e.title, e.company].filter(Boolean).join(" — ") || "Role"}</p>
            {dates(e.start_date, e.end_date, e.current) || e.location ? (
              <p style={meta}>{[dates(e.start_date, e.end_date, e.current), e.location].filter(Boolean).join(" | ")}</p>
            ) : null}
            <Bullets items={e.bullets} />
          </div>
        ))}

        {doc.education.length ? <SectionHeading style={headingStyle}>{HEADINGS.education}</SectionHeading> : null}
        {doc.education.map((d) => {
          const degree = [d.degree, d.field_of_study].filter(Boolean).join(" in ");
          const line = [degree ? d.institution : "", dates(d.start_date, d.end_date)].filter(Boolean).join(" | ");
          return (
            <div key={d.id} style={{ marginBottom: pt(3) }}>
              <p style={{ fontWeight: 700 }}>{degree || d.institution}</p>
              {line ? <p style={meta}>{line}</p> : null}
              <Bullets items={d.details} />
            </div>
          );
        })}

        {groups.length ? <SectionHeading style={headingStyle}>{HEADINGS.skills}</SectionHeading> : null}
        {groups.map((g) => (
          <p key={g.category || "_"}>
            {g.category ? `${g.category}: ` : ""}
            {g.names.join(", ")}
          </p>
        ))}

        {doc.projects.length ? <SectionHeading style={headingStyle}>{HEADINGS.projects}</SectionHeading> : null}
        {doc.projects.map((p) => (
          <div key={p.id} style={{ marginBottom: pt(3) }}>
            <p style={{ fontWeight: 700 }}>{p.name || "Project"}</p>
            {p.technologies.length ? <p style={meta}>{p.technologies.join(", ")}</p> : null}
            {p.description ? <p>{p.description}</p> : null}
            <Bullets items={p.bullets} />
          </div>
        ))}

        {doc.certifications.length ? <SectionHeading style={headingStyle}>{HEADINGS.certifications}</SectionHeading> : null}
        {doc.certifications.map((x) => (
          <p key={x.id}>{[x.name, x.issuer, x.date].filter(Boolean).join(" — ")}</p>
        ))}

        {doc.other.map((o) => (
          <div key={o.id}>
            <SectionHeading style={headingStyle}>{o.heading || "Additional information"}</SectionHeading>
            <Bullets items={o.lines} />
          </div>
        ))}
      </div>
    </div>
  );
}
