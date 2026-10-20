import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type LetterSummary = S["LetterSummaryOut"];
export type Letter = S["LetterOut"];
export type LetterPatch = Partial<Pick<Letter, "title" | "recipient_name" | "company" | "body" | "template">>;

export const coverLetterService = {
  list: () => api.get<LetterSummary[]>("/cover-letters"),
  forJob: (jobId: string) => api.get<LetterSummary[]>(`/cover-letters?job_id=${encodeURIComponent(jobId)}`),
  regenerate: (id: string) => api.post<Letter>(`/cover-letters/${id}/regenerate`),
  get: (id: string) => api.get<Letter>(`/cover-letters/${id}`),
  create: (body: { resume_id?: string | null; job_id?: string | null; template?: string }) =>
    api.post<Letter>("/cover-letters", body),
  update: (id: string, body: LetterPatch) => api.patch<Letter>(`/cover-letters/${id}`, body),
  remove: (id: string) => api.delete<void>(`/cover-letters/${id}`),
  pdfUrl: (id: string) => `/api/v1/cover-letters/${id}/export.pdf`,
};
