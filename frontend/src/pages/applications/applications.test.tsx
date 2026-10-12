import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const APP_ID = "77777777-7777-4777-8777-777777777777";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const me = { path: "/auth/me", body: SESSION };

const SUMMARY = {
  id: APP_ID,
  company: "Acme",
  role: "Senior Backend Engineer",
  url: null,
  status: "applied",
  job_id: JOB_ID,
  job_title: "Senior Backend Engineer",
  resume_id: RESUME_ID,
  resume_title: "Master resume",
  resume_version: 2,
  applied_on: "2026-10-01",
  follow_up_on: "2026-10-10",
  follow_up_due: true,
  created_at: "2026-10-01T05:00:00Z",
  updated_at: "2026-10-01T05:00:00Z",
};
const DETAIL = {
  ...SUMMARY,
  notes: "Referred by Sam.",
  events: [
    { id: "e2", kind: "status", from_status: "saved", to_status: "applied", fields: [], note: null, created_at: "2026-10-01T06:00:00Z" },
    { id: "e1", kind: "created", from_status: null, to_status: "saved", fields: [], note: null, created_at: "2026-10-01T05:00:00Z" },
  ],
};
const CLOSED = { ...SUMMARY, id: "88888888-8888-4888-8888-888888888888", company: "Globex", status: "rejected", follow_up_due: false };
const JOB = {
  id: JOB_ID,
  source: "paste",
  title: "Platform Engineer",
  company: "Initech",
  location: null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
  required_count: 1,
  skill_count: 1,
};
const RESUME = {
  id: RESUME_ID,
  kind: "master",
  status: "active",
  title: "Master resume",
  current_version: 3,
  master_resume_id: null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
};

describe("Applications", () => {
  it("lists open applications by default and filters by status", async () => {
    mockApi([me, { path: "/applications", body: [SUMMARY, CLOSED] }]);
    renderApp("/applications");
    expect(await screen.findByRole("link", { name: "Senior Backend Engineer" })).toHaveAttribute("href", `/applications/${APP_ID}`);
    expect(screen.getByText("Follow up due")).toBeInTheDocument();
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Rejected/ }));
    expect(await screen.findByText("Globex")).toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Applications/ })[0]).toHaveAttribute("href", "/applications");
  });

  it("creates an application prefilled from a job, with the resume's current version", async () => {
    const { calls } = mockApi([
      me,
      { path: "/jobs", body: [JOB] },
      { path: "/resumes", body: [RESUME] },
      { method: "POST", path: "/applications", status: 201, body: DETAIL },
      { path: `/applications/${APP_ID}`, body: DETAIL },
    ]);
    renderApp("/applications/new");
    const job = await screen.findByLabelText("Saved job (optional)");
    await screen.findByRole("option", { name: /Platform Engineer · Initech/ });
    await userEvent.selectOptions(job, JOB_ID);
    expect(screen.getByLabelText("Company")).toHaveValue("Initech");
    expect(screen.getByLabelText("Role")).toHaveValue("Platform Engineer");
    await screen.findByRole("option", { name: "Master: Master resume" });
    await userEvent.selectOptions(screen.getByLabelText("Resume sent (optional)"), RESUME_ID);
    expect(screen.getByLabelText("Version")).toHaveValue("3");
    await userEvent.type(screen.getByLabelText("Posting link (optional)"), "not a link");
    await userEvent.click(screen.getByRole("button", { name: "Save application" }));
    expect(await screen.findByText(/starts with http/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Posting link (optional)"));
    await userEvent.click(screen.getByRole("button", { name: "Save application" }));
    expect(await screen.findByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.path === "/applications");
    expect(post?.body).toMatchObject({
      job_id: JOB_ID,
      company: "Initech",
      role: "Platform Engineer",
      resume_id: RESUME_ID,
      resume_version: 3,
      url: null,
      status: "saved",
    });
  });

  it("prefills company and role when opened from a job", async () => {
    mockApi([me, { path: "/jobs", body: [JOB] }, { path: "/resumes", body: [RESUME] }]);
    renderApp(`/applications/new?job=${JOB_ID}`);
    expect(await screen.findByLabelText("Company")).toHaveValue("Initech");
    expect(screen.getByLabelText("Role")).toHaveValue("Platform Engineer");
    expect(screen.getByLabelText("Saved job (optional)")).toHaveValue(JOB_ID);
  });

  it("shows the history, changes status and adds notes", async () => {
    const noted = {
      ...DETAIL,
      events: [{ id: "e3", kind: "note", from_status: null, to_status: null, fields: [], note: "Recruiter called", created_at: "2026-10-02T05:00:00Z" }, ...DETAIL.events],
    };
    const { calls } = mockApi([
      me,
      { path: `/applications/${APP_ID}`, body: DETAIL },
      { method: "PATCH", path: `/applications/${APP_ID}`, body: { ...DETAIL, status: "interviewing" } },
      { method: "POST", path: `/applications/${APP_ID}/notes`, body: noted },
    ]);
    renderApp(`/applications/${APP_ID}`);
    expect(await screen.findByText("Follow-up due")).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "History" });
    expect(within(history).getByText("Saved → Applied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Master resume · version 2/ })).toHaveAttribute("href", `/resumes/${RESUME_ID}/versions`);
    await userEvent.selectOptions(screen.getByLabelText("Change status"), "interviewing");
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "interviewing" });
    await userEvent.type(screen.getByLabelText("Add a note"), "Recruiter called");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await within(history).findByText("Recruiter called")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a note")).toHaveValue("");
  });
});

describe("Notifications", () => {
  const NOTE = {
    id: "n1",
    kind: "follow_up_due",
    title: "Follow up with Acme",
    body: "You planned to follow up on your Senior Backend Engineer application on 10 Oct 2026.",
    link: `/applications/${APP_ID}`,
    read_at: null,
    created_at: "2026-10-12T05:00:00Z",
  };

  it("shows the unread count in the header and marks reminders as read", async () => {
    const { calls } = mockApi([
      me,
      { path: "/notifications/unread-count", body: { unread: 1 } },
      { path: "/notifications", body: [NOTE] },
      { method: "POST", path: "/notifications/read-all", status: 204 },
    ]);
    renderApp("/notifications");
    expect(await screen.findByRole("link", { name: "Notifications, 1 unread" })).toHaveAttribute("href", "/notifications");
    expect(await screen.findByRole("link", { name: "Follow up with Acme" })).toHaveAttribute("href", `/applications/${APP_ID}`);
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/notifications/read-all")).toBe(true));
  });
});
