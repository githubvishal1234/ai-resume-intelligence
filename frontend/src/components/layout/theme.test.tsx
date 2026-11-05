import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { startTheme } from "@/lib/theme";
import { mockApi, NOT_AUTHED, renderApp, SESSION } from "@/test/utils";

afterEach(() => {
  localStorage.removeItem("theme");
  delete document.documentElement.dataset.theme;
});

describe("Theme", () => {
  it("flips light and dark from the header and remembers the choice", async () => {
    const user = userEvent.setup();
    startTheme();
    expect(document.documentElement.dataset.theme).toBe("light"); // jsdom's "system" is light
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    renderApp("/pricing");
    await user.click(await screen.findByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("offers System, Light and Dark in Settings", async () => {
    const user = userEvent.setup();
    localStorage.setItem("theme", "dark");
    startTheme();
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/account/sessions", body: [] },
    ]);
    renderApp("/settings");
    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
