import type { components } from "@/types/api";
import { api } from "./apiClient";
import { normalizeContent, type ResumeDoc } from "./resumeService";

type S = components["schemas"];

export type ChangeItem = { id: string | null; text: string };
export type TailoringChange = S["ChangeOut"];
export type FactFlag = S["FactFlag"];
export type SessionSummary = S["TailoringSessionSummaryOut"];
export type Session = Omit<S["TailoringSessionOut"], "preview"> & { preview: ResumeDoc };
export type Decision = TailoringChange["decision"];

const withDoc = (s: S["TailoringSessionOut"]): Session => ({ ...s, preview: normalizeContent(s.preview) });

export function items(value: Record<string, unknown> | null | undefined): ChangeItem[] {
  const list = value?.items;
  return Array.isArray(list) ? (list as ChangeItem[]) : [];
}

export function text(value: Record<string, unknown> | null | undefined): string {
  return typeof value?.text === "string" ? value.text : "";
}

export const tailoringService = {
  list: () => api.get<SessionSummary[]>("/tailoring"),
  get: async (id: string) => withDoc(await api.get<S["TailoringSessionOut"]>(`/tailoring/${id}`)),
  create: async (jobId: string) => withDoc(await api.post<S["TailoringSessionOut"]>("/tailoring", { job_id: jobId })),
  decide: async (id: string, changeId: string, decision: Decision, editedText?: string) =>
    withDoc(
      await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/changes/${changeId}/decision`, {
        decision,
        ...(editedText !== undefined ? { edited_text: editedText } : {}),
      }),
    ),
  rewrite: async (id: string, changeId: string) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/changes/${changeId}/rewrite`)),
  finalize: async (id: string, title?: string) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/finalize`, title ? { title } : {})),
  discard: (id: string) => api.post<void>(`/tailoring/${id}/discard`),
};
