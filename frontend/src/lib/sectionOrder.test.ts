import { describe, expect, it } from "vitest";
import { normalizeContent } from "@/services/resumeService";
import { FRESHER_ORDER, sectionOrder, STUDENT_ORDER, suggestedOrder } from "./sectionOrder";

const NOW = new Date(2026, 10, 9);
// The same cases as backend/tests/test_section_order.py: both sides must agree.
const resume = (roles: [string, string][], projects = 1, education = true) =>
  normalizeContent({
    summary: "Engineer.",
    experience: roles.map(([start_date, end_date]) => ({ title: "Engineer", start_date, end_date })),
    projects: Array.from({ length: projects }, (_, i) => ({ name: `P${i}` })),
    education: education ? [{ institution: "Andhra University" }] : [],
  } as never);

describe("suggestedOrder", () => {
  it("follows the experience, as the PDF does", () => {
    expect(suggestedOrder(resume([["Jan 2026", "Present"]]), NOW)).toEqual(FRESHER_ORDER);
    expect(suggestedOrder(resume([["Nov 2025", "Present"]]), NOW)).toEqual([]);
    expect(suggestedOrder(resume([["2019", "2024"]]), NOW)).toEqual([]);
    expect(suggestedOrder(resume([["Jan 2026", "Present"]], 0), NOW)).toEqual([]);
    expect(suggestedOrder(resume([]), NOW)).toEqual(STUDENT_ORDER);
    expect(suggestedOrder(resume([], 1, false), NOW)).toEqual([]);
    expect(suggestedOrder(resume([["", ""]]), NOW)).toEqual([]);
  });

  it("lets a saved order win and leaves CVs alone", () => {
    const doc = { ...resume([["Jan 2026", "Present"]]), section_order: ["summary", "experience"] as never };
    expect(sectionOrder(doc)).toEqual(["summary", "experience"]);
    expect(sectionOrder(resume([]), "cv")).toEqual([]);
  });
});
