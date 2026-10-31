import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CAPS, mockApi, renderApp, SESSION } from "@/test/utils";

const JOB_ID = "33333333-3333-4333-8333-333333333333";
const me = { path: "/auth/me", body: SESSION };

const JOB = {
  id: JOB_ID,
  source: "paste",
  title: "Senior Backend Engineer",
  company: "Acme",
  location: "Bengaluru",
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
  required_count: 2,
  skill_count: 3,
  source_url: null,
  source_filename: null,
  raw_text: "Senior Backend Engineer\nRequirements\n- 5+ years with Python",
  analysis: {
    analyzer_version: "jd-rules-v1",
    requirements: [
      { id: "r1", text: "5+ years with Python.", tier: "required", category: "experience", skills: ["Python"], years: 5 },
      { id: "r2", text: "Solid PostgreSQL knowledge.", tier: "required", category: "skill", skills: ["PostgreSQL"], years: null },
      { id: "r3", text: "Kafka is a plus.", tier: "nice_to_have", category: "skill", skills: ["Kafka"], years: null },
    ],
    responsibilities: ["Build REST APIs."],
    skills: [
      { name: "Python", category: "language", tier: "required", mentions: 2 },
      { name: "PostgreSQL", category: "database", tier: "required", mentions: 1 },
      { name: "Kafka", category: "tool", tier: "nice_to_have", mentions: 1 },
    ],
    keywords: ["services"],
    years_experience_min: 5,
    education_level: null,
    seniority: "Senior",
    employment_type: "Full-time",
    work_mode: "Hybrid",
    salary: null,
    sections_found: ["Requirements"],
    warnings: [],
  },
};

const { raw_text: _raw, analysis: _analysis, source_url: _url, source_filename: _file, ...SUMMARY } = JOB;

