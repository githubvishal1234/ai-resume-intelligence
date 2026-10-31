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
export type Bullet = S["BulletOut"];
/** A job skill the user says they've used: where (a role or project id, or "") and what they did. */
export type SkillAnswer = { skill: string; where: string; note: string };

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
  /** `resumeText` null: tailor the master resume. */
  quick: async (resumeText: string | null, jobText: string) =>
    withDoc(
      await api.post<S["TailoringSessionOut"]>("/tailoring/quick", {
        job_text: jobText,
        ...(resumeText !== null ? { resume_text: resumeText } : {}),
      }),
    ),
  resumeText: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post<S["ResumeTextOut"]>("/tailoring/resume-text", form)).text;
  },
  decide: async (id: string, changeId: string, decision: Decision, editedText?: string, keepSkills?: string[]) =>
    withDoc(
      await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/changes/${changeId}/decision`, {
        decision,
        ...(editedText !== undefined ? { edited_text: editedText } : {}),
        ...(keepSkills !== undefined ? { keep_skills: keepSkills } : {}),
      }),
    ),
  rewrite: async (id: string, changeId: string) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/changes/${changeId}/rewrite`)),
  rewriteBullet: async (id: string, experienceId: string, bulletIndex: number) =>
    withDoc(
      await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/bullets/rewrite`, {
        experience_id: experienceId,
        bullet_index: bulletIndex,
      }),
    ),
  focus: async (id: string) => withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/focus`)),
  /** After the skill questions: adds the "yes" skills, runs maximum focus, accepts clean changes. */
  tailor: async (id: string, skills: SkillAnswer[]) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/tailor`, { skills })),
  confirmSkill: async (id: string, skill: string, note: string, where: string) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/skills`, { skill, note, where })),
  acceptClean: async (id: string) => withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/accept-clean`)),
  finalize: async (id: string, title?: string) =>
    withDoc(await api.post<S["TailoringSessionOut"]>(`/tailoring/${id}/finalize`, title ? { title } : {})),
  discard: (id: string) => api.post<void>(`/tailoring/${id}/discard`),
};
