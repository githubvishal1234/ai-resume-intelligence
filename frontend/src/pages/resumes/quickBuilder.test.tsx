import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const me = { path: "/auth/me", body: SESSION };
const TEMPLATES = [
  { id: "classic", name: "Classic", description: "Clean sans-serif." },
  { id: "executive", name: "Executive", description: "Serif, centred name." },
];
const SAVED = {
  id: RESUME_ID,
  kind: "master",
  status: "active",
  title: "My resume",
  current_version: 1,
  master_resume_id: null,
  created_at: "2026-10-14T05:00:00Z",
  updated_at: "2026-10-14T05:00:00Z",
  content: { contact: { full_name: "Ada Lovelace", email: "ada@example.com" }, summary: "" },
};

beforeEach(() => window.localStorage.clear());

describe("Quick Resume Builder", () => {
  it("builds a resume from scratch step by step and saves it with the chosen template", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/resumes", body: [] },
      { path: "/output/templates", body: TEMPLATES },
      { method: "POST", path: "/resumes", body: SAVED },
    ]);
    const { router } = renderApp("/resumes/new");

    // 1. Style
    expect(await screen.findByRole("heading", { name: "Pick a style" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Executive template preview/ }));
    await user.click(screen.getByRole("button", { name: "Next: Contact" }));

    // 2. Contact, with the live preview following along
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    expect(screen.getByRole("img", { name: "Preview in the Executive template" })).toHaveTextContent("Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Next: Experience" }));

    // 3. Experience, with bullet tips
    await user.click(screen.getByRole("button", { name: "Add a role" }));
    await user.type(screen.getByLabelText("Job title"), "Software Engineer");
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.type(screen.getByLabelText("What you achieved"), "Responsible for the API");
    expect(screen.getByText(/Point 1: Start with an action verb/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Built" }));
    expect(screen.getByLabelText("What you achieved")).toHaveValue("Responsible for the API\nBuilt");
    await user.click(screen.getByRole("button", { name: "Next: Education" }));
    await user.click(screen.getByRole("button", { name: "Next: Skills" }));

    // 5. Skills from the suggestions
    await user.click(screen.getByRole("button", { name: "Python" }));
    expect(screen.getByRole("button", { name: "Python" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next: Summary" }));

    // 6. Summary drafted from the user's own entries
    await user.click(screen.getByRole("button", { name: "Draft it from my entries" }));
    expect(screen.getByLabelText("Professional summary")).toHaveValue("Software Engineer most recently at Acme. Skilled in Python.");
    expect(screen.getByText("Drafted only from what you entered")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next: Finish" }));

    // 7. Finish: the checklist points back to what is missing
    expect(screen.getByText(/things? would make it stronger/)).toBeInTheDocument();
    const skillsCheck = screen.getByText("Five or more skills").closest("li") as HTMLElement;
    await user.click(within(skillsCheck).getByRole("button", { name: "Fix" }));
    expect(screen.getByRole("heading", { name: "Your skills" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Finish/ }));
    await user.click(screen.getByRole("button", { name: "Save and get my PDF" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/builder"));
    expect(router.state.location.search).toBe(`?resume=${RESUME_ID}&template=executive`);
    const body = calls.find((c) => c.method === "POST" && c.path === "/resumes")?.body as {
      title: string;
      content: { contact: { full_name: string }; experience: { title: string; bullets: string[] }[]; skills: { name: string }[]; summary: string };
    };
    expect(body.title).toBe("Master resume");
    expect(body.content.contact.full_name).toBe("Ada Lovelace");
    expect(body.content.experience[0]).toMatchObject({ title: "Software Engineer", bullets: ["Responsible for the API", "Built"] });
    expect(body.content.skills.map((s) => s.name)).toEqual(["Python"]);
    // The draft is gone once saved.
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("resume-intel:draft:"))).toEqual([]);
  }, 30_000); // a long, typed walk through all seven steps

  it("keeps an unsaved draft in this browser and brings it back", async () => {
    const user = userEvent.setup();
    mockApi([me, { path: "/resumes", body: [] }, { path: "/output/templates", body: TEMPLATES }]);
    const first = renderApp("/resumes/new");
    await user.click(await screen.findByRole("button", { name: "Next: Contact" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    first.unmount();

    renderApp("/resumes/new");
    expect(await screen.findByLabelText("Full name")).toHaveValue("Ada Lovelace");
  });

  it("edits the existing master and saves a new version", async () => {
    const user = userEvent.setup();
    const { content: _content, ...summary } = SAVED;
    const { calls } = mockApi([
      me,
      { path: "/resumes", body: [summary] },
      { path: `/resumes/${RESUME_ID}`, body: SAVED },
      { path: "/output/templates", body: TEMPLATES },
      { method: "PUT", path: `/resumes/${RESUME_ID}/content`, body: { ...SAVED, current_version: 2 } },
    ]);
    const { router } = renderApp("/resumes/new");
    expect(await screen.findByText(/Editing your master resume \(version 1\)/)).toBeInTheDocument();
    // It opens on the Contact step, prefilled.
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    await user.type(screen.getByLabelText("Phone"), "+44 20 7946 0000");
    await user.click(screen.getByRole("button", { name: /Finish/ }));
    await user.click(screen.getByRole("button", { name: "Save new version and get PDF" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/builder"));
    const put = calls.find((c) => c.method === "PUT")?.body as { base_version: number; content: { contact: { phone: string } } };
    expect(put.base_version).toBe(1);
    expect(put.content.contact.phone).toBe("+44 20 7946 0000");
  });

  it("needs a name before saving", async () => {
    const user = userEvent.setup();
    mockApi([me, { path: "/resumes", body: [] }, { path: "/output/templates", body: TEMPLATES }]);
    renderApp("/resumes/new");
    await user.click(await screen.findByRole("button", { name: /Finish/ }));
    const save = screen.getByRole("button", { name: /Save and get my PDF/ });
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).toHaveAccessibleName(/Add your name in the Contact step first/);
  });
});

describe("Photo templates", () => {
  it("offers a photo upload right where a photo template is chosen", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/resumes", body: [] },
      { path: "/output/templates", body: [...TEMPLATES, { id: "portrait-teal", name: "Portrait · Teal", description: "Photo beside the name." }] },
      { path: "/account/photo", status: 204 },
      { method: "PUT", path: "/account/photo", status: 204 },
    ]);
    renderApp("/resumes/new");
    expect(await screen.findByRole("heading", { name: "Pick a style" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload photo" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Portrait · Teal template preview/ }));
    const panel = screen.getByRole("region", { name: /shows your photo/ });
    expect(panel).toHaveTextContent("Without it, the PDF simply has no photo.");
    const file = new File(["fake"], "me.png", { type: "image/png" });
    const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, file);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/account/photo")).toBe(true));
  });
});
