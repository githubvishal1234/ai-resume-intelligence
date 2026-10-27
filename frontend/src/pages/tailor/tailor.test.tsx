import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const SID = "55555555-5555-4555-8555-555555555555";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const TAILORED_ID = "66666666-6666-4666-8666-666666666666";
const me = { path: "/auth/me", body: SESSION };

const PREVIEW = {
  contact: { full_name: "Priya Raman", email: "", phone: "", location: "", links: [] },
  summary: "Backend engineer.",
  experience: [],
  education: [],
  skills: [{ id: "s1", name: "Python", category: "" }],
  projects: [],
  certifications: [],
  other: [],
};

const SUMMARY_CHANGE = {
  id: "c2",
  position: 1,
  kind: "summary",
  source: "rules",
  target_id: null,
  title: "Name the job's key skills in your summary",
  reason: "Your roles show FastAPI.",
  original: { text: "Backend engineer." },
  proposed: { text: "Backend engineer. Hands-on experience with FastAPI." },
  edited: null,
  editable: true,
  requirements: [{ id: "r1", text: "Strong experience with FastAPI.", tier: "required" }],
  evidence: [],
  flags: [],
  decision: "pending",
};

const SESSION_BODY = {
  id: SID,
  job_id: JOB_ID,
  job_title: "Backend Engineer",
  job_company: "Acme",
  master_resume_id: RESUME_ID,
  base_version: 1,
  master_current_version: 1,
  status: "draft",
  result_resume_id: null,
  accepted: 0,
  total: 2,
  created_at: "2026-10-12T06:00:00Z",
  method_version: "tailor-rules-v1",
  ai: { configured: false, reason: "LLM_PROVIDER is not set." },
  missing_skills: [] as string[],
  places: [{ id: "e1", label: "Engineer at Acme" }],
  preview: PREVIEW,
  bullets: [] as { experience_id: string; role: string; index: number; text: string; change_id: string | null }[],
  changes: [
    {
      ...SUMMARY_CHANGE,
      id: "c1",
      position: 0,
      kind: "reorder_skills",
      title: "Put the job's skills first in your skills list",
      reason: "The posting asks for Python.",
      original: { items: [{ id: "s2", text: "Go" }, { id: "s1", text: "Python" }] },
      proposed: { items: [{ id: "s1", text: "Python" }, { id: "s2", text: "Go" }] },
      editable: false,
    },
    SUMMARY_CHANGE,
  ],
};

const flagged = {
  status: 422,
  body: {
    code: "FACTUAL_CHECK_FAILED",
    message: "This change mentions facts your master resume does not contain. Edit it to remove them, or reject it.",
    request_id: "r",
    details: [{ field: "edited_text", message: "“Google” does not appear in your master resume." }],
  },
};

