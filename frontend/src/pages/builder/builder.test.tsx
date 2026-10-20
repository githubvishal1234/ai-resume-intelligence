import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const MASTER = "11111111-1111-4111-8111-111111111111";
const TAILORED = "66666666-6666-4666-8666-666666666666";
const me = { path: "/auth/me", body: SESSION };
const summary = (id: string, kind: string, title: string) => ({
  id,
  kind,
  status: "active",
  title,
  current_version: 1,
  master_resume_id: kind === "tailored" ? MASTER : null,
  created_at: "2026-10-12T05:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
});
const detail = (id: string, kind: string, title: string) => ({
  ...summary(id, kind, title),
  content: { contact: { full_name: "Priya Raman", email: "priya@example.com" }, summary: "Backend engineer." },
});
const TEMPLATES = [
  { id: "classic", name: "Classic", description: "Ruled headings." },
  { id: "compact", name: "Compact", description: "Tighter spacing." },
];
const report = (template: string, score: number) => ({
  method_version: "ats-rules-v1",
  template,
  pages: 1,
  score,
  extracted_preview: "Priya Raman\nSummary\nBackend engineer.",
  checks: [
    { id: "contact.readable", title: "Name and email can be read", status: "pass", detail: "Both were read back from the PDF." },
    { id: "keywords.required", title: "Job's required skills are present", status: "skip", detail: "Not tailored for a job." },
  ],
});

describe("Resume Builder", () => {
  it("shows the ATS report and a download link for the chosen resume and template", async () => {
    const user = userEvent.setup();
    mockApi([
      me,
      { path: "/resumes", body: [summary(TAILORED, "tailored", "Acme backend"), summary(MASTER, "master", "Master resume")] },
      { path: "/output/templates", body: TEMPLATES },
      { path: `/resumes/${MASTER}`, body: detail(MASTER, "master", "Master resume") },
      { path: `/resumes/${TAILORED}`, body: detail(TAILORED, "tailored", "Acme backend") },
      { path: `/resumes/${MASTER}/ats?template=classic`, body: report("classic", 100) },
      { path: `/resumes/${MASTER}/ats?template=compact`, body: report("compact", 90) },
      { path: `/resumes/${TAILORED}/ats?template=compact`, body: report("compact", 80) },
    ]);
    renderApp("/builder");
    // The master comes first.
    expect(await screen.findByRole("img", { name: /ATS checks: 100 out of 100/ })).toBeInTheDocument();
    expect(screen.getByText("Not checked", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Extracted text")).toHaveTextContent("Priya Raman");
    const download = screen.getByRole("link", { name: /Download PDF/ });
    expect(download).toHaveAttribute("href", `/api/v1/resumes/${MASTER}/export.pdf?template=classic`);
    expect(download).toHaveAttribute("download", "Master-resume.pdf");

    // Each template is previewed with the user's own resume.
    expect(await screen.findByRole("img", { name: "Compact template preview" })).toHaveTextContent("Priya Raman");
    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    expect(await screen.findByRole("img", { name: /ATS checks: 90 out of 100/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Resume"), TAILORED);
    expect(await screen.findByRole("img", { name: /ATS checks: 80 out of 100/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download PDF/ })).toHaveAttribute(
      "href",
      `/api/v1/resumes/${TAILORED}/export.pdf?template=compact`,
    );
  });

  it("asks for a resume when there is none", async () => {
    mockApi([me, { path: "/resumes", body: [] }, { path: "/output/templates", body: TEMPLATES }]);
    renderApp("/builder");
    const empty = await screen.findByText("No resume yet");
    expect(within(empty.parentElement as HTMLElement).getByRole("link", { name: "Upload resume" })).toHaveAttribute("href", "/resumes/upload");
  });
});

describe("CV Builder", () => {
  it("offers only CV templates and lists the CV sections the resume still lacks", { timeout: 20000 }, async () => {
    const withPubs = {
      ...detail(MASTER, "master", "Master resume"),
      content: { ...detail(MASTER, "master", "Master resume").content, other: [{ id: "o1", heading: "Publications", lines: ["A paper"] }] },
    };
    mockApi([
      me,
      { path: "/resumes", body: [summary(MASTER, "master", "Master resume")] },
      { path: "/output/templates", body: [...TEMPLATES, { id: "cv-academic", name: "Academic CV", description: "Education first.", kind: "cv" }] },
      { path: `/resumes/${MASTER}`, body: withPubs },
      { path: `/resumes/${MASTER}/ats?template=cv-academic`, body: report("cv-academic", 100) },
    ]);
    renderApp("/cv-builder");
    expect(await screen.findByRole("heading", { name: "CV Builder" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Download PDF/ })).toHaveAttribute(
      "href",
      `/api/v1/resumes/${MASTER}/export.pdf?template=cv-academic`,
    );
    expect(screen.queryByRole("radio", { name: /Classic/ })).not.toBeInTheDocument();
    const chip = (name: string) => screen.findByText((_, el) => el?.tagName === "LI" && (el.textContent ?? "").startsWith(name));
    expect(await chip("Publications")).toHaveTextContent("(added)");
    expect(await chip("Languages")).toHaveTextContent("(not added)");
  });
});
