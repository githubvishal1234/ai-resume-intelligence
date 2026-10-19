import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insightsService, proofService, type ProofKind, type ProofStatus } from "@/services/insightsService";

export const insightKeys = {
  outcomes: ["insights", "outcomes"] as const,
  market: ["insights", "market"] as const,
  proofs: ["proofs"] as const,
  suggestions: (skill: string) => ["proofs", "suggestions", skill] as const,
};

export function useOutcomes() {
  return useQuery({ queryKey: insightKeys.outcomes, queryFn: insightsService.outcomes });
}

export function useMarket() {
  return useQuery({ queryKey: insightKeys.market, queryFn: insightsService.market });
}

export function useProofs() {
  return useQuery({ queryKey: insightKeys.proofs, queryFn: proofService.list });
}

export function useProofSuggestions(skill: string | null) {
  return useQuery({
    queryKey: insightKeys.suggestions(skill ?? ""),
    queryFn: () => proofService.suggestions(skill ?? ""),
    enabled: !!skill,
  });
}

function useRefreshProofs() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: insightKeys.proofs });
}

export function useCreateProof() {
  const refresh = useRefreshProofs();
  return useMutation({
    mutationFn: (body: { skill: string; kind?: ProofKind; job_id?: string | null }) => proofService.create(body),
    onSuccess: refresh,
  });
}

export function useUpdateProof() {
  const refresh = useRefreshProofs();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; plan?: string; status?: ProofStatus }) =>
      proofService.update(id, body),
    onSuccess: refresh,
  });
}

export function useDeleteProof() {
  const refresh = useRefreshProofs();
  return useMutation({ mutationFn: (id: string) => proofService.remove(id), onSuccess: refresh });
}
