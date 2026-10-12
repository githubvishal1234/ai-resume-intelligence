import { useQuery } from "@tanstack/react-query";
import { systemService } from "@/services/systemService";

export function useCapabilities() {
  return useQuery({ queryKey: ["system", "capabilities"], queryFn: systemService.capabilities, staleTime: 60_000 });
}
