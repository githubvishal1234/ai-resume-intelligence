import type { components } from "@/types/api";
import { api, apiUrl } from "./apiClient";

type S = components["schemas"];

export type OutputTemplate = S["TemplateOut"];
export type AtsReport = S["AtsReport"];

export const outputService = {
  templates: () => api.get<OutputTemplate[]>("/output/templates"),
  ats: (resumeId: string, template: string) =>
    api.get<AtsReport>(`/resumes/${resumeId}/ats?template=${encodeURIComponent(template)}`),
  /** Same-origin, cookie-authenticated download link (GET needs no CSRF token). */
  pdfUrl: (resumeId: string, template: string) =>
    apiUrl(`/resumes/${resumeId}/export.pdf?template=${encodeURIComponent(template)}`),
};
