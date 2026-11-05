import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetDeleted } from "@/lib/forgetDeleted";
import { tailoringService, type Decision, type Session, type SkillAnswer } from "@/services/tailoringService";
import { jobKeys } from "./useJobs";
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

/** Paste a resume and a job: the server saves both (the resume never replaces the master). */
export function useQuickTailor() {
  const settle = useSettle();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ resumeText, jobText }: { resumeText: string | null; jobText: string }) =>
      tailoringService.quick(resumeText, jobText),
    onSuccess: (session) => {
      settle(session);
      void client.invalidateQueries({ queryKey: jobKeys.list() });
      void client.invalidateQueries({ queryKey: resumeKeys.all });
    },
  });
}

export function useDecide(id: string) {
  const settle = useSettle();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      changeId,
      decision,
      editedText,
      keepSkills,
    }: {
      changeId: string;
      decision: Decision;
      editedText?: string;
      keepSkills?: string[];
    }) => tailoringService.decide(id, changeId, decision, editedText, keepSkills),
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

export function useFocus(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: () => tailoringService.focus(id), onSuccess: settle });
}

export function useTailorWithAnswers() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, skills }: { id: string; skills: SkillAnswer[] }) => tailoringService.tailor(id, skills),
    onSuccess: settle,
  });
}

export function useConfirmSkill(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ skill, note, where }: { skill: string; note: string; where: string }) =>
      tailoringService.confirmSkill(id, skill, note, where),
    onSuccess: settle,
  });
}

export function useAcceptClean(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: () => tailoringService.acceptClean(id), onSuccess: settle });
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
