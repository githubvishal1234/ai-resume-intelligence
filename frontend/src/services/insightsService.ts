import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type Funnel = S["FunnelOut"];
export type OutcomeGroup = S["GroupOut"];
export type Outcomes = S["OutcomesOut"];
export type SkillDemand = S["SkillDemandOut"];
export type Market = S["MarketOut"];
export type ProofKind = S["ProofOut"]["kind"];
export type ProofStatus = S["ProofOut"]["status"];
export type Proof = S["ProofOut"];
export type ProofSuggestion = S["SuggestionOut"];

export const insightsService = {
  outcomes: () => api.get<Outcomes>("/insights/outcomes"),
  market: () => api.get<Market>("/insights/market"),
};

export const proofService = {
  list: () => api.get<Proof[]>("/proofs"),
  suggestions: (skill: string) =>
    api.get<S["SuggestionsOut"]>(`/proofs/suggestions?skill=${encodeURIComponent(skill)}`),
  create: (body: { skill: string; kind?: ProofKind; job_id?: string | null }) => api.post<Proof>("/proofs", body),
  update: (id: string, body: { title?: string; plan?: string; status?: ProofStatus }) =>
    api.patch<Proof>(`/proofs/${id}`, body),
  remove: (id: string) => api.delete<void>(`/proofs/${id}`),
};