describe("Tailoring review", () => {
  it("shows each change with its reason, requirement and before/after", async () => {
    mockApi([me, { path: `/tailoring/${SID}`, body: SESSION_BODY }]);
    renderApp(`/tailor/${SID}`);
    const card = await screen.findByRole("region", { name: /Put the job's skills first/ });
    expect(within(card).getByText("The posting asks for Python.")).toBeInTheDocument();
    expect(within(card).getByText("Proposed order")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: /Name the job's key skills/ });
    expect(within(summary).getByText("Strong experience with FastAPI.")).toBeInTheDocument();
    // AI rewriting is visibly unavailable, with the reason.
    expect(within(summary).getByRole("button", { name: /Rewrite with AI/ })).toHaveAttribute("aria-disabled", "true");
    // Nothing accepted: finishing is blocked with an explanation.
    expect(screen.getByRole("button", { name: /Create tailored resume/ })).toHaveAccessibleName(/Accept at least one change first/);
  });

  it("lets the user confirm a missing skill with where they used it", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...SESSION_BODY,
      missing_skills: ["Spring"],
      changes: [
        ...SESSION_BODY.changes,
        {
          ...SESSION_BODY.changes[0],
          id: "c9",
          kind: "confirm_skill",
          source: "user",
          title: "Add Java, which you confirmed",
          proposed: { items: [{ id: "s9", text: "Java" }], note: "College library project" },
          decision: "accepted",
        },
      ],
    };
    const { calls } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: { ...SESSION_BODY, missing_skills: ["Java", "Spring"] } },
      { method: "POST", path: `/tailoring/${SID}/skills`, body: confirmed },
      { path: "/tailoring", body: [] },
    ]);
    renderApp(`/tailor/${SID}`);
    const card = await screen.findByRole("region", { name: /This job asks for 2 skills your resume doesn't show/ });
    expect(within(card).getByRole("link", { name: "Proof Board" })).toHaveAttribute("href", "/proofs");
    await user.click(within(card).getAllByRole("button", { name: "I've used this" })[0]!);
    expect(within(card).getByLabelText("Where did you use Java?")).toHaveValue("e1");
    await user.selectOptions(within(card).getByLabelText("Where did you use Java?"), "");
    await user.type(within(card).getByLabelText("What did you do with Java?"), "College library project");
    await user.click(within(card).getByRole("button", { name: "Add Java" }));
    expect(await screen.findByRole("region", { name: /Add Java, which you confirmed/ })).toHaveTextContent("Where you used it: College library project");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ skill: "Java", note: "College library project", where: "" });
  });

  it("runs strong focus", async () => {
    const user = userEvent.setup();
    const focused = {
      ...SESSION_BODY,
      changes: [
        ...SESSION_BODY.changes,
        {
          ...SUMMARY_CHANGE,
          id: "c8",
          kind: "headline",
          title: "Add a headline aimed at this job",
          original: { text: "" },
          proposed: { text: "Backend Engineer | Python, SQL" },
        },
      ],
    };
    const { calls } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: SESSION_BODY },
      { method: "POST", path: `/tailoring/${SID}/focus`, body: focused },
      { path: "/tailoring", body: [] },
    ]);
    renderApp(`/tailor/${SID}`);
    await user.click(await screen.findByRole("button", { name: "Focus on this job" }));
    const card = await screen.findByRole("region", { name: /Add a headline aimed at this job/ });
    expect(card).toHaveTextContent("Backend Engineer | Python, SQL");
    expect(screen.getByRole("button", { name: "Focus again" })).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/focus"))).toBe(true);
  });

  it("accepts a change", async () => {
    const user = userEvent.setup();
    const accepted = {
      ...SESSION_BODY,
      accepted: 1,
      changes: [{ ...SESSION_BODY.changes[0], decision: "accepted" }, SUMMARY_CHANGE],
    };
    const { calls } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: SESSION_BODY },
      { method: "POST", path: `/tailoring/${SID}/changes/c1/decision`, body: accepted },
      { path: "/tailoring", body: [] },
    ]);
    renderApp(`/tailor/${SID}`);
    const card = await screen.findByRole("region", { name: /Put the job's skills first/ });
    await user.click(within(card).getByRole("button", { name: "Accept" }));
    expect(await within(card).findByText("Accepted")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ decision: "accepted" });
  });

  it("shows the factual check when an edit adds facts", async () => {
    const user = userEvent.setup();
    const withFlags = {
      ...SESSION_BODY,
      changes: [
        SESSION_BODY.changes[0],
        {
          ...SUMMARY_CHANGE,
          edited: { text: "Engineer at Google." },
          flags: [{ kind: "name", value: "Google", message: "“Google” does not appear in your master resume." }],
        },
      ],
    };
    const { calls, fetchMock } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: SESSION_BODY },
      { method: "POST", path: `/tailoring/${SID}/changes/c2/decision`, ...flagged },
    ]);
    renderApp(`/tailor/${SID}`);
    const summary = await screen.findByRole("region", { name: /Name the job's key skills/ });
    await user.click(within(summary).getByRole("button", { name: "Edit" }));
    const box = within(summary).getByLabelText("Your wording");
    await user.clear(box);
    await user.type(box, "Engineer at Google.");
    // After the refusal the page reloads the session, which now carries the flags.
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, path: url.replace(/^\/api\/v1/, ""), headers: {}, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "POST") return new Response(JSON.stringify(flagged.body), { status: 422, headers: { "content-type": "application/json" } });
      if (url.endsWith(`/tailoring/${SID}`)) return new Response(JSON.stringify(withFlags), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(SESSION), { headers: { "content-type": "application/json" } });
    });
    await user.click(within(summary).getByRole("button", { name: /Save and accept/ }));
    await waitFor(() => expect(within(summary).getByText("Not in your master resume")).toBeInTheDocument());
    expect(within(summary).getByText("“Google” does not appear in your master resume.")).toBeInTheDocument();
    expect(within(summary).queryByText("That didn't work")).not.toBeInTheDocument();
    // The edit box stays open so the text can be fixed in place.
    expect(within(summary).getByLabelText("Your wording")).toHaveValue("Engineer at Google.");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ decision: "accepted", edited_text: "Engineer at Google." });
  });

  it("creates the tailored resume and opens it", async () => {
    const user = userEvent.setup();
    const ready = { ...SESSION_BODY, accepted: 1, changes: [{ ...SESSION_BODY.changes[0], decision: "accepted" }, SUMMARY_CHANGE] };
    const done = { ...ready, status: "finalized", result_resume_id: TAILORED_ID };
    const { calls } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: ready },
      { method: "POST", path: `/tailoring/${SID}/finalize`, body: done },
      { path: "/tailoring", body: [] },
      { path: "/resumes", body: [] },
      {
        path: `/resumes/${TAILORED_ID}`,
        body: { id: TAILORED_ID, kind: "tailored", status: "active", title: "Backend Engineer (Acme)", current_version: 1, master_resume_id: RESUME_ID, created_at: "2026-10-12T06:00:00Z", updated_at: "2026-10-12T06:00:00Z", content: PREVIEW },
      },
    ]);
    renderApp(`/tailor/${SID}`);
    await user.click(await screen.findByRole("button", { name: "Create tailored resume" }));
    expect(await screen.findByRole("heading", { name: "Backend Engineer (Acme)" })).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/finalize"))?.body).toEqual({ title: "Backend Engineer (Acme)" });
  });
});

