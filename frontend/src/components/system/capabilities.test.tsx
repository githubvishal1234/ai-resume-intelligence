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

describe("System status", () => {
  it("shows today's AI use when AI is set up", async () => {
    mockApi([
      me,
      caps(true),
      { path: "/ai/usage", body: { used_today: 12, daily_limit: 100, remaining: 88, resets_at: "2026-10-14T00:00:00Z" } },
    ]);
    renderApp("/settings");
    expect(await screen.findByText("12 of 100 AI requests used today · resets at midnight UTC")).toBeInTheDocument();
    expect(screen.getByText("groq · openai/gpt-oss-120b")).toBeInTheDocument();
  });

  it("does not ask for usage when AI is not set up", async () => {
    const { calls } = mockApi([me, caps(false)]);
    renderApp("/settings");
    expect(await screen.findByText(/AI-assisted features stay disabled/)).toBeInTheDocument();
    expect(screen.queryByText("Your AI use")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/ai/usage")).toBe(false);
  });
});
