import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const me = { path: "/auth/me", body: SESSION };
const MASTER = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const LETTER = "33333333-3333-4333-8333-333333333333";
const resume = {
  id: MASTER, kind: "master", status: "active", title: "Master resume", current_version: 1, master_resume_id: null,
  created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z",
};
const letter = {
  id: LETTER, title: "Cover letter: Backend Developer at Kite Health", company: "Kite Health", template: "classic",
  resume_id: MASTER, job_id: JOB, updated_at: "2026-10-19T05:00:00Z", created_at: "2026-10-19T05:00:00Z",
  recipient_name: "", body: "I'm writing to apply.\n\nYou're looking for Kubernetes.", method_version: "letter-v1",
  evidence: [{ requirement: "Kubernetes", excerpt: "Reduced cloud costs by 25% by rightsizing Kubernetes workloads.", source: "Software Engineer at Brightpath Labs" }],
};
const templates = { path: "/output/templates", body: [{ id: "classic", name: "Classic", description: "" }] };

describe("Cover Letter Builder", () => {
  it("drafts a letter for a chosen job and opens the editor with its evidence", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me, templates,
      { path: "/cover-letters", body: [] },
      { path: "/resumes", body: [resume] },
      { path: "/jobs", body: [{ id: JOB, title: "Backend Developer", company: "Kite Health", location: null, source: "paste", created_at: "2026-10-19T05:00:00Z", updated_at: "2026-10-19T05:00:00Z" }] },
      { method: "POST", path: "/cover-letters", status: 201, body: letter },
      { path: `/cover-letters/${LETTER}`, body: letter },
      { path: `/resumes/${MASTER}`, body: { ...resume, content: { contact: { full_name: "Priya Raman", email: "priya@example.com" }, summary: "" } } },
    ]);
    renderApp("/cover-letters");
    await screen.findByRole("option", { name: /Backend Developer/ });
    await user.selectOptions(screen.getByLabelText("Job"), JOB);
    await user.click(screen.getByRole("button", { name: /Draft my cover letter/ }));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ resume_id: MASTER, job_id: JOB, template: "classic" });
    expect(await screen.findByText("“Reduced cloud costs by 25% by rightsizing Kubernetes workloads.”")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Cover letter preview/ })).toHaveTextContent("Dear Hiring Manager,");
  });

  it("saves edits and only offers the PDF once saved", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me, templates,
      { path: `/cover-letters/${LETTER}`, body: letter },
      { path: `/resumes/${MASTER}`, body: { ...resume, content: { contact: { full_name: "Priya Raman" }, summary: "" } } },
      { method: "PATCH", path: `/cover-letters/${LETTER}`, body: { ...letter, recipient_name: "Dana Lee" } },
    ]);
    renderApp(`/cover-letters/${LETTER}`);
    expect(await screen.findByRole("link", { name: /Download PDF/ })).toHaveAttribute("href", `/api/v1/cover-letters/${LETTER}/export.pdf`);
    await user.type(screen.getByLabelText("Hiring manager"), "Dana Lee");
    expect(screen.getByRole("img", { name: /Cover letter preview/ })).toHaveTextContent("Dear Dana Lee,");
    expect(screen.queryByRole("link", { name: /Download PDF/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ recipient_name: "Dana Lee" });
    expect(await screen.findByRole("link", { name: /Download PDF/ })).toBeInTheDocument();
  });

  it("redrafts from the resume after confirming, keeping the user's other fields", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me, templates,
      { path: `/cover-letters/${LETTER}`, body: { ...letter, recipient_name: "Dana Lee" } },
      { path: `/resumes/${MASTER}`, body: { ...resume, content: { contact: { full_name: "Priya Raman" }, summary: "" } } },
      { method: "POST", path: `/cover-letters/${LETTER}/regenerate`, body: { ...letter, recipient_name: "Dana Lee", body: "A fresh draft." } },
    ]);
    renderApp(`/cover-letters/${LETTER}`);
    await user.click(await screen.findByRole("button", { name: /Redraft from my resume/ }));
    expect(calls.some((c) => c.path.endsWith("/regenerate"))).toBe(false); // asks first
    await user.click(screen.getByRole("button", { name: /^Redraft$/ }));
    expect(await screen.findByDisplayValue("A fresh draft.")).toBeInTheDocument();
    expect(screen.getByLabelText("Hiring manager")).toHaveValue("Dana Lee");
  });
});
