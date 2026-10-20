import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const MASTER = "11111111-1111-4111-8111-111111111111";
const summary = { id: MASTER, kind: "master", status: "active", title: "Master resume", current_version: 1, master_resume_id: null, created_at: "2026-10-20T05:00:00Z", updated_at: "2026-10-20T05:00:00Z" };

describe("Profile Builder", () => {
  it("drafts headlines from the resume, previews the choice and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/resumes", body: [summary] },
      { path: `/resumes/${MASTER}`, body: { ...summary, content: SAMPLE_RESUME } },
    ]);
    renderApp("/profile-builder");
    const second = await screen.findByRole("radio", { name: /at Northwind Retail \| Cutting checkout errors by 38%/ });
    const preview = screen.getByRole("region", { name: "Profile preview" });
    expect(preview).toHaveTextContent("Aarav Mehta");
    expect(preview).toHaveTextContent("Senior Backend Engineer | PostgreSQL · Docker · REST APIs");

    await user.click(second);
    expect(screen.getByLabelText("Your headline")).toHaveValue("Senior Backend Engineer at Northwind Retail | Cutting checkout errors by 38%");
    expect(within(preview).getByText(/Cutting checkout errors by 38%/)).toBeInTheDocument();
    expect(screen.getByText(`${"Senior Backend Engineer at Northwind Retail | Cutting checkout errors by 38%".length}/220`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy headline" }));
    expect(writeText).toHaveBeenCalledWith("Senior Backend Engineer at Northwind Retail | Cutting checkout errors by 38%");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("asks for a resume when there is none", async () => {
    mockApi([{ path: "/auth/me", body: SESSION }, { path: "/resumes", body: [] }]);
    renderApp("/profile-builder");
    expect(await screen.findByText("Add your master resume first")).toBeInTheDocument();
  });
});
