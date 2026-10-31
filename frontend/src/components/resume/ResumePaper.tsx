import { Fragment, type CSSProperties, type ReactNode } from "react";
import { arrange, SIDEBAR_SECTIONS, templateStyle, type SectionKey } from "@/constants/templates";
import { cn } from "@/lib/cn";
import type { ResumeDoc } from "@/services/resumeService";

/** A4 is 595.28pt wide; sizes are in points relative to the container width, so the page scales. */
const pt = (n: number) => `calc(${n} * 100cqw / 595.28)`;
const MM = 2.8346;
const A4_WIDTH_PT = 595.28;

const HEADINGS = { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications" };

/** `hex` mixed with white (`amount` is the colour's share), as `tint` in backend/app/output/pdf.py. */
function tint(hex: string, amount = 0.12) {
  const mix = (i: number) => Math.round(255 - amount * (255 - parseInt(hex.slice(i, i + 2), 16)));
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}

function dates(start: string, end: string, current = false) {
  return [start, current ? "Present" : end].filter(Boolean).join(" – ");
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

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
 * An in-browser preview of the PDF a template produces, in the same layout and section order as
 * backend/app/output/pdf.py. It is paper, not app UI: white with dark text in both themes.
 * The PDF from the server stays the real output; this is a close approximation.
 *
 * `photoUrl` is the user's photo for photo templates; without one, samples show the initials
 * (the PDF then simply has no photo).
 */
export function ResumePaper({
  doc,
  template,
  className,
  label,
  photoUrl,
}: {
  doc: ResumeDoc;
  template: string;
  className?: string;
  label?: string;
  photoUrl?: string | null;
}) {
  const t = templateStyle(template);
  const body = t.bodyPt;
  const sidebar = t.layout === "sidebar";
  const solid = sidebar && t.sidebarFill === "solid";
  const margin = t.marginMm * MM;
  const sideWidthPt = (A4_WIDTH_PT - 2 * margin) * 0.32;
  const page: CSSProperties = {
    fontFamily: t.serif ? 'Georgia, "Times New Roman", serif' : '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
    fontSize: pt(body),
    lineHeight: t.lineHeight ?? 1.35,
    padding: pt(margin),
    color: "#111111",
    background: "#ffffff",
  };
  const heading = (side: boolean): CSSProperties => {
    const colour = side && solid ? "#ffffff" : t.accent;
    return {
      color: colour,
      fontWeight: 700,
      fontSize: pt(t.headingPt),
      lineHeight: 1.3,
      textTransform: t.upperHeadings ? "uppercase" : undefined,
      marginTop: pt(body * 0.9),
      marginBottom: pt(3),
      paddingBottom: t.rule ? pt(2) : undefined,
      borderBottom: t.rule ? `${pt(0.6)} solid ${colour}` : undefined,
      ...(t.band && !side ? { background: tint(t.accent), padding: `${pt(2)} ${pt(4)}`, marginTop: pt(body * 1.4), marginBottom: pt(5) } : {}),
    };
  };
  const meta: CSSProperties = { fontSize: pt(body - 0.5) };
  const c = doc.contact;
  const contactParts = [c.email, c.phone, c.location, ...c.links].filter(Boolean);
  const contact = contactParts.join(" | ");

  const groups: { category: string; names: string[] }[] = [];
  for (const s of doc.skills) {
    const g = groups.find((x) => x.category === s.category);
    if (g) g.names.push(s.name);
    else groups.push({ category: s.category, names: [s.name] });
  }

  const photo = (sizeMm: number) =>
    photoUrl ? (
      <img src={photoUrl} alt="" style={{ width: pt(sizeMm * MM), height: pt(sizeMm * MM), borderRadius: "9999px", objectFit: "cover", flexShrink: 0 }} />
    ) : (
      <span
        aria-hidden
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: pt(sizeMm * MM), height: pt(sizeMm * MM), borderRadius: "9999px", background: tint(t.accent, 0.25), color: t.accent, fontWeight: 700, fontSize: pt(sizeMm * 1.1), flexShrink: 0 }}
      >
        {initials(c.full_name)}
      </span>
    );

  /** An entry's title, with its dates right-aligned when the template asks. */
  const titled = (head: string, when: string, rest?: string) =>
    t.datesRight && when ? (
      <>
        <p style={{ display: "flex", justifyContent: "space-between", gap: pt(6) }}>
          <span style={{ fontWeight: 700 }}>{head}</span>
          <span style={{ ...meta, whiteSpace: "nowrap" }}>{when}</span>
        </p>
        {rest ? <p style={meta}>{rest}</p> : null}
      </>
    ) : (
      <>
        <p style={{ fontWeight: 700 }}>{head}</p>
        {[when, rest].filter(Boolean).length ? <p style={meta}>{[when, rest].filter(Boolean).join(" | ")}</p> : null}
      </>
    );

  /** Timeline layout: dates in a left gutter, the entry right of an accent line. */
  const dated = (key: string, when: string, children: ReactNode) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: `${pt(25 * MM)} 1fr`, marginBottom: pt(5) }}>
      <p style={{ ...meta, textAlign: "right", paddingRight: pt(7) }}>{when}</p>
      <div style={{ borderLeft: `${pt(1.2)} solid ${t.accent}`, paddingLeft: pt(9) }}>{children}</div>
    </div>
  );

  const section = (key: SectionKey, side: boolean): ReactNode => {
    const h = <p style={heading(side)}>{HEADINGS[key]}</p>;
    switch (key) {
      case "summary":
        return doc.summary ? (
          <>
            {h}
            <p>{doc.summary}</p>
          </>
        ) : null;
      case "experience":
        return doc.experience.length ? (
          <>
            {h}
            {doc.experience.map((e) => {
              const head = [e.title, e.company].filter(Boolean).join(" — ") || "Role";
              const when = dates(e.start_date, e.end_date, e.current);
              if (t.layout === "timeline")
                return dated(e.id, when, <><p style={{ fontWeight: 700 }}>{head}</p>{e.location ? <p style={meta}>{e.location}</p> : null}<Bullets items={e.bullets} /></>);
              return (
                <div key={e.id} style={{ marginBottom: pt(4) }}>
                  {t.datesRight ? titled(head, when, e.location) : titled(head, [when, e.location].filter(Boolean).join(" | "))}
                  <Bullets items={e.bullets} />
                </div>
              );
            })}
          </>
        ) : null;
      case "education":
        return doc.education.length ? (
          <>
            {h}
            {doc.education.map((d) => {
              const degree = [d.degree, d.field_of_study].filter(Boolean).join(" in ");
              const when = dates(d.start_date, d.end_date);
              const school = degree ? d.institution : "";
              if (t.layout === "timeline")
                return dated(d.id, when, <><p style={{ fontWeight: 700 }}>{degree || d.institution}</p>{school ? <p style={meta}>{school}</p> : null}<Bullets items={d.details} /></>);
              return (
                <div key={d.id} style={{ marginBottom: pt(3) }}>
                  {side ? (
                    <>
                      <p style={{ fontWeight: 700 }}>{degree || d.institution}</p>
                      {[school, when].filter(Boolean).map((x) => <p key={x} style={meta}>{x}</p>)}
                    </>
                  ) : t.datesRight ? (
                    titled(degree || d.institution, when, school)
                  ) : (
                    titled(degree || d.institution, [school, when].filter(Boolean).join(" | "))
                  )}
                  <Bullets items={d.details} />
                </div>
              );
            })}
          </>
        ) : null;
      case "skills":
        return groups.length ? (
          <>
            {h}
            {groups.map((g) => (
              <Fragment key={g.category || "_"}>
                {side || t.skillsGrid ? (
                  <>
                    {g.category ? <p style={{ fontWeight: 700 }}>{g.category}</p> : null}
                    {side ? (
                      <div style={{ marginBottom: pt(3) }}>{g.names.map((n) => <p key={n}>{n}</p>)}</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                        {g.names.map((n) => <p key={n}>• {n}</p>)}
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    {g.category ? `${g.category}: ` : ""}
                    {g.names.join(", ")}
                  </p>
                )}
              </Fragment>
            ))}
          </>
        ) : null;
      case "projects":
        return doc.projects.length ? (
          <>
            {h}
            {doc.projects.map((p) => (
              <div key={p.id} style={{ marginBottom: pt(3) }}>
                <p style={{ fontWeight: 700 }}>{p.name || "Project"}</p>
                {p.technologies.length ? <p style={meta}>{p.technologies.join(", ")}</p> : null}
                {p.description ? <p>{p.description}</p> : null}
                <Bullets items={p.bullets} />
              </div>
            ))}
          </>
        ) : null;
      case "certifications":
        return doc.certifications.length ? (
          <>
            {h}
            {doc.certifications.map((x) =>
              side ? (
                <div key={x.id} style={{ marginBottom: pt(2) }}>
                  <p style={{ fontWeight: 700 }}>{x.name}</p>
                  {[x.issuer, x.date].filter(Boolean).map((v) => <p key={v} style={meta}>{v}</p>)}
                </div>
              ) : (
                <p key={x.id}>{[x.name, x.issuer, x.date].filter(Boolean).join(" — ")}</p>
              ),
            )}
          </>
        ) : null;
    }
  };

  const others = doc.other.map((o) => (
    <div key={o.id}>
      <p style={heading(false)}>{o.heading || "Additional information"}</p>
      <Bullets items={o.lines} />
    </div>
  ));

  const header = (): ReactNode => {
    const align = t.center ? "center" : "left";
    const name = c.full_name ? <p style={{ fontWeight: 700, fontSize: pt(t.namePt), lineHeight: 1.2, textAlign: align }}>{c.full_name}</p> : null;
    const title = c.headline ? <p style={{ fontWeight: 700, textAlign: align }}>{c.headline}</p> : null;
    const line = contact ? <p style={{ marginBottom: pt(4), textAlign: align, overflowWrap: "anywhere" }}>{contact}</p> : null;
    if (t.header === "banner" && (name || line))
      return (
        <div style={{ background: t.accent, color: "#ffffff", padding: `${pt(10)} ${pt(12)}`, marginBottom: pt(4) }}>
          {name}
          {title}
          {contact ? <p style={{ textAlign: align, overflowWrap: "anywhere" }}>{contact}</p> : null}
        </div>
      );
    if (t.header === "split" && name)
      return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: pt(8), marginBottom: pt(6) }}>
          <div style={{ minWidth: 0 }}>
            {name}
            {title}
          </div>
          <div style={{ ...meta, textAlign: "right", overflowWrap: "anywhere" }}>{contactParts.map((x) => <p key={x}>{x}</p>)}</div>
        </div>
      );
    if (t.header === "monogram" && name)
      return (
        <div style={{ display: "flex", gap: pt(5 * MM), alignItems: "flex-start", marginBottom: pt(6) }}>
          <span aria-hidden style={{ display: "flex", alignItems: "center", justifyContent: "center", width: pt(16 * MM), height: pt(16 * MM), flexShrink: 0, background: t.accent, color: "#ffffff", fontWeight: 700, fontSize: pt(t.namePt * 0.8) }}>
            {initials(c.full_name)}
          </span>
          <div style={{ minWidth: 0 }}>
            {name}
            {title}
            {line}
          </div>
        </div>
      );
    if (t.photo && (name || line))
      return (
        <div style={{ display: "flex", gap: pt(6 * MM), alignItems: "center", marginBottom: pt(6) }}>
          {photo(26)}
          <div style={{ minWidth: 0 }}>
            {name}
            {title}
            {line}
          </div>
        </div>
      );
    return (
      <>
        {name}
        {title}
        {line}
      </>
    );
  };

  const order = arrange(t.order, doc.section_order ?? []);
  const sideKeys = order.filter((k) => SIDEBAR_SECTIONS.includes(k));
  const mainKeys = sidebar ? order.filter((k) => !SIDEBAR_SECTIONS.includes(k)) : order;

  return (
    <div className={cn("@container w-full", className)}>
      <div
        role="img"
        aria-label={label ?? `Preview in the ${t.name} template`}
        className="relative aspect-[210/297] w-full overflow-hidden rounded-[2px] shadow-level-2 ring-1 ring-black/5"
        style={page}
      >
        {t.header === "stripe" ? <div aria-hidden style={{ position: "absolute", inset: "0 auto 0 0", width: pt(5 * MM), background: t.accent }} /> : null}
        {sidebar ? (
          <>
            <div aria-hidden style={{ position: "absolute", inset: "0 auto 0 0", width: pt(margin + sideWidthPt + 7 * MM * 0.45), background: solid ? t.accent : tint(t.accent, 0.1) }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: `${pt(sideWidthPt)} 1fr`, columnGap: pt(7 * MM) }}>
              <div style={{ color: solid ? "#ffffff" : "#111111", minWidth: 0, overflowWrap: "anywhere" }}>
                {t.photo ? <div style={{ display: "flex", justifyContent: "center", marginBottom: pt(6) }}>{photo(26)}</div> : null}
                {c.full_name ? <p style={{ fontWeight: 700, fontSize: pt(t.namePt), lineHeight: 1.2 }}>{c.full_name}</p> : null}
                {c.headline ? <p style={{ fontWeight: 700 }}>{c.headline}</p> : null}
                <div style={{ ...meta, marginTop: pt(4) }}>{contactParts.map((x) => <p key={x}>{x}</p>)}</div>
                {sideKeys.map((key) => <Fragment key={key}>{section(key, true)}</Fragment>)}
              </div>
              <div style={{ minWidth: 0 }}>
                {mainKeys.map((key) => <Fragment key={key}>{section(key, false)}</Fragment>)}
                {others}
              </div>
            </div>
          </>
        ) : (
          <>
            {header()}
            {mainKeys.map((key) => <Fragment key={key}>{section(key, false)}</Fragment>)}
            {others}
          </>
        )}
      </div>
    </div>
  );
}
