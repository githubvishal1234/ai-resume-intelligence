import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, NOT_AUTHED, renderApp, SESSION } from "@/test/utils";

describe("Landing page", () => {
  it("is what a signed-out visitor sees at the site root", async () => {
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: /Build a resume that gets read/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/welcome");
    // A showcase of templates with the sample resume, and a link to the full gallery.
    for (const name of ["Classic", "Banner · Forest", "Executive", "Stripe · Charcoal", "Elegant · Teal", "Statement · Navy"]) {
      expect(screen.getByRole("img", { name: `Sample resume in the ${name} template` })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Browse all templates/ })).toHaveAttribute("href", "/templates");
    for (const link of screen.getAllByRole("link", { name: /Build my resume/ })) expect(link).toHaveAttribute("href", "/register");
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login");
  });

  it("offers the dashboard and the builder to a signed-in user", async () => {
    mockApi([{ path: "/auth/me", body: SESSION }]);
    renderApp("/welcome");
    expect(await screen.findByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: /Build my resume/ })[0]).toHaveAttribute("href", "/resumes/new");
  });

  it("still sends deep links to sign-in", async () => {
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    const { router } = renderApp("/jobs");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });
});
