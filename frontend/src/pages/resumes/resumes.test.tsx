import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const IMPORT_ID = "22222222-2222-4222-8222-222222222222";

const CONTENT = {
  contact: { full_name: "Priya Raman", email: "priya@example.com", phone: "", location: "", links: [] },
  summary: "Backend engineer.",
  experience: [
    { id: "e1", title: "Engineer", company: "Acme", location: "", start_date: "Jan 2021", end_date: "Present", current: true, bullets: ["Built APIs."] },
  ],
  education: [],
  skills: [{ id: "s1", name: "Python", category: "" }],
  projects: [],
  certifications: [],
  other: [],
};

const DETAIL = {
  id: RESUME_ID,
  kind: "master",
  status: "active",
  title: "Master resume",
  current_version: 1,
  master_resume_id: null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
  content: CONTENT,
};

const IMPORT = {
  id: IMPORT_ID,
  status: "pending_review",
  filename: "cv.pdf",
  created_at: "2026-10-12T05:00:00Z",
  has_master: false,
  ai_available: false,
  content: CONTENT,
  report: {
    parser_version: "heuristic-v1",
    file_kind: "pdf",
    pages: 1,
    characters: 900,
    truncated: false,
    headings_found: ["EXPERIENCE"],
    sections: [
      { section: "contact", found: true, confidence: "high", notes: [] },
      { section: "experience", found: true, confidence: "low", notes: ["No date ranges were found; check each role's dates."] },
      { section: "education", found: false, confidence: "low", notes: ["Section not found."] },
    ],
    warnings: [],
  },
};

const me = { path: "/auth/me", body: SESSION };

