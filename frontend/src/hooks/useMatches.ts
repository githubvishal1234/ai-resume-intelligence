import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { matchService } from "@/services/matchService";

export const matchKeys = {
  all: ["matches"] as const,
  list: () => [...matchKeys.all, "list"] as const,
  latest: (jobId: string) => [...matchKeys.all, "latest", jobId] as const,
};

export function useMatchList() {
  return useQuery({ queryKey: matchKeys.list(), queryFn: matchService.list });
}

/** The latest match for a job, or null when the job has never been matched. */
export function useLatestMatch(jobId: string) {
  return useQuery({
    queryKey: matchKeys.latest(jobId),
    queryFn: () => matchService.latest(jobId),
  });
}

export function useRunMatch(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => matchService.run(jobId),
    onSuccess: (match) => {
      client.setQueryData(matchKeys.latest(jobId), match);
      void client.invalidateQueries({ queryKey: matchKeys.list() });
    },
  });
}
