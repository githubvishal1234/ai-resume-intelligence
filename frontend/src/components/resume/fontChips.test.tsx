import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";
import { fontFamily } from "./resumeFonts";

const FONTS = [
  { id: "Inter", name: "Inter", style: "sans" },
  { id: "EBGaramond", name: "EB Garamond", style: "serif" },
];

describe("fontFamily", () => {
  it("names the bundled font and ignores anything else", () => {
    expect(fontFamily("Inter")).toBe('"Resume Inter"');
    expect(fontFamily("")).toBeNull();
    expect(fontFamily("x) url(evil")).toBeNull();
  });
});

describe("Font choice in the template gallery", () => {
  it("sends the chosen font to the previews, the ATS check and the download", async () => {
    const user = userEvent.setup();
    const resume = { id: "r1", kind: "master", status: "active", title: "Master", current_version: 1 };
    const { calls } = mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/resumes", body: [resume] },
      { path: "/output/templates", body: [{ id: "classic", name: "Classic", description: "d", kind: "resume" }] },
      { path: "/output/fonts", body: FONTS },
      { path: "/resumes/r1", body: { ...resume, content: { summary: "" } } },
      { path: "/resumes/r1/ats?template=classic", body: { score: 90, checks: [], template: "classic" } },
      { path: "/resumes/r1/ats?template=classic&font=EBGaramond", body: { score: 90, checks: [], template: "classic" } },
    ]);
    renderApp("/builder?resume=r1");
    // The font row sits in the template gallery, next to the template filters.
    expect(await screen.findByRole("radio", { name: "Template font" })).toBeChecked();
    await user.click(await screen.findByRole("radio", { name: "EB Garamond" }));
    expect(screen.getByRole("link", { name: /Download PDF/ })).toHaveAttribute(
      "href",
      expect.stringContaining("template=classic&font=EBGaramond"),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/resumes/r1/ats?template=classic&font=EBGaramond")).toBe(true),
    );
  });
});

describe("Skills table choice", () => {
  it("draws the skills as a table in the preview and asks the PDF for one", async () => {
    const user = userEvent.setup();
    const resume = { id: "r1", kind: "master", status: "active", title: "Master", current_version: 1 };
    const content = { summary: "", skills: [{ name: "Python", category: "Programming" }, { name: "SQL", category: "Programming" }] };
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/resumes", body: [resume] },
      { path: "/output/templates", body: [{ id: "classic", name: "Classic", description: "d", kind: "resume" }] },
      { path: "/output/fonts", body: FONTS },
      { path: "/resumes/r1", body: { ...resume, content } },
      { path: "/resumes/r1/ats?template=classic", body: { score: 90, checks: [], template: "classic" } },
      { path: "/resumes/r1/ats?template=classic&skills=table", body: { score: 90, checks: [], template: "classic" } },
    ]);
    renderApp("/builder?resume=r1");
    await user.click(await screen.findByRole("radio", { name: "Table" }));
    expect(screen.getByRole("link", { name: /Download PDF/ })).toHaveAttribute("href", expect.stringContaining("skills=table"));
    const cells = await screen.findAllByRole("cell", { name: "Python, SQL" });
    expect(cells.length).toBeGreaterThan(0);
  });
});
