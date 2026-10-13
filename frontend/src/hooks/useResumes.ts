import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetDeleted } from "@/lib/forgetDeleted";
import { resumeService, type ResumeDetail, type ResumeDoc } from "@/services/resumeService";

export const resumeKeys = {
  all: ["resumes"] as const,
  list: () => [...resumeKeys.all, "list"] as const,
  detail: (id: string) => [...resumeKeys.all, "detail", id] as const,
  versions: (id: string) => [...resumeKeys.all, "versions", id] as const,
  version: (id: string, v: number) => [...resumeKeys.all, "version", id, v] as const,
  analysis: (id: string) => [...resumeKeys.all, "analysis", id] as const,
  import: (id: string) => [...resumeKeys.all, "import", id] as const,
};

export function useResumeList() {
  return useQuery({ queryKey: resumeKeys.list(), queryFn: resumeService.list });
}

/** The user's active master resume summary, or null when none exists yet. */
export function useMasterSummary() {
  const list = useResumeList();
  const master = list.data?.find((r) => r.kind === "master" && r.status === "active") ?? null;
  return { ...list, master };
}

export function useResume(id: string) {
  return useQuery({ queryKey: resumeKeys.detail(id), queryFn: () => resumeService.get(id) });
}

export function useVersions(id: string) {
  return useQuery({ queryKey: resumeKeys.versions(id), queryFn: () => resumeService.versions(id) });
}

export function useVersion(id: string, version: number | null) {
  return useQuery({
    queryKey: resumeKeys.version(id, version ?? 0),
    queryFn: () => resumeService.version(id, version ?? 0),
    enabled: version !== null,
  });
}

export function useAnalysis(id: string) {
  return useQuery({ queryKey: resumeKeys.analysis(id), queryFn: () => resumeService.analysis(id) });
}

export function useImport(id: string) {
  return useQuery({ queryKey: resumeKeys.import(id), queryFn: () => resumeService.getImport(id) });
}

/** After any write: put the fresh detail in cache and refetch derived views. */
function useSettle() {
  const client = useQueryClient();
  return (resume: ResumeDetail) => {
    client.setQueryData(resumeKeys.detail(resume.id), resume);
    void client.invalidateQueries({ queryKey: resumeKeys.list() });
    void client.invalidateQueries({ queryKey: resumeKeys.versions(resume.id) });
    void client.invalidateQueries({ queryKey: resumeKeys.analysis(resume.id) });
    // Saved matches may now be out of date.
    void client.invalidateQueries({ queryKey: ["matches"] });
  };
}

export function useUploadResume() {
  return useMutation({ mutationFn: (file: File) => resumeService.upload(file) });
}

export function useConfirmImport(importId: string) {
  const settle = useSettle();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ content, title }: { content: ResumeDoc; title?: string }) =>
      resumeService.confirmImport(importId, content, title),
    onSuccess: (resume) => {
      settle(resume);
      void client.invalidateQueries({ queryKey: resumeKeys.import(importId) });
    },
  });
}

export function useAiParseImport(importId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (undo: boolean) => (undo ? resumeService.undoAiParse(importId) : resumeService.aiParseImport(importId)),
    onSuccess: (item) => client.setQueryData(resumeKeys.import(importId), item),
  });
}

export function useDiscardImport(importId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => resumeService.discardImport(importId),
    onSuccess: () => client.removeQueries({ queryKey: resumeKeys.import(importId) }),
  });
}

export function useCreateResume() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ title, content }: { title: string; content: ResumeDoc }) => resumeService.create(title, content),
    onSuccess: settle,
  });
}

export function useSaveContent(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ baseVersion, content, note }: { baseVersion: number; content: ResumeDoc; note?: string }) =>
      resumeService.updateContent(id, baseVersion, content, note),
    onSuccess: settle,
  });
}

export function useRestoreVersion(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ version, baseVersion }: { version: number; baseVersion: number }) =>
      resumeService.restore(id, version, baseVersion),
    onSuccess: settle,
  });
}

export function useRenameResume(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => resumeService.rename(id, title),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: resumeKeys.detail(id) });
      void client.invalidateQueries({ queryKey: resumeKeys.list() });
    },
  });
}

export function useDeleteResume(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => resumeService.remove(id),
    onSuccess: () => {
      forgetDeleted(client, resumeKeys.detail(id));
      void client.invalidateQueries({ queryKey: resumeKeys.list() });
    },
  });
}
