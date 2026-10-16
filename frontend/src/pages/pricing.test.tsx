import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, NOT_AUTHED, renderApp, SESSION } from "@/test/utils";

const plan = (name: string) => screen.getByRole("article", { name }) as HTMLElement;

describe("Pricing", () => {
  it("shows Free and Pro with monthly and yearly prices", async () => {
    const user = userEvent.setup();
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    renderApp("/pricing");
    expect(await screen.findByRole("heading", { level: 1, name: "Simple pricing" })).toBeInTheDocument();
    expect(within(plan("Free")).getByText("₹0")).toBeInTheDocument();
    expect(within(plan("Free")).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/register");
    expect(within(plan("Pro")).getByText("₹299")).toBeInTheDocument();
    expect(within(plan("Pro")).getByText("per month")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Yearly · save 30%" }));
    expect(screen.getByRole("radio", { name: "Yearly · save 30%" })).toHaveAttribute("aria-checked", "true");
    expect(within(plan("Pro")).getByText("₹2,499")).toBeInTheDocument();
    expect(within(plan("Pro")).getByText("per year")).toBeInTheDocument();
    expect(within(plan("Pro")).getByRole("link", { name: "Join the Pro waitlist" })).toHaveAttribute("href", "/register?plan=pro");
  });

  it("sends a new Pro sign-up back to pricing to confirm", async () => {
    const user = userEvent.setup();
    mockApi([
      { path: "/auth/me", ...NOT_AUTHED },
      { method: "POST", path: "/auth/register", status: 201, body: SESSION },
      { path: "/account/pro-waitlist", body: { joined: false, joined_at: null } },
    ]);
    const { router } = renderApp("/register?plan=pro");
    expect(await screen.findByText("Joining the Pro waitlist")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
    await user.type(screen.getByLabelText("Confirm password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pricing"));
    expect(router.state.location.search).toBe("?join=pro");
    expect(await screen.findByText("Your free account is ready")).toBeInTheDocument();
  }, 20_000); // types a whole registration form

  it("joins the waitlist once signed in, with the CSRF token", async () => {
    const user = userEvent.setup();
    const joined = { joined: true, joined_at: "2026-10-14T09:00:00Z" };
    const { calls } = mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/account/pro-waitlist", body: { joined: false, joined_at: null } },
      { method: "POST", path: "/account/pro-waitlist", body: joined },
    ]);
    renderApp("/pricing");
    const free = await screen.findByRole("article", { name: "Free" });
    expect(await within(free).findByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/");
    await user.click(await within(plan("Pro")).findByRole("button", { name: "Join the Pro waitlist" }));
    expect(await screen.findByText("You're on the Pro waitlist")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path === "/account/pro-waitlist")?.headers["X-CSRF-Token"]).toBe("csrf-abc");
  });

  it("shows who is already on the list", async () => {
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/account/pro-waitlist", body: { joined: true, joined_at: "2026-10-01T09:00:00Z" } },
    ]);
    renderApp("/pricing");
    expect(await screen.findByText("You're on the Pro waitlist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join the Pro waitlist" })).not.toBeInTheDocument();
  });
});
