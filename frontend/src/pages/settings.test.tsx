import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { describeBrowser } from "@/pages/SettingsPage";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const me = { path: "/auth/me", body: SESSION };
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SIGN_INS = [
  { id: "s1", user_agent: CHROME, created_at: "2026-10-12T05:00:00Z", last_seen_at: "2026-10-13T05:00:00Z", current: true },
  { id: "s2", user_agent: IPHONE, created_at: "2026-10-10T05:00:00Z", last_seen_at: "2026-10-11T05:00:00Z", current: false },
];
const signIns = { path: "/account/sign-ins", body: SIGN_INS };

describe("Settings", () => {
  it("names browsers from their user agent", () => {
    expect(describeBrowser(CHROME)).toBe("Chrome on Windows");
    expect(describeBrowser(IPHONE)).toBe("Safari on iOS");
    expect(describeBrowser(null)).toBe("Unknown browser");
  });

  it("saves a new name", async () => {
    const { calls } = mockApi([
      me,
      signIns,
      { method: "PATCH", path: "/account", body: { ...SESSION.user, display_name: "Ada King" } },
    ]);
    renderApp("/settings");
    const name = await screen.findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Ada King");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ display_name: "Ada King" });
  });

  it("changes the password and shows a wrong current password on its field", async () => {
    const { calls, routes } = mockApi([
      me,
      signIns,
      {
        method: "POST",
        path: "/account/password",
        status: 422,
        body: { code: "WRONG_PASSWORD", message: "That password is not correct.", request_id: "r", details: [{ field: "current_password", message: "That password is not correct." }] },
      },
    ]);
    renderApp("/settings");
    await userEvent.type(await screen.findByLabelText("Current password"), "wrong-one");
    await userEvent.type(screen.getByLabelText("New password"), "another-long-passphrase");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "another-long-passphras");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/account/password")).toBe(false);

    await userEvent.type(screen.getByLabelText("Repeat new password"), "e");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("That password is not correct.")).toBeInTheDocument();

    routes.unshift({ method: "POST", path: "/account/password", body: { revoked: 1 } });
    await userEvent.clear(screen.getByLabelText("Current password"));
    await userEvent.type(screen.getByLabelText("Current password"), "right-one");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("1 other browser was signed out.")).toBeInTheDocument();
  });

  it("lists sign-ins and signs one out", async () => {
    const { calls } = mockApi([
      me,
      signIns,
      { method: "DELETE", path: "/account/sign-ins/s2", status: 204 },
    ]);
    renderApp("/settings");
    expect(await screen.findByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText("This browser")).toBeInTheDocument();
    expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Where you're signed in" });
    expect(within(card).getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    await userEvent.click(within(card).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(screen.getByRole("button", { name: "Sign out all other browsers" })).toBeInTheDocument();
  });

  it("deletes the account after the password is entered and goes to sign in", async () => {
    const { calls } = mockApi([me, signIns, { method: "POST", path: "/account/delete", status: 204 }]);
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByText("Enter your password.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Enter your password to confirm"), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/account/delete")?.body).toEqual({ password: "correct-horse" });
  });
});
