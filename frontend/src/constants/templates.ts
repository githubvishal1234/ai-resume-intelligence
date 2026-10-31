/**
 * Visual settings of the PDF templates, for the in-browser preview. They mirror
 * backend/app/output/templates.py (the PDF is the source of truth; keep both in sync).
 * The list of available templates still comes from GET /output/templates.
 */
export type SectionKey = "summary" | "experience" | "education" | "skills" | "projects" | "certifications";
export const RESUME_ORDER: SectionKey[] = ["summary", "experience", "education", "skills", "projects", "certifications"];
export const CV_ORDER: SectionKey[] = ["summary", "education", "experience", "projects", "certifications", "skills"];
/** Sidebar layouts: these sections sit in the sidebar, which the PDF draws (and an ATS reads) first. */
export const SIDEBAR_SECTIONS: SectionKey[] = ["skills", "certifications", "education"];
export const SIDEBAR_ORDER: SectionKey[] = [...SIDEBAR_SECTIONS, "summary", "experience", "projects"];

/** `order` with the `lead` sections, in that order, where the first of them sits (mirrors `arrange` in templates.py). */
export function arrange(order: SectionKey[], lead: readonly SectionKey[]): SectionKey[] {
  const front = [...new Set(lead)].filter((k) => order.includes(k));
  if (!front.length) return order;
  const rest = order.filter((k) => !front.includes(k));
  const first = Math.min(...front.map((k) => order.indexOf(k)));
  const at = order.slice(0, first).filter((k) => !front.includes(k)).length;
  return [...rest.slice(0, at), ...front, ...rest.slice(at)];
}

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
  /**
   * "banner": name on a solid accent band; "stripe": an accent bar down the page's left edge;
   * "split": name left, contact stacked right; "monogram": initials in an accent square.
   */
  header: "plain" | "banner" | "stripe" | "split" | "monogram";
  layout: "single" | "sidebar" | "timeline";
  /** Sidebar background: the accent colour (white text) or a light tint of it. */
  sidebarFill: "solid" | "tint";
  /** Shows the user's profile photo, if they uploaded one. */
  photo: boolean;
  /** Each role's dates right-aligned on its title line. */
  datesRight: boolean;
  /** Skills in three columns instead of comma lists. */
  skillsGrid: boolean;
  /** Section headings on a light tint of the accent. */
  band: boolean;
  /** Body line height (default 1.35); mirrors `line_height`. */
  lineHeight?: number;
  /** Uppercase section headings; mirrors `upper_headings`. */
  upperHeadings?: boolean;
  /** For the gallery's filters. */
  category: TemplateCategory;
  colour: string;
};

export type TemplateCategory = "Professional" | "Modern" | "Creative" | "Simple";

type Layout = Pick<TemplateStyle, "layout" | "sidebarFill" | "photo" | "datesRight" | "skillsGrid">;
const SINGLE: Layout = { layout: "single", sidebarFill: "solid", photo: false, datesRight: false, skillsGrid: false };

/** "safe": one column of text. "friendly": sidebar or timeline, read in order but in columns. */
export const atsLevel = (t: Pick<TemplateStyle, "layout">) => (t.layout === "single" ? "safe" : "friendly");

type Base = Omit<TemplateStyle, "header" | "band" | keyof Layout>;

const ORIGINALS: Base[] = [
  { id: "classic", kind: "resume", order: RESUME_ORDER, name: "Classic", description: "Clean sans-serif, generous spacing, ruled section headings.", serif: false, bodyPt: 10.5, namePt: 20, headingPt: 11.5, marginMm: 18, rule: true, accent: "#1f2a44", center: false, category: "Professional", colour: "Navy" },
  { id: "modern", kind: "resume", order: RESUME_ORDER, name: "Modern", description: "Indigo headings, a large name and ruled sections.", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, accent: "#3730a3", center: false, category: "Modern", colour: "Indigo" },
  { id: "executive", kind: "resume", order: RESUME_ORDER, name: "Executive", description: "Serif type, centred name and navy ruled headings.", serif: true, bodyPt: 10.5, namePt: 22, headingPt: 12, marginMm: 18, rule: true, accent: "#1f2a44", center: true, category: "Professional", colour: "Navy" },
  { id: "minimal", kind: "resume", order: RESUME_ORDER, name: "Minimal", description: "Centred header, wide margins and quiet grey headings.", serif: false, bodyPt: 10, namePt: 18, headingPt: 11, marginMm: 20, rule: false, accent: "#374151", center: true, category: "Simple", colour: "Charcoal" },
  { id: "compact", kind: "resume", order: RESUME_ORDER, name: "Compact", description: "Tighter spacing to fit more on a page; plain headings.", serif: false, bodyPt: 9.5, namePt: 16, headingPt: 10.5, marginMm: 13, rule: false, accent: "#000000", center: false, category: "Simple", colour: "Black" },
  { id: "one-page", kind: "resume", order: RESUME_ORDER, name: "One Page", description: "Small type, tight spacing and uppercase ruled headings to fit one page.", serif: false, bodyPt: 8.8, namePt: 17, headingPt: 9.8, marginMm: 11, rule: true, accent: "#000000", center: false, category: "Simple", colour: "Black", lineHeight: 1.2, upperHeadings: true },
  { id: "serif", kind: "resume", order: RESUME_ORDER, name: "Serif", description: "Serif type for a traditional look, ruled headings.", serif: true, bodyPt: 11, namePt: 20, headingPt: 12, marginMm: 18, rule: true, accent: "#000000", center: false, category: "Professional", colour: "Black" },
  { id: "cv-academic", kind: "cv", order: CV_ORDER, name: "Academic CV", description: "Serif CV that leads with education, then research and teaching roles.", serif: true, bodyPt: 10.5, namePt: 21, headingPt: 12, marginMm: 20, rule: true, accent: "#7a1f3d", center: true, category: "Professional", colour: "Burgundy" },
  { id: "cv-professional", kind: "cv", order: ["summary", "experience", "education", "projects", "certifications", "skills"], name: "Professional CV", description: "Full-length CV in clean sans-serif; experience first, every section kept.", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 18, rule: true, accent: "#0f5e63", center: false, category: "Professional", colour: "Teal" },
];

