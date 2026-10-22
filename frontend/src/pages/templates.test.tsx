import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEMPLATE_STYLES } from "@/constants/templates";
import { mockApi, NOT_AUTHED, renderApp } from "@/test/utils";

describe("Template gallery", () => {
  it("filters templates and links each into the builder", async () => {
    const user = userEvent.setup();
    mockApi([{ path: "/auth/me", ...NOT_AUTHED }]);
    renderApp("/templates");
    const resumes = TEMPLATE_STYLES.filter((t) => t.kind === "resume").length;
    expect(await screen.findByText(/Showing/)).toHaveTextContent(`Showing ${resumes} of ${resumes}`);

    await user.click(screen.getByRole("radio", { name: "Teal" }));
    await user.click(within(screen.getByRole("group", { name: "Header" })).getByRole("radio", { name: "Colour band" }));
    expect(screen.getByText(/Showing/)).toHaveTextContent(`Showing 2 of ${resumes}`); // Banner and Statement
    expect(screen.getByRole("link", { name: /Use this template: Banner · Teal/ })).toHaveAttribute("href", "/resumes/new?template=banner-teal");

    await user.click(within(screen.getByRole("group", { name: "Font" })).getByRole("radio", { name: "Serif" }));
    expect(screen.getAllByRole("link", { name: /Use this template/ })).toHaveLength(1);

    await user.click(screen.getByRole("radio", { name: "CVs" }));
    expect(screen.getByRole("link", { name: /Academic CV/ })).toHaveAttribute("href", "/cv-builder?template=cv-academic");
  });
});
