import type { SectionKey } from "@/constants/templates";
import type { ResumeDoc } from "@/services/resumeService";

/**
 * The order of a resume's sections: the user's own, or one suited to their experience.
 * Mirrors backend/app/output/order.py (the PDF is the source of truth; keep both in sync).
 */

/** Under a year of work: projects are the stronger proof, so they come before experience. */
export const FRESHER_ORDER: SectionKey[] = ["summary", "skills", "projects", "experience", "education", "certifications"];
/** No work yet: the degree is the main credential. */
export const STUDENT_ORDER: SectionKey[] = ["summary", "education", "skills", "projects", "experience", "certifications"];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Months since year 0, as parse_month in backend/app/matching/matcher.py reads a date. */
function month(value: string, now: Date): number | null {
  const v = value.trim().replace(/\.$/, "").toLowerCase();
  if (!v) return null;
  if (/^(present|current|currently|now|today|ongoing)$/.test(v)) return now.getFullYear() * 12 + now.getMonth();
  let m = /^([a-z]{3,9})\.?\s*,?\s*(\d{4})$/.exec(v);
  if (m) {
    const i = MONTHS.indexOf(m[1]!.slice(0, 3));
    return i >= 0 ? Number(m[2]) * 12 + i : null;
  }
  m = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(v);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? Number(m[2]) * 12 + Number(m[1]) - 1 : null;
  m = /^(\d{4})\s*-\s*(\d{1,2})$/.exec(v);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
  m = /^((?:19|20)\d{2})$/.exec(v);
  return m ? Number(m[1]) * 12 : null;
}

/** Total years across dated roles, overlaps counted once; null when none is dated. */
export function experienceYears(doc: ResumeDoc, now = new Date()): number | null {
  const spans: [number, number][] = [];
  for (const e of doc.experience) {
    const start = month(e.start_date, now);
    const end = e.current ? now.getFullYear() * 12 + now.getMonth() : month(e.end_date, now);
    if (start !== null && end !== null && end + 1 > start) spans.push([start, end + 1]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [a, b] = spans[0]!;
  for (const [s, e] of spans.slice(1)) {
    if (s <= b) b = Math.max(b, e);
    else {
      total += b - a;
      [a, b] = [s, e];
    }
  }
  return (total + b - a) / 12;
}

const hasRoles = (doc: ResumeDoc) => doc.experience.some((e) => e.title.trim() || e.company.trim());

/** A full order for freshers and students; [] keeps the template's own order. */
export function suggestedOrder(doc: ResumeDoc, now = new Date()): SectionKey[] {
  if (!hasRoles(doc)) return doc.education.length ? STUDENT_ORDER : [];
  const years = experienceYears(doc, now);
  return years !== null && years < 1 && doc.projects.length ? FRESHER_ORDER : [];
}

/** Why the suggestion is what it is, in a sentence. */
export function suggestionReason(doc: ResumeDoc, now = new Date()): string {
  const order = suggestedOrder(doc, now);
  if (order === STUDENT_ORDER) return "Education comes early, since there's no work experience yet.";
  if (order === FRESHER_ORDER) return "Projects come before experience, since the work adds up to under a year.";
  return "Skills and experience lead, the order recruiters read first.";
}

/** The order to lay sections out in: the saved one, else a suggestion (resumes only). */
export function sectionOrder(doc: ResumeDoc, kind: "resume" | "cv" = "resume"): SectionKey[] {
  if (doc.section_order.length) return doc.section_order;
  return kind === "resume" ? suggestedOrder(doc) : [];
}
