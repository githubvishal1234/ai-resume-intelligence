import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";
import { headline } from "./CallbackInsightsPage";

const me = { path: "/auth/me", body: SESSION };
const funnel = (sent: number, responded: number, interviewed = 0) => ({
  sent,
  responded,
  interviewed,
  offers: 0,
  response_rate: sent ? responded / sent : null,
  interview_rate: sent ? interviewed / sent : null,
});
const group = (label: string, f: ReturnType<typeof funnel>, enough = true) => ({ label, funnel: f, enough_data: enough });

describe("headline", () => {
  it("compares the best and worst comparable resume versions", () => {
    expect(headline([group("Tailored · v2", funnel(6, 4)), group("Master · v1", funnel(6, 1))])).toBe(
      "“Tailored · v2” gets replies 4× as often as “Master · v1” (67% vs 17%).",
    );
  });
  it("stays silent when groups are too small or equal", () => {
    expect(headline([group("A", funnel(6, 4)), group("B", funnel(2, 0), false)])).toBeNull();
    expect(headline([group("A", funnel(6, 3)), group("B", funnel(6, 3))])).toBeNull();
  });
  it("handles a version with no replies", () => {
    expect(headline([group("A", funnel(5, 2)), group("B", funnel(5, 0))])).toContain("got none so far");
  });
});

describe("Callback Insights page", () => {
  it("shows the funnel and marks small groups as not ranked", async () => {
    mockApi([
      me,
      {
        path: "/insights/outcomes",
        body: {
          method_version: "outcomes-v1",
          min_sample: 5,
          total: funnel(8, 4, 2),
          by_resume: [group("Tailored · v2", funnel(6, 4, 2)), group("Master · v1", funnel(2, 0), false)],
          by_match: [group("75-100", funnel(8, 4, 2))],
          median_days_to_response: 6,
          unsent: 1,
        },
      },
    ]);
    renderApp("/insights");
    expect(await screen.findByRole("heading", { name: "Callback Insights" })).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("6d")).toBeInTheDocument();
    expect(screen.getByText("Best so far")).toBeInTheDocument();
    expect(screen.getAllByText("Under 5: not ranked")).toHaveLength(1);
  });
});

describe("Proof Board", () => {
  const proof = {
    id: "p1",
    skill: "AWS",
    kind: "project",
    title: "Deploy a small service on AWS",
    plan: "Step one\nStep two",
    status: "done",
    job_id: null,
    created_at: "2026-10-19T00:00:00Z",
    updated_at: "2026-10-19T00:00:00Z",
    evidence_status: "missing",
  };

  it("warns when a done task is not on the resume yet, and adds a gap from the market map", async () => {
    const { calls } = mockApi([
      me,
      { path: "/proofs", body: [proof] },
      {
        path: "/insights/market",
        body: {
          method_version: "market-v1",
          jobs_analyzed: 2,
          has_master: true,
          coverage: 0.5,
          top_gap: null,
          skills: [{ name: "Terraform", category: "tool", jobs: 2, required_in: 1, weight: 5, status: "missing", evidence: null, job_titles: [] }],
        },
      },
      { method: "POST", path: "/proofs", status: 201, body: { ...proof, id: "p2", skill: "Terraform", status: "todo" } },
    ]);
    renderApp("/proofs");
    expect(await screen.findByText("Deploy a small service on AWS")).toBeInTheDocument();
    expect(screen.getByText(/Done, but your resume doesn't show it yet/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Terraform" }));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ skill: "Terraform" });
  });
});
