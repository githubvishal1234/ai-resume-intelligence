import type { CSSProperties } from "react";
import { templateStyle } from "@/constants/templates";
import { cn } from "@/lib/cn";
import type { Contact } from "@/services/resumeService";

const pt = (n: number) => `calc(${n} * 100cqw / 595.28)`;
const MM = 2.8346;

/**
 * In-browser preview of the cover letter PDF (backend/app/output/pdf.py `render_letter`):
 * the resume template's header, the date, recipient, greeting, paragraphs and sign-off.
 */
export function LetterPaper({
  contact,
  recipient,
  company,
  body,
  template,
  date = new Date(),
  className,
  label,
}: {
  contact: Contact;
  recipient: string;
  company: string;
  body: string;
  template: string;
  date?: Date;
  className?: string;
  label?: string;
}) {
  const t = templateStyle(template);
  const size = t.bodyPt + 0.5;
  const page: CSSProperties = {
    fontFamily: t.serif ? 'Georgia, "Times New Roman", serif' : '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
    fontSize: pt(size),
    lineHeight: 1.45,
    padding: pt((t.marginMm + 4) * MM),
    color: "#111111",
    background: "#ffffff",
  };
  const align = t.center ? "center" : "left";
  const line = [contact.email, contact.phone, contact.location, ...contact.links].filter(Boolean).join(" | ");
  const para: CSSProperties = { marginBottom: pt(size * 0.9) };
  const when = `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}`;

  return (
    <div className={cn("@container w-full", className)}>
      <div
        role="img"
        aria-label={label ?? `Cover letter preview in the ${t.name} style`}
        className="aspect-[210/297] w-full overflow-hidden rounded-[2px] shadow-level-2 ring-1 ring-black/5"
        style={page}
      >
        {contact.full_name ? (
          <p style={{ fontWeight: 700, fontSize: pt(t.namePt), lineHeight: 1.2, color: t.accent, textAlign: align }}>{contact.full_name}</p>
        ) : null}
        {line ? <p style={{ fontSize: pt(t.bodyPt), textAlign: align, overflowWrap: "anywhere" }}>{line}</p> : null}
        {t.rule ? <div style={{ borderBottom: `${pt(0.6)} solid ${t.accent}`, marginTop: pt(6) }} /> : null}
        <div style={{ height: pt(14) }} />
        <p style={para}>{when}</p>
        {recipient.trim() ? <p>{recipient}</p> : null}
        {company.trim() ? <p>{company}</p> : null}
        <div style={{ height: pt(10) }} />
        <p style={para}>Dear {recipient.trim() || "Hiring Manager"},</p>
        {body
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, i) => (
            <p key={i} style={para}>
              {p.replace(/\s+/g, " ")}
            </p>
          ))}
        <p>Sincerely,</p>
        <p style={{ fontWeight: 700, marginTop: pt(4) }}>{contact.full_name}</p>
      </div>
    </div>
  );
}
