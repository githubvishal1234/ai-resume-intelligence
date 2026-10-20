import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const funnel = (sent: number, responded: number) => ({ sent, responded, interviewed: 0, offers: 0, response_rate: sent ? responded / sent : null, interview_rate: sent ? 0 : null });
const MASTER = { id: "11111111-1111-4111-8111-111111111111", kind: "master", status: "active", title: "Master resume", current_version: 2, master_resume_id: null, created_at: "2026-10-20T05:00:00Z", updated_at: "2026-10-20T05:00:00Z" };

function routes(over: { sent: number; responded: number; jobs: number; proofs: number; letters: number; master: boolean }) {
  return [
    { path: "/auth/me", body: SESSION },
    { path: "/resumes", body: over.master ? [MASTER] : [] },
    { path: "/insights/outcomes", body: { method_version: "outcomes-v1", min_sample: 5, total: funnel(over.sent, over.responded), by_resume: [], by_match: [], median_days_to_response: null, unsent: 0 } },
    {
      path: "/insights/market",
      body: { method_version: "market-v1", jobs_analyzed: over.jobs, has_master: over.master, coverage: over.jobs ? 0.62 : null, top_gap: over.jobs ? { name: "AWS", category: "cloud", jobs: 2, required_in: 1, weight: 5, status: "missing", evidence: null, job_titles: [] } : null, skills: [] },
    },
    { path: "/proofs", body: Array.from({ length: over.proofs }, (_, i) => ({ id: `p${i}`, skill: `S${i}`, kind: "project", title: "t", plan: "", status: i === 0 ? "done" : "todo", job_id: null, created_at: "", updated_at: "", evidence_status: i === 0 ? "strong" : "missing" })) },
    { path: "/cover-letters", body: Array.from({ length: over.letters }, (_, i) => ({ id: `l${i}`, title: `Cover letter ${i}`, company: "", template: "classic", resume_id: null, job_id: null, updated_at: "" })) },
  ];
}

describe("dashboard", () => {
  it("shows live numbers and marks the steps the data proves done", async () => {
    mockApi(routes({ sent: 4, responded: 2, jobs: 3, proofs: 2, letters: 1, master: true }));
    renderApp("/");
    const glance = await screen.findByRole("region", { name: "At a glance" });
    expect(await within(glance).findByRole("link", { name: /Reply rate: 2 of 4 sent got a reply/ })).toHaveTextContent("50%");
    expect(within(glance).getByRole("link", { name: /Market coverage: Biggest gap: AWS/ })).toHaveTextContent("62%");
    expect(within(glance).getByRole("link", { name: /Proof Board: 1 now shown on your resume/ })).toHaveTextContent("1/2");
    expect(within(glance).getByRole("link", { name: /Cover letters: Latest: Cover letter 0/ })).toHaveTextContent("1");
    expect(await screen.findByText(/3 of 6 done/)).toBeInTheDocument();
  });

  it("points a new account at its first steps", async () => {
    mockApi(routes({ sent: 0, responded: 0, jobs: 0, proofs: 0, letters: 0, master: false }));
    renderApp("/");
    const glance = await screen.findByRole("region", { name: "At a glance" });
    expect(await within(glance).findByRole("link", { name: /Track an application to start/ })).toHaveAttribute("href", "/applications/new");
    expect(within(glance).getByRole("link", { name: /Save a job posting to start/ })).toHaveAttribute("href", "/jobs/new");
    expect(await screen.findByText(/0 of 6 done/)).toBeInTheDocument();
  });
});
