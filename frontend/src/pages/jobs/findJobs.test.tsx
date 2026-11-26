import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CAPS, mockApi, renderApp, SESSION } from "@/test/utils";

const me = { path: "/auth/me", body: SESSION };
const on = { path: "/system/capabilities", body: { ...CAPS, job_search: { configured: true, provider: "adzuna" } } };
const off = { path: "/system/capabilities", body: { ...CAPS, job_search: { configured: false, provider: null } } };
const resume = (id: string, kind: "master" | "tailored", title: string) => ({
  id, kind, status: "active", title, current_version: 1, master_resume_id: null, created_at: "2026-11-01T05:00:00Z", updated_at: "2026-11-01T05:00:00Z",
});
const RESUMES = { path: "/resumes", body: [resume("m1", "master", "Master resume"), resume("t1", "tailored", "Backend at Acme")] };
const listing = (id: string, title: string, shown: string[], missing: string[]) => ({
  id, title, company: "Acme", location: "Bengaluru", description: "Build APIs.", url: `https://www.adzuna.in/land/ad/${id}`,
  created: "2026-11-20T10:00:00Z", salary_min: 1800000, salary_max: 2400000, contract_time: null,
  shown_skills: shown, listed_skills: [], missing_skills: missing,
});
const result = (what: string, where: string, page = 1) => ({
  method_version: "jobsearch-v1", provider: "adzuna", country: "in", attribution_url: "https://www.adzuna.in",
  resume_id: "m1", resume_version: 1, query: { what, where }, page, total: 45,
  results: [listing("2", "Backend Engineer", ["Python", "PostgreSQL"], ["AWS"]), listing("1", "Data Analyst", [], ["Tableau"])],
});

describe("Find Jobs", () => {
  it("searches from the master resume and shows evidence and attribution per listing", async () => {
    mockApi([me, on, RESUMES, { path: "/resumes/m1/jobs?page=1", body: result("Senior Software Engineer", "Bengaluru") }]);
    renderApp("/find-jobs");
    expect(await screen.findByRole("heading", { name: /45 openings for “Senior Software Engineer” in Bengaluru/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Job title or keywords")).toHaveValue("Senior Software Engineer");
    const first = screen.getAllByRole("listitem").find((li) => within(li).queryByText("Backend Engineer"))!;
    expect(within(first).getByText("Python")).toBeInTheDocument();
    expect(within(first).getByText("AWS")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Jobs by Adzuna" })).toHaveAttribute("href", "https://www.adzuna.in");
    expect(within(first).getByRole("link", { name: /View posting/ })).toHaveAttribute("target", "_blank");
    expect(within(first).getByText("₹18,00,000–₹24,00,000")).toBeInTheDocument();
  });

  it("runs a changed search with the words in the address", async () => {
    const { calls } = mockApi([
      me, on, RESUMES,
      { path: "/resumes/m1/jobs?page=1", body: result("Senior Software Engineer", "Bengaluru") },
      { path: "/resumes/m1/jobs?page=1&what=data+engineer&where=", body: result("data engineer", "") },
    ]);
    const { router } = renderApp("/find-jobs");
    const box = await screen.findByLabelText("Job title or keywords");
    await screen.findByRole("heading", { name: /45 openings/ });
    await userEvent.clear(box);
    await userEvent.type(box, "data engineer");
    await userEvent.clear(screen.getByLabelText("Location"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: /openings for “data engineer”$/ })).toBeInTheDocument();
    expect(router.state.location.search).toContain("what=data+engineer");
    expect(calls.some((c) => c.path === "/resumes/m1/jobs?page=1&what=data+engineer&where=")).toBe(true);
  });

  it("says when live search is not set up, without searching", async () => {
    const { calls } = mockApi([me, off, RESUMES]);
    renderApp("/find-jobs");
    expect(await screen.findByText("Live job search isn't set up yet")).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("/jobs?"))).toBe(false);
  });
});