describe("AI job analysis", () => {
  const AI_CAPS = { path: "/system/capabilities", body: { ...CAPS, ai: { configured: true, provider: "groq", model: "openai/gpt-oss-120b", reason: null } } };

  it("re-reads the posting with AI and can go back to the rules", async () => {
    const user = userEvent.setup();
    const analyzed = {
      ...JOB,
      analysis: {
        ...JOB.analysis,
        analyzer_version: "jd-ai-v1",
        ai_provider: "groq",
        ai_model: "openai/gpt-oss-120b",
        ai_dropped: ["Requirement: “10+ years of Rust.”"],
      },
    };
    const { calls } = mockApi([
      me,
      AI_CAPS,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { method: "POST", path: `/jobs/${JOB_ID}/ai-analyze`, body: analyzed },
      { method: "POST", path: `/jobs/${JOB_ID}/reanalyze`, body: JOB },
      { path: "/jobs", body: [] },
    ]);
    renderApp(`/jobs/${JOB_ID}`);
    await user.click(await screen.findByRole("button", { name: "Analyze with AI" }));
    expect(await screen.findByText("Requirements read by AI (groq · openai/gpt-oss-120b)")).toBeInTheDocument();
    expect(screen.getByText("Requirement: “10+ years of Rust.”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the rule-based analysis" }));
    expect(await screen.findByRole("button", { name: "Analyze with AI" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      `/jobs/${JOB_ID}/ai-analyze`,
      `/jobs/${JOB_ID}/reanalyze`,
    ]);
  });

  it("is not offered when AI is not set up", async () => {
    mockApi([me, { path: `/jobs/${JOB_ID}`, body: JOB }]);
    renderApp(`/jobs/${JOB_ID}`);
    expect(await screen.findByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze with AI" })).not.toBeInTheDocument();
  });
});

describe("Job Analyzer", () => {
  it("is reachable from the navigation", async () => {
    mockApi([me, { path: "/jobs", body: [] }]);
    renderApp("/jobs");
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    const nav = screen.getAllByRole("link", { name: /Job Analyzer/ });
    expect(nav[0]).toHaveAttribute("href", "/jobs");
  });

  it("lists saved jobs with their counts", async () => {
    mockApi([me, { path: "/jobs", body: [SUMMARY] }]);
    renderApp("/jobs");
    expect(await screen.findByRole("link", { name: "Senior Backend Engineer" })).toHaveAttribute("href", `/jobs/${JOB_ID}`);
    expect(screen.getByText("2 required")).toBeInTheDocument();
  });

  it("deletes one saved job from the list after a confirm", async () => {
    const user = userEvent.setup();
    const other = { ...SUMMARY, id: "55555555-5555-4555-8555-555555555555", title: "Data Analyst" };
    const { calls } = mockApi([
      me,
      { path: "/jobs", body: [SUMMARY, other] },
      { method: "DELETE", path: `/jobs/${other.id}`, status: 204 },
    ]);
    renderApp("/jobs");
    await user.click(await screen.findByRole("button", { name: "Delete Data Analyst" }));
    expect(screen.getByText(/Tailored resumes, applications and cover letters stay/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([`/jobs/${other.id}`]);
  });

  it("validates pasted text and creates a job", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { method: "POST", path: "/jobs", status: 201, body: JOB },
      { path: `/jobs/${JOB_ID}`, body: JOB },
    ]);
    renderApp("/jobs/new");
    const text = await screen.findByLabelText("Job description");
    await user.click(screen.getByRole("button", { name: "Analyze job" }));
    expect(await screen.findByText(/at least 50 characters/)).toBeInTheDocument();
    await user.type(text, "Senior Backend Engineer. Requirements: 5+ years with Python and PostgreSQL.");
    await user.type(screen.getByLabelText("Company (optional)"), "Acme");
    await user.click(screen.getByRole("button", { name: "Analyze job" }));
    expect(await screen.findByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.path === "/jobs");
    // Empty optional fields are omitted so the server guesses the title.
    expect(post?.body).toEqual({
      text: "Senior Backend Engineer. Requirements: 5+ years with Python and PostgreSQL.",
      company: "Acme",
    });
  });

  it("shows requirements grouped by tier and the stated facts only", async () => {
    mockApi([me, { path: `/jobs/${JOB_ID}`, body: JOB }]);
    renderApp(`/jobs/${JOB_ID}`);
    const required = await screen.findByRole("region", { name: "Required" });
    expect(within(required).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Nice to have" })).toHaveTextContent("Kafka is a plus.");
    expect(screen.queryByRole("region", { name: "Preferred" })).not.toBeInTheDocument();
    const facts = screen.getByLabelText("Key facts");
    expect(facts).toHaveTextContent("5+ years");
    expect(facts).toHaveTextContent("Hybrid");
    expect(facts).not.toHaveTextContent("Salary");
  });

  it("lists this job's cover letters and drafts a new one", async () => {
    const LETTER = "44444444-4444-4444-8444-444444444444";
    const letter = {
      id: LETTER, title: "Cover letter: Senior Backend Engineer", company: "", template: "classic",
      resume_id: null, job_id: JOB_ID, updated_at: "2026-10-19T05:00:00Z", created_at: "2026-10-19T05:00:00Z",
      recipient_name: "", body: "Hello.", evidence: [], method_version: "letter-v1",
    };
    const { calls } = mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { path: `/cover-letters?job_id=${JOB_ID}`, body: [letter] },
      { method: "POST", path: "/cover-letters", status: 201, body: { ...letter, id: "55555555-5555-4555-8555-555555555555" } },
    ]);
    renderApp(`/jobs/${JOB_ID}`);
    const card = await screen.findByRole("region", { name: "Cover letters" });
    expect(await within(card).findByRole("link", { name: /Cover letter: Senior Backend Engineer/ })).toHaveAttribute("href", `/cover-letters/${LETTER}`);
    await userEvent.click(within(card).getByRole("button", { name: /Draft another/ }));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ job_id: JOB_ID });
  });

  it("edits details and deletes a job", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { method: "PATCH", path: `/jobs/${JOB_ID}`, body: { ...JOB, location: "Remote" } },
      { method: "DELETE", path: `/jobs/${JOB_ID}`, status: 204 },
      { path: "/jobs", body: [] },
    ]);
    renderApp(`/jobs/${JOB_ID}`);
    await user.click(await screen.findByRole("button", { name: /Edit details/ }));
    const location = screen.getByLabelText("Location");
    await user.clear(location);
    await user.type(location, "Remote");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ title: "Senior Backend Engineer", company: "Acme", location: "Remote" });
    await user.click(screen.getByRole("button", { name: /^Delete job/ }));
    await user.click(screen.getByRole("button", { name: "Delete job" }));
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
  });
});
