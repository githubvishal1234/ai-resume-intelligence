import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeContent } from "@/services/resumeService";
import type { Session, TailoringChange } from "@/services/tailoringService";
import { AgentStage } from "./AgentStage";
import { agentEdits, removedSkills } from "./agentEdits";

const doc = normalizeContent({
  contact: { full_name: "Asha Rao", headline: "Developer" },
  summary: "Builds web apps.",
  skills: [{ name: "Angular" }, { name: "Photoshop" }],
  experience: [{ title: "Developer", company: "Acme", bullets: ["Made APIs."] }],
} as never);

const change = (kind: string, fields: Partial<TailoringChange>) =>
  ({ kind, decision: "accepted", flags: [], original: {}, proposed: {}, edited: null, ...fields }) as TailoringChange;

const session = (changes: TailoringChange[]) => ({ id: "s1", changes, preview: doc }) as unknown as Session;

const done = session([
  change("rewrite_bullet", { original: { text: "Made APIs." }, proposed: { text: "Designed REST APIs." } }),
  change("rewrite_bullet", { original: { text: "Old." }, proposed: { text: "Claimed more." }, flags: [{ kind: "claim", value: "x", message: "m", severity: "warn" }] }),
  change("rewrite_bullet", { original: { text: "Dropped." }, proposed: { text: "Not used." }, decision: "rejected" }),
  change("headline", { original: { text: "Developer" }, proposed: { text: "Full stack developer" } }),
  change("trim_skills", {
    original: { items: [{ id: "1", text: "Angular" }, { id: "2", text: "Photoshop" }] },
    proposed: { items: [{ id: "1", text: "Angular" }] },
  }),
]);

afterEach(() => vi.unstubAllGlobals());

describe("agent edits", () => {
  it("shows only real, kept rewrites, headline first, and marks what needs review", () => {
    expect(agentEdits(done)).toEqual([
      { kind: "headline", from: "Developer", to: "Full stack developer", flagged: false },
      { kind: "bullet", from: "Made APIs.", to: "Designed REST APIs.", flagged: false },
      { kind: "bullet", from: "Old.", to: "Claimed more.", flagged: true },
    ]);
  });

  it("prefers the wording the user edited", () => {
    const edited = change("summary", { original: { text: "A" }, proposed: { text: "B" }, edited: { text: "C" } });
    expect(agentEdits(session([edited]))[0]?.to).toBe("C");
  });

  it("names the skills a trim takes out", () => {
    expect(removedSkills(done)).toEqual(["Photoshop"]);
  });
});

describe("AgentStage", () => {
  it("is the plain progress panel with reduced motion, and moves on when the work ends", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const finish = vi.fn();
    const { rerender } = render(<AgentStage before={doc} session={null} onFinish={finish} />);
    expect(screen.getByText("Tailoring with maximum focus")).toBeInTheDocument();
    expect(finish).not.toHaveBeenCalled();
    rerender(<AgentStage before={doc} session={done} onFinish={finish} />);
    await waitFor(() => expect(finish).toHaveBeenCalledOnce());
  });

  it("works over the real resume and offers a way past the animation once it's done", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const user = userEvent.setup();
    const finish = vi.fn();
    const { rerender, container } = render(<AgentStage before={doc} session={null} onFinish={finish} />);
    expect(container.textContent).toContain("Asha Rao");
    expect(screen.queryByRole("button", { name: "See my changes" })).not.toBeInTheDocument();
    expect(await screen.findByText("Reader is reading your resume")).toBeInTheDocument();
    rerender(<AgentStage before={doc} session={done} onFinish={finish} />);
    await user.click(screen.getByRole("button", { name: "See my changes" }));
    expect(finish).toHaveBeenCalled();
  });
});
