import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type MatchSummary = S["MatchSummaryOut"];
export type EvidenceRef = S["EvidenceRef"];
export type RequirementMatch = Omit<S["RequirementMatch"], "evidence"> & { evidence: EvidenceRef[] };
export type SkillGap = Omit<Required<S["SkillGap"]>, "evidence"> & { evidence: EvidenceRef[] };
export type Subscore = S["Subscore"];
export type MatchStatus = RequirementMatch["status"];
export type Severity = NonNullable<SkillGap["severity"]>;
export type Match = Omit<S["MatchOut"], "result"> & {
  result: Omit<S["MatchResult"], "requirements" | "skills"> & {
    requirements: RequirementMatch[];
    skills: SkillGap[];
  };
};

function normalize(m: S["MatchOut"]): Match {
  return {
    ...m,
    result: {
      ...m.result,
      requirements: m.result.requirements.map((r) => ({ ...r, evidence: r.evidence ?? [] })),
      skills: m.result.skills.map((g) => ({
        ...g,
        severity: g.severity ?? null,
        covered_by_alternative: g.covered_by_alternative ?? false,
        evidence: g.evidence ?? [],
      })),
    },
  };
}

export const STATUS_LABEL: Record<MatchStatus, string> = {
  strong: "Strong evidence",
  partial: "Partial evidence",
  missing: "Not found",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const matchService = {
  list: () => api.get<MatchSummary[]>("/matches"),
  /** null when the job has never been matched. */
  latest: async (jobId: string) => {
    const found = await api.get<S["MatchOut"] | null>(`/jobs/${jobId}/matches/latest`);
    return found ? normalize(found) : null;
  },
  run: async (jobId: string) => normalize(await api.post<S["MatchOut"]>(`/jobs/${jobId}/matches`, {})),
};
