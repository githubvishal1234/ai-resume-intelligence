import { useQuery } from "@tanstack/react-query";
import { systemService } from "@/services/systemService";

/** Today's AI use for the signed-in user; only fetched when AI is set up. */
export function useAiUsage(enabled: boolean) {
  return useQuery({ queryKey: ["ai", "usage"], queryFn: systemService.aiUsage, enabled });
}

export function useCapabilities() {
  return useQuery({ queryKey: ["system", "capabilities"], queryFn: systemService.capabilities, staleTime: 60_000 });
}
