import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type Requirement = Required<S["Requirement"]>;
export type JobSkill = S["JobSkill"];
export type Tier = Requirement["tier"];
export type JobAnalysis = Omit<Required<S["JobAnalysis"]>, "requirements"> & { requirements: Requirement[] };
export type JobSummary = Required<S["JobSummaryOut"]>;
export type JobDetail = Omit<Required<S["JobDetailOut"]>, "analysis"> & { analysis: JobAnalysis };
export type JobMeta = { title?: string; company?: string; location?: string };

export const TIER_LABEL: Record<Tier, string> = {
  required: "Required",
  preferred: "Preferred",
  nice_to_have: "Nice to have",
};

function normalizeAnalysis(a: S["JobAnalysis"]): JobAnalysis {
  return {
    analyzer_version: a.analyzer_version ?? "",
    requirements: (a.requirements ?? []).map((r) => ({ ...r, skills: r.skills ?? [], years: r.years ?? null })),
    responsibilities: a.responsibilities ?? [],
    skills: a.skills ?? [],
    keywords: a.keywords ?? [],
    years_experience_min: a.years_experience_min ?? null,
    education_level: a.education_level ?? null,
    seniority: a.seniority ?? null,
    employment_type: a.employment_type ?? null,
    work_mode: a.work_mode ?? null,
    salary: a.salary ?? null,
    sections_found: a.sections_found ?? [],
    warnings: a.warnings ?? [],
    ai_provider: a.ai_provider ?? null,
    ai_model: a.ai_model ?? null,
    ai_dropped: a.ai_dropped ?? [],
  };
}

function summary(j: S["JobSummaryOut"]): JobSummary {
  return { ...j, company: j.company ?? null, location: j.location ?? null, required_count: j.required_count ?? 0, skill_count: j.skill_count ?? 0 };
}

function detail(j: S["JobDetailOut"]): JobDetail {
  return {
    ...summary(j),
    source_url: j.source_url ?? null,
    source_filename: j.source_filename ?? null,
    raw_text: j.raw_text,
    analysis: normalizeAnalysis(j.analysis),
  };
}

/** Empty strings are sent as omitted so the server can guess the title from the posting. */
function cleanMeta(meta: JobMeta): JobMeta {
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
}

export const jobService = {
  list: async () => (await api.get<S["JobSummaryOut"][]>("/jobs")).map(summary),
  get: async (id: string) => detail(await api.get<S["JobDetailOut"]>(`/jobs/${id}`)),
  create: async (text: string, meta: JobMeta & { source_url?: string }) =>
    detail(await api.post<S["JobDetailOut"]>("/jobs", { text, ...cleanMeta(meta) })),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return detail(await api.post<S["JobDetailOut"]>("/jobs/upload", form));
  },
  fromUrl: async (url: string) => detail(await api.post<S["JobDetailOut"]>("/jobs/from-url", { url })),
  update: async (id: string, meta: { title: string; company: string; location: string }) =>
    detail(await api.patch<S["JobDetailOut"]>(`/jobs/${id}`, meta)),
  reanalyze: async (id: string) => detail(await api.post<S["JobDetailOut"]>(`/jobs/${id}/reanalyze`)),
  aiAnalyze: async (id: string) => detail(await api.post<S["JobDetailOut"]>(`/jobs/${id}/ai-analyze`)),
  remove: (id: string) => api.delete<void>(`/jobs/${id}`),
};
