import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CAPS, mockApi, renderApp, SESSION } from "@/test/utils";

const PREP_ID = "99999999-9999-4999-8999-999999999999";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const me = { path: "/auth/me", body: SESSION };
const caps = { path: "/system/capabilities", body: CAPS };

const Q1 = {
  id: "aaaaaaaaaaa1",
  category: "technical",
  text: "How have you used PostgreSQL, and what would you do differently next time?",
  why: "PostgreSQL is a required skill for this job, and your resume mentions it.",
  requirement_ids: ["r1"],
  evidence: [{ kind: "experience", entity_id: "e1", label: "Senior Engineer at Acme", excerpt: "Migrated reporting to PostgreSQL." }],
  tips: ["Name a concrete project, its scale, and one trade-off you made."],
};
const Q2 = {
  id: "aaaaaaaaaaa2",
  category: "gap",
  text: "This role asks for Kafka, which your resume doesn't show. How would you handle that?",
  why: "Skill gap (high): Kafka is preferred for this job.",
  requirement_ids: [],
  evidence: [],
  tips: ["Don't claim experience you don't have; interviewers check."],
};
const SUMMARY = {
  id: PREP_ID,
  job_id: JOB_ID,
  job_title: "Senior Backend Engineer",
  company: "Acme",
  resume_id: RESUME_ID,
  resume_title: "Master resume",
  resume_version: 2,
  method_version: "interview-rules-v1",
  question_count: 2,
  session_count: 0,
  created_at: "2026-10-12T05:00:00Z",
};
const PREP = { ...SUMMARY, questions: [Q1, Q2], sessions: [] };
const PRACTICE = {
  id: SESSION_ID,
  prep_id: PREP_ID,
  job_title: "Senior Backend Engineer",
  status: "in_progress",
  question_count: 2,
  answered_count: 0,
  average_rating: null,
  created_at: "2026-10-12T05:00:00Z",
  completed_at: null,
  questions: [Q1, Q2],
  answers: [],
};
const ANSWERED = {
  ...PRACTICE,
  answered_count: 1,
  average_rating: 4,
  answers: [{ question_id: Q1.id, answer: "I migrated reporting.", self_rating: 4, notes: "", feedback: null, updated_at: "2026-10-12T05:01:00Z" }],
};
const JOB = { id: JOB_ID, source: "paste", title: "Senior Backend Engineer", company: "Acme", location: null, created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z", required_count: 1, skill_count: 1 };
const MASTER = { id: RESUME_ID, kind: "master", status: "active", title: "Master resume", current_version: 2, master_resume_id: null, created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z" };

describe("Interview Prep", () => {
  it("builds a question set for a job", async () => {
    const { calls } = mockApi([
      me,
      { path: "/interview/preps", body: [] },
      { path: "/jobs", body: [JOB] },
      { path: "/resumes", body: [MASTER] },
      { method: "POST", path: "/interview/preps", status: 201, body: PREP },
    ]);
    renderApp("/interview");
    await userEvent.click(await screen.findByRole("button", { name: "Build questions" }));
    expect(await screen.findByRole("heading", { name: "Interview questions: Senior Backend Engineer" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ job_id: JOB_ID, resume_id: null });
    expect(screen.getAllByRole("link", { name: /Interview Prep/ })[0]).toHaveAttribute("href", "/interview");
  });

  it("groups questions with their reason, evidence and tips, and practices a selection", async () => {
    const { calls } = mockApi([
      me,
      { path: `/interview/preps/${PREP_ID}`, body: PREP },
      { method: "POST", path: `/interview/preps/${PREP_ID}/sessions`, status: 201, body: { ...PRACTICE, questions: [Q2], question_count: 1 } },
      { path: `/interview/sessions/${SESSION_ID}`, body: PRACTICE },
      caps,
    ]);
    renderApp(`/interview/${PREP_ID}`);
    const gaps = await screen.findByRole("region", { name: /Skill gaps/ });
    expect(within(gaps).getByText(/Don't claim experience/)).toBeInTheDocument();
    const technical = screen.getByRole("region", { name: /Technical depth/ });
    expect(within(technical).getByText("“Migrated reporting to PostgreSQL.”")).toBeInTheDocument();
    expect(within(technical).getByText(/Why: PostgreSQL is a required skill/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(Q2.text));
    await userEvent.click(screen.getByRole("button", { name: "Practice selected (1)" }));
    expect(await screen.findByLabelText("Your answer")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ question_ids: [Q2.id] });
  });

  it("saves an answer with a rating, moves on, and explains why AI feedback is off", async () => {
    const { calls } = mockApi([
      me,
      caps,
      { path: `/interview/sessions/${SESSION_ID}`, body: PRACTICE },
      { method: "PUT", path: `/interview/sessions/${SESSION_ID}/answers/${Q1.id}`, body: ANSWERED },
      { method: "POST", path: `/interview/sessions/${SESSION_ID}/complete`, body: { ...ANSWERED, status: "completed", completed_at: "2026-10-12T05:05:00Z" } },
    ]);
    renderApp(`/interview/sessions/${SESSION_ID}`);
    expect(await screen.findByText("Question 1 of 2 · Technical depth")).toBeInTheDocument();
    expect(await screen.findByText("AI feedback is not set up yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Get AI feedback/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.type(screen.getByLabelText("Your answer"), "I migrated reporting.");
    await userEvent.click(screen.getByLabelText("4 · Good"));
    await userEvent.click(screen.getByRole("button", { name: /Save and next/ }));
    expect(await screen.findByText("Question 2 of 2 · Skill gaps")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ answer: "I migrated reporting.", self_rating: 4, notes: "" });
    expect(screen.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save and finish" }));
    expect(await screen.findByRole("heading", { name: "Practice review: Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Your rating 4/5")).toBeInTheDocument();
    expect(screen.getByText("Not answered.")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  });

  it("adds AI-written questions when AI is set up", async () => {
    const aiCaps = { ...CAPS, ai: { configured: true, provider: "groq", model: "openai/gpt-oss-120b", reason: null } };
    const Q3 = { ...Q1, id: "aaaaaaaaaaa3", text: "Walk me through a slow query you fixed in PostgreSQL.", source: "ai" };
    const { calls } = mockApi([
      me,
      { path: "/system/capabilities", body: aiCaps },
      { path: `/interview/preps/${PREP_ID}`, body: PREP },
      { method: "POST", path: `/interview/preps/${PREP_ID}/ai-questions`, body: { ...PREP, question_count: 3, questions: [Q1, Q2, Q3] } },
    ]);
    renderApp(`/interview/${PREP_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Suggest questions" }));
    expect(await screen.findByText(Q3.text)).toBeInTheDocument();
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("1 AI-written so far.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest more" })).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/ai-questions"))).toBe(true);
  });
});
