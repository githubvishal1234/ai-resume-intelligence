import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetDeleted } from "@/lib/forgetDeleted";
import { jobService, type JobDetail, type JobMeta } from "@/services/jobService";

export const jobKeys = {
  all: ["jobs"] as const,
  list: () => [...jobKeys.all, "list"] as const,
  detail: (id: string) => [...jobKeys.all, "detail", id] as const,
};

export function useJobList() {
  return useQuery({ queryKey: jobKeys.list(), queryFn: jobService.list });
}

export function useJob(id: string) {
  return useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobService.get(id) });
}

function useSettle() {
  const client = useQueryClient();
  return (job: JobDetail) => {
    client.setQueryData(jobKeys.detail(job.id), job);
    void client.invalidateQueries({ queryKey: jobKeys.list() });
  };
}

export function useCreateJob() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ text, meta }: { text: string; meta: JobMeta & { source_url?: string } }) =>
      jobService.create(text, meta),
    onSuccess: settle,
  });
}

export function useUploadJob() {
  const settle = useSettle();
  return useMutation({ mutationFn: (file: File) => jobService.upload(file), onSuccess: settle });
}

export function useJobFromUrl() {
  const settle = useSettle();
  return useMutation({ mutationFn: (url: string) => jobService.fromUrl(url), onSuccess: settle });
}

export function useUpdateJob(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: (meta: { title: string; company: string; location: string }) => jobService.update(id, meta),
    onSuccess: settle,
  });
}

export function useReanalyzeJob(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: () => jobService.reanalyze(id), onSuccess: settle });
}

export function useAiAnalyzeJob(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: () => jobService.aiAnalyze(id), onSuccess: settle });
}

export function useDeleteJob(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => jobService.remove(id),
    onSuccess: () => {
      forgetDeleted(client, jobKeys.detail(id));
      void client.invalidateQueries({ queryKey: jobKeys.list() });
    },
  });
}
