import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";
import { questionThemes } from "./MatchingStories";

const me = { path: "/auth/me", body: SESSION };
const LINE = "Led migration of the reporting pipeline, cutting query latency by 40%.";
const story = {
  id: "77777777-7777-4777-8777-777777777777",
  title: "Led migration of the reporting pipeline",
  situation: "",
  task: "",
  action: LINE,
  result: "cutting query latency by 40%",
  themes: ["leadership", "impact"],
  source_line: LINE,
  source: "Senior Engineer at Acme",
  created_at: "2026-10-20T05:00:00Z",
  updated_at: "2026-10-20T05:00:00Z",
};

describe("questionThemes", () => {
  it("maps behavioral topics and leaves gap questions alone", () => {
    expect(questionThemes({ category: "behavioral", text: "Tell me about a time you disagreed with a teammate." })).toEqual(["conflict", "collaboration"]);
    expect(questionThemes({ category: "behavioral", text: "Describe a project that didn't go as planned." })).toEqual(["failure"]);
    expect(questionThemes({ category: "technical", text: "How would you scale this?" })).toEqual(["technical"]);
    expect(questionThemes({ category: "gap", text: "You haven't used Rust. How would you learn it?" })).toEqual([]);
  });
});

describe("Story Bank", () => {
  it("starts a story from a resume line without inventing the situation or task", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/stories", body: [] },
      {
        path: "/stories/suggestions",
        body: {
          method_version: "stories-v1",
          has_master: true,
          suggestions: [{ entry_id: "e1", source: "Senior Engineer at Acme", line: LINE, title: story.title, result: story.result, themes: ["leadership", "impact"] }],
        },
      },
      { method: "POST", path: "/stories", status: 201, body: story },
    ]);
    renderApp("/stories");
    expect(await screen.findByText("A disagreement you worked through")).toBeInTheDocument(); // empty theme
    await user.click(await screen.findByRole("button", { name: /Start a story/ }));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      title: story.title,
      action: LINE,
      result: story.result,
      themes: ["leadership", "impact"],
      source_line: LINE,
      source: "Senior Engineer at Acme",
    });
  });

  it("edits a story's STAR parts and saves them", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/stories", body: [story] },
      { path: "/stories/suggestions", body: { method_version: "stories-v1", has_master: true, suggestions: [] } },
      { method: "PATCH", path: `/stories/${story.id}`, body: { ...story, situation: "Reports took minutes." } },
    ]);
    renderApp("/stories");
    await user.click(await screen.findByRole("button", { name: /Led migration of the reporting pipeline/ }));
    expect(screen.getByText(/only you can write this/)).toBeInTheDocument();
    expect(screen.getByLabelText("Action")).toHaveValue(LINE);
    await user.type(screen.getByLabelText("Situation"), "Reports took minutes.");
    await user.click(screen.getByRole("button", { name: /Save story/ }));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ situation: "Reports took minutes.", themes: ["leadership", "impact"] });
    const coverage = screen.getByRole("region", { name: "Theme coverage" });
    expect(within(coverage).getByText("Impact").closest("li")).toHaveTextContent("1 story");
  });
});
