import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const JOB_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const me = { path: "/auth/me", body: SESSION };

const JOB = {
  id: JOB_ID,
  source: "paste",
  title: "Backend Engineer",
  company: "Acme",
  location: null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
  required_count: 2,
  skill_count: 3,
  source_url: null,
  source_filename: null,
  raw_text: "Backend Engineer",
  analysis: { analyzer_version: "jd-rules-v1", requirements: [], skills: [] },
};
const { raw_text: _r, analysis: _a, source_url: _u, source_filename: _f, ...JOB_SUMMARY } = JOB;

const MASTER = {
  id: RESUME_ID,
  kind: "master",
  status: "active",
  title: "Master resume",
  current_version: 2,
  master_resume_id: null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
};

const MATCH = {
  id: "44444444-4444-4444-8444-444444444444",
  job_id: JOB_ID,
  job_title: "Backend Engineer",
  job_company: "Acme",
  resume_id: RESUME_ID,
  resume_title: "Master resume",
  resume_version: 1,
  overall: 72,
  method_version: "match-rules-v1",
  created_at: "2026-10-12T06:00:00Z",
  stale: false,
  result: {
    method_version: "match-rules-v1",
    overall: 72,
    resume_years: 6,
    keywords_matched: [],
    keywords_missing: ["pipelines"],
    subscores: [
      { key: "skills", label: "Skills", score: 60, weight: 40, explanation: "2 of 3 skills shown." },
      { key: "experience", label: "Experience", score: null, weight: 20, explanation: "The posting states no years of experience." },
    ],
    requirements: [
      {
        requirement_id: "r1",
        text: "Experience with Python.",
        tier: "required",
        category: "skill",
        status: "strong",
        reason: "Used in your experience or projects: Python.",
        evidence: [{ kind: "experience", entity_id: "e1", label: "Engineer at Acme", excerpt: "Built Python APIs." }],
      },
      { requirement_id: "r2", text: "Experience with Rust.", tier: "required", category: "skill", status: "missing", reason: "Not found in your resume: Rust.", evidence: [] },
    ],
    skills: [
      { skill: "Python", tier: "required", status: "strong", severity: null, evidence: [{ kind: "experience", entity_id: "e1", label: "Engineer at Acme", excerpt: "Built Python APIs." }] },
      { skill: "Rust", tier: "required", status: "missing", severity: "critical", evidence: [] },
      { skill: "Docker", tier: "preferred", status: "partial", severity: "low", evidence: [{ kind: "skill", entity_id: "s1", label: "Skills", excerpt: "Docker" }] },
    ],
  },
};

describe("Job Match", () => {
  it("deletes a saved job from the match list after a confirm", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/jobs", body: [JOB_SUMMARY] },
      { path: "/matches", body: [] },
      { method: "DELETE", path: `/jobs/${JOB_ID}`, status: 204 },
    ]);
    renderApp("/match");
    await user.click(await screen.findByRole("button", { name: "Delete Backend Engineer" }));
    expect(screen.getByText(/removes the saved job everywhere/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === `/jobs/${JOB_ID}`)).toBe(true));
  });

  it("lists jobs with their latest score", async () => {
    mockApi([me, { path: "/jobs", body: [JOB_SUMMARY] }, { path: "/matches", body: [{ ...MATCH, result: undefined, stale: true }] }]);
    renderApp("/match");
    expect(await screen.findByRole("link", { name: "Backend Engineer" })).toHaveAttribute("href", `/jobs/${JOB_ID}/match`);
    expect(screen.getByText("72/100")).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
  });

  it("runs a first match against the master resume", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { path: `/jobs/${JOB_ID}/matches/latest`, body: null },
      { path: "/resumes", body: [MASTER] },
      { method: "POST", path: `/jobs/${JOB_ID}/matches`, status: 201, body: MATCH },
      { path: "/matches", body: [] },
    ]);
    renderApp(`/jobs/${JOB_ID}/match`);
    expect(await screen.findByText("Not matched yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Match my resume/ }));
    expect(await screen.findByRole("img", { name: /Match score: 72 out of 100/ })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({});
    // Evidence quotes the resume, and unscored parts say so.
    expect(screen.getByText("“Built Python APIs.”")).toBeInTheDocument();
    expect(screen.getByText("Not scored")).toBeInTheDocument();
    expect(screen.getByText("Not found in your resume: Rust.")).toBeInTheDocument();
  });

  it("asks for a master resume when there is none", async () => {
    mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { path: `/jobs/${JOB_ID}/matches/latest`, body: null },
      { path: "/resumes", body: [] },
    ]);
    renderApp(`/jobs/${JOB_ID}/match`);
    expect(await screen.findByText("Add your master resume first")).toBeInTheDocument();
  });

  it("warns when the match is out of date", async () => {
    mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { path: `/jobs/${JOB_ID}/matches/latest`, body: { ...MATCH, stale: true } },
      { path: "/resumes", body: [MASTER] },
    ]);
    renderApp(`/jobs/${JOB_ID}/match`);
    expect(await screen.findByText("This match is out of date")).toBeInTheDocument();
  });

  it("groups skill gaps by severity", async () => {
    mockApi([
      me,
      { path: `/jobs/${JOB_ID}`, body: JOB },
      { path: `/jobs/${JOB_ID}/matches/latest`, body: MATCH },
      { path: "/resumes", body: [MASTER] },
    ]);
    renderApp(`/jobs/${JOB_ID}/gaps`);
    const critical = await screen.findByRole("region", { name: "Critical gaps" });
    expect(within(critical).getByRole("rowheader", { name: /Rust/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "No gap" })).toHaveTextContent("Python");
    expect(screen.getByRole("region", { name: "Low gaps" })).toHaveTextContent("Listed only");
    expect(screen.queryByRole("region", { name: "High gaps" })).not.toBeInTheDocument();
  });
});
