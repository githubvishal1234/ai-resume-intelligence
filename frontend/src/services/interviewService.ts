import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type Question = Required<S["Question"]>;
export type QuestionCategory = Question["category"];
export type PrepSummary = S["PrepSummaryOut"];
export type PracticeSessionSummary = S["PracticeSessionSummaryOut"];
export type PrepDetail = Omit<S["PrepDetailOut"], "questions"> & { questions: Question[] };
export type PracticeAnswer = S["PracticeAnswerOut"];
export type PracticeSession = Omit<S["PracticeSessionOut"], "questions"> & { questions: Question[] };
export type AnswerInput = { answer: string; self_rating: number | null; notes: string };

export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  opening: "Opening",
  experience: "Your experience",
  technical: "Technical depth",
  gap: "Skill gaps",
  role: "The role",
  behavioral: "Behavioral",
};

export const CATEGORY_ORDER: QuestionCategory[] = ["opening", "experience", "technical", "gap", "role", "behavioral"];

function question(q: S["Question"]): Question {
  return { ...q, requirement_ids: q.requirement_ids ?? [], evidence: q.evidence ?? [], tips: q.tips ?? [] };
}

const prep = (p: S["PrepDetailOut"]): PrepDetail => ({ ...p, questions: p.questions.map(question) });
const session = (s: S["PracticeSessionOut"]): PracticeSession => ({ ...s, questions: s.questions.map(question) });

export const interviewService = {
  list: () => api.get<PrepSummary[]>("/interview/preps"),
  get: async (id: string) => prep(await api.get<S["PrepDetailOut"]>(`/interview/preps/${id}`)),
  create: async (jobId: string, resumeId: string | null) =>
    prep(await api.post<S["PrepDetailOut"]>("/interview/preps", { job_id: jobId, resume_id: resumeId })),
  remove: (id: string) => api.delete<void>(`/interview/preps/${id}`),
  start: async (prepId: string, questionIds: string[] | null) =>
    session(await api.post<S["PracticeSessionOut"]>(`/interview/preps/${prepId}/sessions`, { question_ids: questionIds })),
  session: async (id: string) => session(await api.get<S["PracticeSessionOut"]>(`/interview/sessions/${id}`)),
  saveAnswer: async (id: string, questionId: string, input: AnswerInput) =>
    session(await api.put<S["PracticeSessionOut"]>(`/interview/sessions/${id}/answers/${questionId}`, input)),
  evaluate: async (id: string, questionId: string) =>
    session(await api.post<S["PracticeSessionOut"]>(`/interview/sessions/${id}/answers/${questionId}/evaluate`)),
  complete: async (id: string) => session(await api.post<S["PracticeSessionOut"]>(`/interview/sessions/${id}/complete`)),
};
