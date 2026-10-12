import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { interviewService, type AnswerInput, type PracticeSession, type PrepDetail } from "@/services/interviewService";

export const interviewKeys = {
  all: ["interview"] as const,
  list: () => [...interviewKeys.all, "list"] as const,
  prep: (id: string) => [...interviewKeys.all, "prep", id] as const,
  session: (id: string) => [...interviewKeys.all, "session", id] as const,
};

export function usePrepList() {
  return useQuery({ queryKey: interviewKeys.list(), queryFn: interviewService.list });
}

export function usePrep(id: string) {
  return useQuery({ queryKey: interviewKeys.prep(id), queryFn: () => interviewService.get(id) });
}

export function usePracticeSession(id: string) {
  return useQuery({ queryKey: interviewKeys.session(id), queryFn: () => interviewService.session(id) });
}

export function useCreatePrep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, resumeId }: { jobId: string; resumeId: string | null }) => interviewService.create(jobId, resumeId),
    onSuccess: (prep) => {
      client.setQueryData(interviewKeys.prep(prep.id), prep);
      void client.invalidateQueries({ queryKey: interviewKeys.list() });
    },
  });
}

export function useDeletePrep(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => interviewService.remove(id),
    onSuccess: () => {
      client.removeQueries({ queryKey: interviewKeys.prep(id) });
      void client.invalidateQueries({ queryKey: interviewKeys.list() });
    },
  });
}

function useSettleSession() {
  const client = useQueryClient();
  return (session: PracticeSession) => {
    client.setQueryData(interviewKeys.session(session.id), session);
    // Show the session's new state on its question set at once, before the refetch lands.
    const { prep_id: _prep, job_title: _job, questions: _q, answers: _a, ...summary } = session;
    client.setQueryData<PrepDetail>(interviewKeys.prep(session.prep_id), (prep) =>
      prep
        ? {
            ...prep,
            sessions: prep.sessions.some((x) => x.id === session.id)
              ? prep.sessions.map((x) => (x.id === session.id ? summary : x))
              : [summary, ...prep.sessions],
          }
        : prep,
    );
    void client.invalidateQueries({ queryKey: interviewKeys.prep(session.prep_id) });
    void client.invalidateQueries({ queryKey: interviewKeys.list() });
  };
}

export function useStartPractice(prepId: string) {
  const settle = useSettleSession();
  return useMutation({
    mutationFn: (questionIds: string[] | null) => interviewService.start(prepId, questionIds),
    onSuccess: settle,
  });
}

export function useSaveAnswer(sessionId: string) {
  const settle = useSettleSession();
  return useMutation({
    mutationFn: ({ questionId, input }: { questionId: string; input: AnswerInput }) =>
      interviewService.saveAnswer(sessionId, questionId, input),
    onSuccess: settle,
  });
}

export function useEvaluateAnswer(sessionId: string) {
  const settle = useSettleSession();
  return useMutation({
    mutationFn: (questionId: string) => interviewService.evaluate(sessionId, questionId),
    onSuccess: settle,
  });
}

export function useCompletePractice(sessionId: string) {
  const settle = useSettleSession();
  return useMutation({ mutationFn: () => interviewService.complete(sessionId), onSuccess: settle });
}
