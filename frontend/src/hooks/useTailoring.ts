import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetDeleted } from "@/lib/forgetDeleted";
import { tailoringService, type Decision, type Session } from "@/services/tailoringService";
import { resumeKeys } from "./useResumes";

export const tailoringKeys = {
  all: ["tailoring"] as const,
  list: () => [...tailoringKeys.all, "list"] as const,
  detail: (id: string) => [...tailoringKeys.all, "detail", id] as const,
};

export function useTailoringList() {
  return useQuery({ queryKey: tailoringKeys.list(), queryFn: tailoringService.list });
}

export function useTailoringSession(id: string) {
  return useQuery({ queryKey: tailoringKeys.detail(id), queryFn: () => tailoringService.get(id) });
}

function useSettle() {
  const client = useQueryClient();
  return (session: Session) => {
    client.setQueryData(tailoringKeys.detail(session.id), session);
    void client.invalidateQueries({ queryKey: tailoringKeys.list() });
  };
}

export function useStartTailoring() {
  const settle = useSettle();
  return useMutation({ mutationFn: (jobId: string) => tailoringService.create(jobId), onSuccess: settle });
}

export function useDecide(id: string) {
  const settle = useSettle();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ changeId, decision, editedText }: { changeId: string; decision: Decision; editedText?: string }) =>
      tailoringService.decide(id, changeId, decision, editedText),
    onSuccess: settle,
    // A refused accept still saves the edit and its flags on the server.
    onError: () => void client.invalidateQueries({ queryKey: tailoringKeys.detail(id) }),
  });
}

export function useRewrite(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: (changeId: string) => tailoringService.rewrite(id, changeId), onSuccess: settle });
}

export function useRewriteBullet(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ experienceId, index }: { experienceId: string; index: number }) =>
      tailoringService.rewriteBullet(id, experienceId, index),
    onSuccess: settle,
  });
}

export function useFinalize(id: string) {
  const settle = useSettle();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => tailoringService.finalize(id, title),
    onSuccess: (session) => {
      settle(session);
      void client.invalidateQueries({ queryKey: resumeKeys.list() });
    },
  });
}

export function useDiscardTailoring(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => tailoringService.discard(id),
    onSuccess: () => {
      forgetDeleted(client, tailoringKeys.detail(id));
      void client.invalidateQueries({ queryKey: tailoringKeys.list() });
    },
  });
}