describe("Claim warnings", () => {
  it("shows AI claim warnings without blocking accept", async () => {
    const warned = {
      ...SESSION_BODY,
      changes: [
        SESSION_BODY.changes[0],
        {
          ...SUMMARY_CHANGE,
          flags: [
            { kind: "claim", value: "Mentored a team", severity: "warn", message: "“Mentored a team” may not be backed by your master resume." },
          ],
        },
      ],
    };
    mockApi([me, { path: `/tailoring/${SID}`, body: warned }]);
    renderApp(`/tailor/${SID}`);
    const summary = await screen.findByRole("region", { name: /Name the job's key skills/ });
    expect(within(summary).getByText("Check these claims")).toBeInTheDocument();
    expect(within(summary).getByText("“Mentored a team” may not be backed by your master resume.")).toBeInTheDocument();
    expect(within(summary).queryByText("Not in your master resume")).not.toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Accept" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("Bullet rewrites", () => {
  const BULLET = { experience_id: "e1", role: "Engineer at Acme", index: 0, text: "Built ETL jobs in Python.", change_id: null };
  const withBullets = { ...SESSION_BODY, bullets: [BULLET] };

  it("is visibly unavailable until AI is set up", async () => {
    mockApi([me, { path: `/tailoring/${SID}`, body: withBullets }]);
    renderApp(`/tailor/${SID}`);
    const card = await screen.findByRole("region", { name: "Reword a bullet with AI" });
    expect(within(card).getByText("AI rewriting is not set up yet")).toBeInTheDocument();
    const button = within(card).getByRole("button", { name: /Rewrite with AI/ });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Built ETL jobs in Python.");
  });

  it("adds the AI wording as a change to review", async () => {
    const user = userEvent.setup();
    const ready = { ...withBullets, ai: { configured: true, reason: null } };
    const rewritten = {
      ...ready,
      bullets: [{ ...BULLET, change_id: "c3" }],
      changes: [
        ...ready.changes,
        {
          ...SUMMARY_CHANGE,
          id: "c3",
          position: 2,
          kind: "rewrite_bullet",
          source: "llm",
          target_id: "e1",
          title: "Reword a bullet at Acme",
          reason: "Rewritten by openai (gpt-test). Check every fact before accepting.",
          original: { text: "Built ETL jobs in Python." },
          proposed: { text: "Built Python ETL jobs for the reporting team." },
          requirements: [],
        },
      ],
    };
    const { calls } = mockApi([
      me,
      { path: `/tailoring/${SID}`, body: ready },
      { method: "POST", path: `/tailoring/${SID}/bullets/rewrite`, body: rewritten },
      { path: "/tailoring", body: [] },
    ]);
    renderApp(`/tailor/${SID}`);
    const card = await screen.findByRole("region", { name: "Reword a bullet with AI" });
    await user.click(within(card).getByRole("button", { name: "Rewrite with AI" }));
    const change = await screen.findByRole("region", { name: /Reword a bullet at Acme/ });
    expect(within(change).getByText("Built Python ETL jobs for the reporting team.")).toBeInTheDocument();
    expect(within(change).getByText("AI rewrite")).toBeInTheDocument();
    expect(within(card).getByText("Reworded as change 2.")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Rewrite again" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ experience_id: "e1", bullet_index: 0 });
  });
});

describe("Tailor index", () => {
  it("starts a session for the chosen job", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/tailoring", body: [] },
      { path: "/jobs", body: [{ id: JOB_ID, source: "paste", title: "Backend Engineer", company: "Acme", location: null, created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z", required_count: 1, skill_count: 1 }] },
      { path: "/resumes", body: [{ id: RESUME_ID, kind: "master", status: "active", title: "Master resume", current_version: 1, master_resume_id: null, created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z" }] },
      { method: "POST", path: "/tailoring", status: 201, body: SESSION_BODY },
      { path: `/tailoring/${SID}`, body: SESSION_BODY },
    ]);
    renderApp("/tailor");
    expect(await screen.findByLabelText("Job")).toHaveValue(JOB_ID);
    await user.click(screen.getByRole("button", { name: /Propose changes/ }));
    expect(await screen.findByRole("heading", { name: "Tailor for Backend Engineer" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ job_id: JOB_ID });
  });
});