describe("Import review with AI", () => {
  it("re-reads the file with AI, shows what was left out, and can undo", async () => {
    const user = userEvent.setup();
    const available = { ...IMPORT, ai_available: true };
    const improved = {
      ...available,
      content: { ...CONTENT, summary: "Read by the AI." },
      report: {
        ...IMPORT.report,
        ai: { method_version: "resume-ai-v1", provider: "groq", model: "openai/gpt-oss-120b", kept: 14, dropped: ["Skill: “Rust”"] },
      },
    };
    const { calls } = mockApi([
      me,
      { path: `/resumes/imports/${IMPORT_ID}`, body: available },
      { method: "POST", path: `/resumes/imports/${IMPORT_ID}/ai-parse`, body: improved },
      { method: "DELETE", path: `/resumes/imports/${IMPORT_ID}/ai-parse`, body: available },
    ]);
    renderApp(`/resumes/imports/${IMPORT_ID}`);
    await user.click(await screen.findByRole("button", { name: "Improve with AI" }));
    expect(await screen.findByText("Filled in by AI (groq · openai/gpt-oss-120b)")).toBeInTheDocument();
    expect(screen.getByText(/14 values were read and matched to your file. 1 was left out because your file does not contain it/)).toBeInTheDocument();
    expect(screen.getByText("Skill: “Rust”")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Read by the AI.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the original reading" }));
    expect(await screen.findByRole("button", { name: "Improve with AI" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith("/ai-parse")).map((c) => c.method)).toEqual(["POST", "DELETE"]);
  });

  it("does not offer AI when it is not set up", async () => {
    mockApi([me, { path: `/resumes/imports/${IMPORT_ID}`, body: IMPORT }]);
    renderApp(`/resumes/imports/${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Review your resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Improve with AI" })).not.toBeInTheDocument();
  });
});

describe("My Resumes", () => {
  it("offers upload and scratch when there is no master", async () => {
    mockApi([me, { path: "/resumes", body: [] }]);
    renderApp("/resumes");
    expect(await screen.findByText("No master resume yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload resume/ })).toHaveAttribute("href", "/resumes/upload");
    expect(screen.getByRole("link", { name: /Start from scratch/ })).toHaveAttribute("href", "/resumes/new");
  });

  it("shows the master card with its version", async () => {
    const { content: _content, ...summary } = DETAIL;
    mockApi([me, { path: "/resumes", body: [summary] }]);
    renderApp("/resumes");
    expect(await screen.findByRole("heading", { name: "Master resume" })).toBeInTheDocument();
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
  });
});

describe("upload and review", () => {
  it("uploads a file and opens the review screen", async () => {
    const { calls } = mockApi([
      me,
      { method: "POST", path: "/resumes/imports", status: 201, body: IMPORT },
      { path: `/resumes/imports/${IMPORT_ID}`, body: IMPORT },
    ]);
    const { router } = renderApp("/resumes/upload");
    const input = await screen.findByLabelText("Resume file");
    await userEvent.upload(input, new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/resumes/imports/${IMPORT_ID}`));
    const uploadCall = calls.find((c) => c.path === "/resumes/imports" && c.method === "POST");
    expect(uploadCall?.headers["X-CSRF-Token"]).toBe("csrf-abc");
    expect(uploadCall?.headers["Content-Type"]).toBeUndefined(); // multipart boundary set by the browser
    expect(await screen.findByRole("heading", { name: "Review your resume" })).toBeInTheDocument();
    expect(screen.getByText("Low confidence: experience. Please review them carefully.")).toBeInTheDocument();
    expect(screen.getByText(/education\. Add them below/)).toBeInTheDocument();
  });

  it("shows the server's reason when a file is rejected", async () => {
    mockApi([
      me,
      {
        method: "POST",
        path: "/resumes/imports",
        status: 422,
        body: { code: "UPLOAD_REJECTED", message: "Password-protected PDFs are not accepted.", request_id: "r" },
      },
    ]);
    renderApp("/resumes/upload");
    await userEvent.upload(await screen.findByLabelText("Resume file"), new File(["x"], "cv.pdf"));
    expect(await screen.findByText("Password-protected PDFs are not accepted.")).toBeInTheDocument();
  });

  it("saves the reviewed (edited) content as the master resume", async () => {
    const { calls } = mockApi([
      me,
      { path: `/resumes/imports/${IMPORT_ID}`, body: IMPORT },
      { method: "POST", path: `/resumes/imports/${IMPORT_ID}/confirm`, status: 201, body: DETAIL },
      { path: `/resumes/${RESUME_ID}`, body: DETAIL },
    ]);
    const { router } = renderApp(`/resumes/imports/${IMPORT_ID}`);
    const summary = await screen.findByLabelText("Professional summary");
    await userEvent.clear(summary);
    await userEvent.type(summary, "Edited summary.");
    const bullets = screen.getByLabelText("Bullet points");
    await userEvent.type(bullets, "{enter}Cut costs by 20%.");
    await userEvent.click(screen.getByRole("button", { name: "Save as master resume" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/resumes/${RESUME_ID}`));
    const body = calls.find((c) => c.path.endsWith("/confirm"))?.body as { content: typeof CONTENT };
    expect(body.content.summary).toBe("Edited summary.");
    expect(body.content.experience[0]?.bullets).toEqual(["Built APIs.", "Cut costs by 20%."]);
    expect(body.content.experience[0]?.id).toBe("e1"); // stable ids survive editing
  });
});

describe("editing", () => {
  it("saves against the current version and reports conflicts", async () => {
    const { calls } = mockApi([
      me,
      { path: `/resumes/${RESUME_ID}`, body: DETAIL },
      {
        method: "PUT",
        path: `/resumes/${RESUME_ID}/content`,
        status: 409,
        body: { code: "VERSION_CONFLICT", message: "changed", request_id: "r" },
      },
    ]);
    renderApp(`/resumes/${RESUME_ID}/edit`);
    const save = await screen.findByRole("button", { name: /Save new version/ });
    expect(save).toHaveAttribute("aria-disabled", "true"); // nothing changed yet
    const skills = screen.getByRole("textbox", { name: "Skills" });
    await userEvent.type(skills, ", Go");
    await userEvent.click(save);
    expect(await screen.findByText("This resume changed in another tab or device")).toBeInTheDocument();
    const body = calls.find((c) => c.method === "PUT")?.body as { base_version: number; content: typeof CONTENT };
    expect(body.base_version).toBe(1);
    expect(body.content.skills.map((s) => s.name)).toEqual(["Python", "Go"]);
    expect(body.content.skills[0]?.id).toBe("s1");
  });
});

describe("CV quick add", () => {
  it("adds a CV section heading in one click and hides it once present", async () => {
    mockApi([me, { path: `/resumes/${RESUME_ID}`, body: DETAIL }]);
    renderApp(`/resumes/${RESUME_ID}/edit`);
    await userEvent.click(await screen.findByRole("button", { name: "Publications" }));
    expect(screen.getByDisplayValue("Publications")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publications" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Languages" })).toBeInTheDocument();
  });
});

describe("analysis", () => {
  it("groups checks and shows the score with text", async () => {
    mockApi([
      me,
      { path: `/resumes/${RESUME_ID}`, body: DETAIL },
      {
        path: `/resumes/${RESUME_ID}/analysis`,
        body: {
          resume_id: RESUME_ID,
          version: 1,
          score: 72,
          method_version: "rules-v1",
          checks: [
            { id: "contact.email", title: "Email is present", section: "contact", status: "pass", detail: "Found.", weight: 3 },
            { id: "experience.dates", title: "Every role has dates", section: "experience", status: "fail", detail: "1 role has no start date.", weight: 3 },
          ],
        },
      },
    ]);
    renderApp(`/resumes/${RESUME_ID}/analysis`);
    expect(await screen.findByRole("img", { name: "Resume checks: 72 out of 100, Moderate" })).toBeInTheDocument();
    const missing = screen.getByRole("region", { name: "Missing (1)" });
    expect(within(missing).getByText("Every role has dates")).toBeInTheDocument();
  });

  it("/analysis redirects to the master resume's analysis", async () => {
    const { content: _content, ...summary } = DETAIL;
    mockApi([me, { path: "/resumes", body: [summary] }, { path: `/resumes/${RESUME_ID}`, body: DETAIL },
      { path: `/resumes/${RESUME_ID}/analysis`, body: { resume_id: RESUME_ID, version: 1, score: 90, method_version: "rules-v1", checks: [] } }]);
    const { router } = renderApp("/analysis");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/resumes/${RESUME_ID}/analysis`));
  });
});
