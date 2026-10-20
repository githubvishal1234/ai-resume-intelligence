import type { ResumeDoc } from "@/services/resumeService";

/**
 * Profile drafts (`profile-v1`): a LinkedIn-style headline and About section, built only from
 * what the resume says. No AI, nothing invented: every phrase is the resume's own wording,
 * rearranged. Runs in the browser; the user edits and copies the result.
 */
export const PROFILE_VERSION = "profile-v1";
export const HEADLINE_LIMIT = 220;
export const ABOUT_LIMIT = 2600;

const MEASURE = /[$₹€£]\s?\d|\d+(?:[.,]\d+)?\s?(?:%|(?:x|k|m|gb|tb|ms|seconds?|minutes?|hours?|days?|weeks?|months?)\b)/i;
const IRREGULAR = new Set(["built", "led", "ran", "made", "wrote", "grew", "cut", "won", "drove", "took", "set", "brought", "taught", "sold", "kept", "held", "met", "found", "gave"]);

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`);
const firstSentence = (text: string) => (/(.+?[.!?])(\s|$)/.exec(text.trim())?.[1] ?? text.trim());
const startsWithVerb = (line: string) => {
  const w = line.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return w.endsWith("ed") || IRREGULAR.has(w);
};
const asClause = (line: string) => {
  const b = line.trim().replace(/\.$/, "");
  return b[0]!.toLowerCase() + b.slice(1);
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The clause of a bullet that carries a measured outcome, or "" (same rule as the Story Bank). */
export function measuredClause(line: string): string {
  const parts = line.trim().replace(/\.$/, "").split(/,\s+|;\s+/);
  return [...parts].reverse().find((p) => MEASURE.test(p))?.trim() ?? "";
}

/** Listed skills, those the experience or projects actually show first, at most `n`. */
export function topSkills(doc: ResumeDoc, n = 5): string[] {
  const work = [...doc.experience.flatMap((e) => [e.title, ...e.bullets]), ...doc.projects.flatMap((p) => [p.description, ...p.bullets, ...p.technologies])]
    .join(" ")
    .toLowerCase();
  const shown = (name: string) => new RegExp(`(^|[^a-z0-9+#])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`).test(work);
  const names = [...new Set(doc.skills.map((s) => s.name.trim()).filter(Boolean))];
  return [...names.filter(shown), ...names.filter((s) => !shown(s))].slice(0, n);
}

export type ProfileDraft = { headlines: string[]; about: string; skills: string[] };

export function draftProfile(doc: ResumeDoc): ProfileDraft {
  const latest = doc.experience[0];
  const title = latest?.title.trim() ?? "";
  const company = latest?.company.trim() ?? "";
  const skills = topSkills(doc);
  const bullets = doc.experience.flatMap((e) => e.bullets.map((b) => b.trim()).filter(Boolean));
  const win = bullets.map(measuredClause).find(Boolean) ?? "";

  const headlines = [
    title && skills.length ? `${title} | ${skills.slice(0, 3).join(" · ")}` : "",
    title && company && win ? `${title} at ${company} | ${capitalize(win)}` : "",
    title && doc.summary.trim() ? `${title} | ${firstSentence(doc.summary).replace(/\.$/, "")}` : "",
  ]
    .filter(Boolean)
    .map((h) => clip(h, HEADLINE_LIMIT));

  const paragraphs: string[] = [];
  if (doc.summary.trim()) paragraphs.push(doc.summary.trim());
  if (latest) {
    const lines = latest.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 2);
    const where = [title, company].filter(Boolean).join(" at ");
    if (lines.length && lines.every(startsWithVerb)) {
      paragraphs.push(`As ${where}, I ${lines.map(asClause).join(", and I ")}.`);
    } else if (lines.length) {
      paragraphs.push(`Highlights as ${where}:\n${lines.map((l) => `• ${l}`).join("\n")}`);
    }
  }
  const earlier = doc.experience.slice(1).map((e) => [e.title, e.company].filter(Boolean).join(" at ")).filter(Boolean);
  if (earlier.length) paragraphs.push(`Before that: ${earlier.join("; ")}.`);
  const project = doc.projects.find((p) => p.name.trim());
  if (project) paragraphs.push(`I also built ${project.name.trim()}${project.description.trim() ? `: ${project.description.trim().replace(/\.$/, "")}` : ""}.`);
  if (doc.skills.length) paragraphs.push(`Skills: ${[...new Set(doc.skills.map((s) => s.name))].slice(0, 12).join(", ")}.`);
  const certs = doc.certifications.map((c) => c.name.trim()).filter(Boolean);
  if (certs.length) paragraphs.push(`Certifications: ${certs.join(", ")}.`);

  return { headlines, about: clip(paragraphs.join("\n\n"), ABOUT_LIMIT), skills };
}
