import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

/** The API marks list fields with defaults as optional; the editor works on a complete document. */
export type Contact = Required<S["Contact"]>;
export type Experience = Required<S["Experience"]>;
export type Education = Required<S["Education"]>;
export type Skill = Required<S["Skill"]>;
export type Project = Required<S["Project"]>;
export type Certification = Required<S["Certification"]>;
export type OtherSection = Required<S["OtherSection"]>;
export type ResumeDoc = {
  contact: Contact;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];
  other: OtherSection[];
  /** Sections read in this order where the first of them sits; empty: the template's order. */
  section_order: NonNullable<S["ResumeContent"]["section_order"]>;
};

export type ResumeSummary = S["ResumeSummaryOut"];
export type ResumeDetail = Omit<S["ResumeDetailOut"], "content"> & { content: ResumeDoc };
export type VersionMeta = S["VersionMetaOut"];
export type Version = Omit<S["VersionOut"], "content"> & { content: ResumeDoc };
export type Analysis = S["AnalysisOut"];
export type ImportReport = S["ImportReportOut"];
export type ResumeImport = Omit<S["ImportOut"], "content"> & { content: ResumeDoc };

export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeContent(raw: S["ResumeContent"] | undefined): ResumeDoc {
  const c = raw ?? ({ summary: "" } as S["ResumeContent"]);
  return {
    contact: {
      full_name: c.contact?.full_name ?? "",
      headline: c.contact?.headline ?? "",
      email: c.contact?.email ?? "",
      phone: c.contact?.phone ?? "",
      location: c.contact?.location ?? "",
      links: c.contact?.links ?? [],
    },
    summary: c.summary ?? "",
    experience: (c.experience ?? []).map((e) => ({ ...e, id: e.id ?? newId(), bullets: e.bullets ?? [] })),
    education: (c.education ?? []).map((e) => ({ ...e, id: e.id ?? newId(), details: e.details ?? [] })),
    skills: (c.skills ?? []).map((s) => ({ ...s, id: s.id ?? newId(), category: s.category ?? "" })),
    projects: (c.projects ?? []).map((p) => ({
      ...p,
      id: p.id ?? newId(),
      technologies: p.technologies ?? [],
      bullets: p.bullets ?? [],
    })),
    certifications: (c.certifications ?? []).map((x) => ({ ...x, id: x.id ?? newId() })),
    other: (c.other ?? []).map((o) => ({ ...o, id: o.id ?? newId(), lines: o.lines ?? [] })),
    section_order: c.section_order ?? [],
  };
}

export function emptyResume(): ResumeDoc {
  return normalizeContent(undefined);
}

const withDoc = <T extends { content: S["ResumeContent"] }>(value: T) => ({
  ...value,
  content: normalizeContent(value.content),
});

export const resumeService = {
  list: () => api.get<ResumeSummary[]>("/resumes"),
  get: async (id: string) => withDoc(await api.get<S["ResumeDetailOut"]>(`/resumes/${id}`)) as ResumeDetail,
  create: async (title: string, content: ResumeDoc) =>
    withDoc(await api.post<S["ResumeDetailOut"]>("/resumes", { title, content })) as ResumeDetail,
  updateContent: async (id: string, baseVersion: number, content: ResumeDoc, note?: string) =>
    withDoc(
      await api.put<S["ResumeDetailOut"]>(`/resumes/${id}/content`, { base_version: baseVersion, content, note }),
    ) as ResumeDetail,
  rename: (id: string, title: string) => api.patch<ResumeSummary>(`/resumes/${id}`, { title }),
  remove: (id: string) => api.delete<void>(`/resumes/${id}`),
  versions: (id: string) => api.get<VersionMeta[]>(`/resumes/${id}/versions`),
  version: async (id: string, version: number) =>
    withDoc(await api.get<S["VersionOut"]>(`/resumes/${id}/versions/${version}`)) as Version,
  restore: async (id: string, version: number, baseVersion: number) =>
    withDoc(
      await api.post<S["ResumeDetailOut"]>(`/resumes/${id}/versions/${version}/restore`, { base_version: baseVersion }),
    ) as ResumeDetail,
  analysis: (id: string) => api.get<Analysis>(`/resumes/${id}/analysis`),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return withDoc(await api.post<S["ImportOut"]>("/resumes/imports", form)) as ResumeImport;
  },
  getImport: async (id: string) => withDoc(await api.get<S["ImportOut"]>(`/resumes/imports/${id}`)) as ResumeImport,
  confirmImport: async (id: string, content: ResumeDoc, title?: string) =>
    withDoc(
      await api.post<S["ResumeDetailOut"]>(`/resumes/imports/${id}/confirm`, { content, title }),
    ) as ResumeDetail,
  discardImport: (id: string) => api.post<void>(`/resumes/imports/${id}/discard`),
  aiParseImport: async (id: string) =>
    withDoc(await api.post<S["ImportOut"]>(`/resumes/imports/${id}/ai-parse`)) as ResumeImport,
  undoAiParse: async (id: string) =>
    withDoc(await api.delete<S["ImportOut"]>(`/resumes/imports/${id}/ai-parse`)) as ResumeImport,
};
