/**
 * Visual settings of the PDF templates, for the in-browser preview. They mirror
 * backend/app/output/templates.py (the PDF is the source of truth; keep both in sync).
 * The list of available templates still comes from GET /output/templates.
 */
export type SectionKey = "summary" | "experience" | "education" | "skills" | "projects" | "certifications";
export const RESUME_ORDER: SectionKey[] = ["summary", "experience", "education", "skills", "projects", "certifications"];
export const CV_ORDER: SectionKey[] = ["summary", "education", "experience", "projects", "certifications", "skills"];

export type TemplateStyle = {
  id: string;
  kind: "resume" | "cv";
  order: SectionKey[];
  name: string;
  description: string;
  serif: boolean;
  bodyPt: number;
  namePt: number;
  headingPt: number;
  marginMm: number;
  rule: boolean;
  accent: string;
  center: boolean;
};

export const TEMPLATE_STYLES: TemplateStyle[] = [
  { id: "classic", kind: "resume", order: RESUME_ORDER, name: "Classic", description: "Clean sans-serif, generous spacing, ruled section headings.", serif: false, bodyPt: 10.5, namePt: 20, headingPt: 11.5, marginMm: 18, rule: true, accent: "#1f2a44", center: false },
  { id: "modern", kind: "resume", order: RESUME_ORDER, name: "Modern", description: "Indigo headings, a large name and ruled sections.", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, accent: "#3730a3", center: false },
  { id: "executive", kind: "resume", order: RESUME_ORDER, name: "Executive", description: "Serif type, centred name and navy ruled headings.", serif: true, bodyPt: 10.5, namePt: 22, headingPt: 12, marginMm: 18, rule: true, accent: "#1f2a44", center: true },
  { id: "minimal", kind: "resume", order: RESUME_ORDER, name: "Minimal", description: "Centred header, wide margins and quiet grey headings.", serif: false, bodyPt: 10, namePt: 18, headingPt: 11, marginMm: 20, rule: false, accent: "#374151", center: true },
  { id: "compact", kind: "resume", order: RESUME_ORDER, name: "Compact", description: "Tighter spacing to fit more on a page; plain headings.", serif: false, bodyPt: 9.5, namePt: 16, headingPt: 10.5, marginMm: 13, rule: false, accent: "#000000", center: false },
  { id: "serif", kind: "resume", order: RESUME_ORDER, name: "Serif", description: "Serif type for a traditional look, ruled headings.", serif: true, bodyPt: 11, namePt: 20, headingPt: 12, marginMm: 18, rule: true, accent: "#000000", center: false },
  { id: "cv-academic", kind: "cv", order: CV_ORDER, name: "Academic CV", description: "Serif CV that leads with education, then research and teaching roles.", serif: true, bodyPt: 10.5, namePt: 21, headingPt: 12, marginMm: 20, rule: true, accent: "#7a1f3d", center: true },
  { id: "cv-professional", kind: "cv", order: ["summary", "experience", "education", "projects", "certifications", "skills"], name: "Professional CV", description: "Full-length CV in clean sans-serif; experience first, every section kept.", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 18, rule: true, accent: "#0f5e63", center: false },
];

export const DEFAULT_TEMPLATE = "classic";

/** Style for a template id; unknown ids (a template added on the server only) fall back to Classic's look. */
export function templateStyle(id: string): TemplateStyle {
  return TEMPLATE_STYLES.find((t) => t.id === id) ?? { ...TEMPLATE_STYLES[0]!, id, name: id };
}
