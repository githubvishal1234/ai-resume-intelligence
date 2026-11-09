import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { normalizeContent } from "@/services/resumeService";
import { SectionOrderEditor } from "./SectionOrderEditor";

const doc = normalizeContent({
  summary: "Engineer.",
  experience: [{ title: "Engineer", start_date: "2019", end_date: "2024" }],
} as never);

describe("SectionOrderEditor", () => {
  it("moves a section and can go back to the suggestion", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SectionOrderEditor doc={doc} onChange={onChange} />);
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector(".flex-1")?.textContent)).toEqual([
      "Summary", "Skills", "Experience", "Projects", "Education", "Certifications",
    ]);
    expect(screen.getByText(/Suggested for this resume/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Move Projects up/ }));
    expect(onChange).toHaveBeenCalledWith(["summary", "skills", "projects", "experience", "education", "certifications"]);
    rerender(<SectionOrderEditor doc={{ ...doc, section_order: ["summary", "projects"] }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Use the suggested order" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
