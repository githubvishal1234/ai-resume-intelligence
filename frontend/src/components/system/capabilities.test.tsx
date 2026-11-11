import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const me = { path: "/auth/me", body: SESSION };
const caps = (configured: boolean) => ({
  path: "/system/capabilities",
  body: {
    ai: configured
      ? { configured: true, provider: "groq", model: "openai/gpt-oss-120b", reason: null }
      : { configured: false, provider: null, model: null, reason: "LLM_PROVIDER is not set." },
    email: { configured: false },
    storage: { backend: "local" },
  },
});

describe("AI data notice", () => {
  const page = async (configured: boolean) => {
    mockApi([
      me,
      caps(configured),
      { path: "/tailoring", body: [] },
      { path: "/jobs", body: [] },
      { path: "/resumes", body: [] },
    ]);
    renderApp("/tailor");
    await screen.findByText("Step 1: Paste the job and the resume");
  };

  it("names the provider where a resume is pasted", async () => {
    await page(true);
    expect(await screen.findByText("AI features send this text to Groq")).toBeInTheDocument();
    expect(screen.getByText(/get their permission first/)).toBeInTheDocument();
  });

  it("stays hidden while AI is off", async () => {
    await page(false);
    expect(screen.queryByText(/AI features send this text/)).not.toBeInTheDocument();
  });
});

describe("AI and email card", () => {
  it("shows today's AI use when AI is set up", async () => {
    mockApi([
      me,
      caps(true),
      { path: "/ai/usage", body: { used_today: 12, daily_limit: 100, remaining: 88, resets_at: "2026-10-14T00:00:00Z" } },
    ]);
    renderApp("/settings");
    expect(await screen.findByText("12 of 100 AI requests used today · resets at midnight UTC")).toBeInTheDocument();
    expect(screen.getByText(/the text involved is sent to Groq/)).toBeInTheDocument();
    expect(screen.queryByText(/openai\/gpt-oss-120b/)).not.toBeInTheDocument();
  });

  it("does not ask for usage when AI is not set up", async () => {
    const { calls } = mockApi([me, caps(false)]);
    renderApp("/settings");
    expect(await screen.findByText(/AI buttons are switched off/)).toBeInTheDocument();
    expect(screen.queryByText("Your AI use")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/ai/usage")).toBe(false);
  });
});
