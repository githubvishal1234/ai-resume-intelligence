import type { components } from "@/types/api";
import { api, apiUrl } from "./apiClient";

type S = components["schemas"];

export type OutputTemplate = S["TemplateOut"];
export type AtsReport = S["AtsReport"];
export type OutputFont = S["FontOut"];

/** "" for `font` or `skills`: the template's own. */
export type SkillsStyle = "" | "table";
const query = (template: string, font = "", skills: SkillsStyle = "") =>
  `template=${encodeURIComponent(template)}${font ? `&font=${encodeURIComponent(font)}` : ""}${skills ? `&skills=${skills}` : ""}`;

export const outputService = {
  templates: () => api.get<OutputTemplate[]>("/output/templates"),
  fonts: () => api.get<OutputFont[]>("/output/fonts"),
  ats: (resumeId: string, template: string, font = "", skills: SkillsStyle = "") =>
    api.get<AtsReport>(`/resumes/${resumeId}/ats?${query(template, font, skills)}`),
  /** Same-origin, cookie-authenticated download link (GET needs no CSRF token). */
  pdfUrl: (resumeId: string, template: string, font = "", skills: SkillsStyle = "") =>
    apiUrl(`/resumes/${resumeId}/export.pdf?${query(template, font, skills)}`),
};
