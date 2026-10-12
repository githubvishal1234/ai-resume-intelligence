import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CAPS, mockApi, NOT_AUTHED, renderApp, SESSION } from "@/test/utils";

describe("auth routing", () => {
  it("sends signed-out users to the login page", async () => {
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    const { router } = renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows the dashboard for a signed-in user", async () => {
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/system/capabilities", body: CAPS },
      { path: "/resumes", body: [] },
    ]);
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    expect(await screen.findByText("AI provider")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
  });

  it("redirects signed-in users away from /login", async () => {
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/system/capabilities", body: CAPS },
      { path: "/resumes", body: [] },
    ]);
    const { router } = renderApp("/login");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("shows the not-found page inside the shell", async () => {
    mockApi([{ path: "/auth/me", body: SESSION }]);
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("login", () => {
  it("validates fields before calling the API", async () => {
    const { calls } = mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/auth/login")).toHaveLength(0);
  });

  it("shows the server's generic error on bad credentials", async () => {
    mockApi([
      { path: "/auth/me", ...NOT_AUTHED },
      {
        method: "POST",
        path: "/auth/login",
        status: 401,
        body: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect.", request_id: "r2" },
      },
    ]);
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("signs in and lands on the dashboard", async () => {
    const { calls } = mockApi([
      { path: "/auth/me", ...NOT_AUTHED },
      { method: "POST", path: "/auth/login", body: SESSION },
      { path: "/system/capabilities", body: CAPS },
      { path: "/resumes", body: [] },
    ]);
    const { router } = renderApp("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.find((c) => c.path === "/auth/login")?.body).toEqual({
      email: "ada@example.com",
      password: "correct-horse-battery",
    });
  });
});

describe("register", () => {
  it("rejects mismatched passwords and short passwords client-side", async () => {
    const { calls } = mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    renderApp("/register");
    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/auth/register")).toHaveLength(0);
  });

  it("maps server field errors onto the form", async () => {
    mockApi([
      { path: "/auth/me", ...NOT_AUTHED },
      {
        method: "POST",
        path: "/auth/register",
        status: 409,
        body: { code: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists.", request_id: "r3" },
      },
    ]);
    renderApp("/register");
    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-enough-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
  });
});

describe("logout", () => {
  it("sends the CSRF token and returns to sign-in", async () => {
    const { calls } = mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/system/capabilities", body: CAPS },
      { path: "/resumes", body: [] },
      { method: "POST", path: "/auth/logout", status: 204 },
    ]);
    const { router } = renderApp("/");
    await screen.findByRole("heading", { name: "Welcome, Ada" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(calls.find((c) => c.path === "/auth/logout")?.headers["X-CSRF-Token"]).toBe("csrf-abc");
  });

  it("keeps the user signed in when the server did not end the session", async () => {
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/system/capabilities", body: CAPS },
      { path: "/resumes", body: [] },
      { method: "POST", path: "/auth/logout", status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "x", request_id: "r" } },
    ]);
    const { router } = renderApp("/");
    await screen.findByRole("heading", { name: "Welcome, Ada" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).not.toHaveAttribute("aria-busy"));
    expect(router.state.location.pathname).toBe("/");
  });
});
