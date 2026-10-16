/**
 * Visual settings of the PDF templates, for the in-browser preview. They mirror
 * backend/app/output/templates.py (the PDF is the source of truth; keep both in sync).
 * The list of available templates still comes from GET /output/templates.
 */
export type TemplateStyle = {
  id: string;
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
  { id: "classic", name: "Classic", description: "Clean sans-serif, generous spacing, ruled section headings.", serif: false, bodyPt: 10.5, namePt: 20, headingPt: 11.5, marginMm: 18, rule: true, accent: "#1f2a44", center: false },
  { id: "modern", name: "Modern", description: "Indigo headings, a large name and ruled sections.", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, accent: "#3730a3", center: false },
  { id: "executive", name: "Executive", description: "Serif type, centred name and navy ruled headings.", serif: true, bodyPt: 10.5, namePt: 22, headingPt: 12, marginMm: 18, rule: true, accent: "#1f2a44", center: true },
  { id: "minimal", name: "Minimal", description: "Centred header, wide margins and quiet grey headings.", serif: false, bodyPt: 10, namePt: 18, headingPt: 11, marginMm: 20, rule: false, accent: "#374151", center: true },
  { id: "compact", name: "Compact", description: "Tighter spacing to fit more on a page; plain headings.", serif: false, bodyPt: 9.5, namePt: 16, headingPt: 10.5, marginMm: 13, rule: false, accent: "#000000", center: false },
  { id: "serif", name: "Serif", description: "Serif type for a traditional look, ruled headings.", serif: true, bodyPt: 11, namePt: 20, headingPt: 12, marginMm: 18, rule: true, accent: "#000000", center: false },
];

export const DEFAULT_TEMPLATE = "classic";

/** Style for a template id; unknown ids (a template added on the server only) fall back to Classic's look. */
export function templateStyle(id: string): TemplateStyle {
  return TEMPLATE_STYLES.find((t) => t.id === id) ?? { ...TEMPLATE_STYLES[0]!, id, name: id };
}
