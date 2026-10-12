import type { ResumeDoc } from "@/services/resumeService";

function dates(start: string, end: string): string {
  return [start, end].filter(Boolean).join(" – ");
}

function H({ children }: { children: string }) {
  return <h3 className="mb-2 mt-6 border-b border-hairline pb-1 text-label-sm uppercase tracking-wider text-on-surface-variant first:mt-0">{children}</h3>;
}

/** Read-only rendering of a resume document. All text is rendered as text (never as HTML). */
export function ResumeView({ doc }: { doc: ResumeDoc }) {
  const c = doc.contact;
  return (
    <article className="text-body-md text-on-surface">
      <header className="mb-4">
        <h2 className="font-display text-headline-md">{c.full_name || "Unnamed"}</h2>
        <p className="text-on-surface-variant">{[c.location, c.email, c.phone, ...c.links].filter(Boolean).join(" · ")}</p>
      </header>
      {doc.summary ? (
        <>
          <H>Summary</H>
          <p className="whitespace-pre-line">{doc.summary}</p>
        </>
      ) : null}
      {doc.experience.length ? <H>Experience</H> : null}
      {doc.experience.map((e) => (
        <section key={e.id} className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">{[e.title, e.company].filter(Boolean).join(" · ")}</p>
            <p className="tnum font-mono text-code-sm text-on-surface-variant">{dates(e.start_date, e.current ? "Present" : e.end_date)}</p>
          </div>
          {e.location ? <p className="text-body-sm text-on-surface-variant">{e.location}</p> : null}
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </section>
      ))}
      {doc.education.length ? <H>Education</H> : null}
      {doc.education.map((e) => (
        <section key={e.id} className="mb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">{[e.degree, e.field_of_study].filter(Boolean).join(" in ")}</p>
            <p className="tnum font-mono text-code-sm text-on-surface-variant">{dates(e.start_date, e.end_date)}</p>
          </div>
          <p>{e.institution}</p>
          {e.details.map((d, i) => <p key={i} className="text-body-sm text-on-surface-variant">{d}</p>)}
        </section>
      ))}
      {doc.skills.length ? (
        <>
          <H>Skills</H>
          <p>{doc.skills.map((s) => s.name).join(" · ")}</p>
        </>
      ) : null}
      {doc.projects.length ? <H>Projects</H> : null}
      {doc.projects.map((p) => (
        <section key={p.id} className="mb-3">
          <p className="font-semibold">{p.name}{p.technologies.length ? <span className="font-normal text-on-surface-variant"> · {p.technologies.join(", ")}</span> : null}</p>
          {p.description ? <p>{p.description}</p> : null}
          <ul className="list-disc pl-5">{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
      ))}
      {doc.certifications.length ? <H>Certifications</H> : null}
      <ul className="space-y-0.5">
        {doc.certifications.map((x) => (
          <li key={x.id}>{[x.name, x.issuer, x.date].filter(Boolean).join(" · ")}</li>
        ))}
      </ul>
      {doc.other.map((o) => (
        <section key={o.id}>
          <H>{o.heading || "Other"}</H>
          <ul className="list-disc pl-5">{o.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      ))}
    </article>
  );
}
