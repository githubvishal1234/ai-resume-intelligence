import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, NOT_AUTHED, renderApp } from "@/test/utils";

const signedOut = { path: "/auth/me", ...NOT_AUTHED };
const resetOn = { path: "/auth/options", body: { registration: true, password_reset: true } };

describe("password reset", () => {
  it("hides the link when email is not set up", async () => {
    mockApi([signedOut]);
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Forgot your password?" })).not.toBeInTheDocument();
  });

  it("asks for a link and shows the same answer for any address", async () => {
    const { calls } = mockApi([
      signedOut,
      resetOn,
      { method: "POST", path: "/auth/password-reset/request", status: 202, body: {} },
    ]);
    renderApp("/login");
    await userEvent.click(await screen.findByRole("link", { name: "Forgot your password?" }));
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/If an account uses ada@example.com/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ email: "ada@example.com" });
  });

  it("sets a new password from the link", async () => {
    const { calls } = mockApi([
      signedOut,
      { method: "POST", path: "/auth/password-reset/confirm", status: 204 },
    ]);
    renderApp("/reset-password?token=tok123");
    await userEvent.type(await screen.findByLabelText("New password"), "a-brand-new-passphrase");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "a-brand-new-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ token: "tok123", new_password: "a-brand-new-passphrase" });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("explains a used or expired link", async () => {
    mockApi([
      signedOut,
      {
        method: "POST",
        path: "/auth/password-reset/confirm",
        status: 400,
        body: { code: "RESET_LINK_INVALID", message: "This reset link has expired or was already used.", request_id: "r" },
      },
    ]);
    renderApp("/reset-password?token=old");
    await userEvent.type(await screen.findByLabelText("New password"), "a-brand-new-passphrase");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "a-brand-new-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("treats a link without a token as not working", async () => {
    mockApi([signedOut]);
    renderApp("/reset-password");
    expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
  });
});