/** Colour families for the generated designs; mirrors PALETTES in backend/app/output/templates.py. */
export const PALETTES: Record<string, string> = {
  navy: "#1f3a5f",
  teal: "#0f6366",
  burgundy: "#8a1c3b",
  forest: "#2f6b3a",
  plum: "#5b3aa8",
  charcoal: "#374151",
};

type Design = Omit<TemplateStyle, "id" | "accent" | "colour" | "kind" | "order" | keyof Layout> &
  Partial<Layout> & { order?: SectionKey[] };

/** Designs offered in every palette; mirrors DESIGNS in backend/app/output/templates.py. */
const DESIGNS: Record<string, Design> = {
  banner: { name: "Banner", description: "Name and contact on a solid colour band, ruled headings.", category: "Modern", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, center: false, header: "banner", band: false },
  stripe: { name: "Stripe", description: "A colour stripe down the left edge and colour headings.", category: "Creative", serif: false, bodyPt: 10, namePt: 22, headingPt: 12, marginMm: 18, rule: false, center: false, header: "stripe", band: false },
  ribbon: { name: "Ribbon", description: "Section headings on soft colour ribbons, plenty of white space.", category: "Modern", serif: false, bodyPt: 10, namePt: 21, headingPt: 11, marginMm: 16, rule: false, center: false, header: "plain", band: true },
  elegant: { name: "Elegant", description: "Serif type, a centred name and soft colour ribbons.", category: "Creative", serif: true, bodyPt: 10.5, namePt: 22, headingPt: 12, marginMm: 18, rule: false, center: true, header: "plain", band: true },
  statement: { name: "Statement", description: "Serif name on a colour band with ruled serif headings.", category: "Professional", serif: true, bodyPt: 10.5, namePt: 23, headingPt: 12, marginMm: 17, rule: true, center: true, header: "banner", band: false },
  sidebar: { name: "Sidebar", description: "A solid colour sidebar with contact, skills and education.", category: "Modern", serif: false, bodyPt: 9.5, namePt: 19, headingPt: 11, marginMm: 13, rule: true, center: false, header: "plain", band: false, layout: "sidebar", order: SIDEBAR_ORDER },
  portfolio: { name: "Portfolio", description: "A soft sidebar with your photo, contact and skills.", category: "Creative", serif: false, bodyPt: 9.5, namePt: 18, headingPt: 11, marginMm: 13, rule: true, center: false, header: "plain", band: false, layout: "sidebar", sidebarFill: "tint", photo: true, order: SIDEBAR_ORDER },
  timeline: { name: "Timeline", description: "Roles on a timeline, dates in the margin, colour headings.", category: "Creative", serif: false, bodyPt: 9.5, namePt: 22, headingPt: 11.5, marginMm: 15, rule: false, center: false, header: "plain", band: false, layout: "timeline", skillsGrid: true },
  split: { name: "Split", description: "Name on the left, contact on the right, dates aligned right.", category: "Professional", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, center: false, header: "split", band: false, datesRight: true },
  monogram: { name: "Monogram", description: "Serif type with your initials in a colour square.", category: "Professional", serif: true, bodyPt: 10, namePt: 21, headingPt: 12, marginMm: 17, rule: true, center: false, header: "monogram", band: false, datesRight: true },
  ledger: { name: "Ledger", description: "Compact and tidy: dates right, skills in a three-column grid.", category: "Simple", serif: false, bodyPt: 9.5, namePt: 18, headingPt: 10.5, marginMm: 13, rule: true, center: false, header: "plain", band: false, datesRight: true, skillsGrid: true },
  portrait: { name: "Portrait", description: "One column with your photo beside the name.", category: "Modern", serif: false, bodyPt: 10, namePt: 22, headingPt: 11.5, marginMm: 16, rule: true, center: false, header: "plain", band: false, photo: true },
};

const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export const TEMPLATE_STYLES: TemplateStyle[] = [
  ...ORIGINALS.map((t) => ({ ...t, ...SINGLE, header: "plain" as const, band: false })),
  ...Object.entries(DESIGNS).flatMap(([design, d]) =>
    Object.entries(PALETTES).map(([palette, accent]) => ({
      ...SINGLE,
      ...d,
      id: `${design}-${palette}`,
      name: `${d.name} · ${title(palette)}`,
      kind: "resume" as const,
      order: d.order ?? RESUME_ORDER,
      accent,
      colour: title(palette),
    })),
  ),
];

/** Sections a CV usually adds on top of a resume; stored as extra ("other") sections. */
export const CV_SECTIONS = ["Publications", "Languages", "Conferences and talks", "Awards", "Teaching", "References"];

export const DEFAULT_TEMPLATE = "classic";

/** Style for a template id; unknown ids (a template added on the server only) fall back to Classic's look. */
export function templateStyle(id: string): TemplateStyle {
  return TEMPLATE_STYLES.find((t) => t.id === id) ?? { ...TEMPLATE_STYLES[0]!, id, name: id };
}
