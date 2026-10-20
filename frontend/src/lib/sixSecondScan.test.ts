import { describe, expect, it } from "vitest";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";
import type { ResumeDoc } from "@/services/resumeService";
import { scanResume } from "./sixSecondScan";

const byId = (doc: ResumeDoc) => Object.fromEntries(scanResume(doc).checks.map((c) => [c.id, c.ok]));

describe("scanResume", () => {
  it("passes a strong, concise resume", () => {
    const r = scanResume(SAMPLE_RESUME);
    expect(r.score).toBeGreaterThan(60);
    expect(byId(SAMPLE_RESUME)).toMatchObject({ header: true, "latest-role": true });
  });

  it("flags duty openers, missing numbers, a long summary and a weak first bullet", () => {
    const doc: ResumeDoc = {
      ...SAMPLE_RESUME,
      summary: "word ".repeat(80),
      experience: [
        { ...SAMPLE_RESUME.experience[0]!, bullets: ["Responsible for the billing service", "Helped the team ship features"] },
      ],
    };
    const ok = byId(doc);
    expect(ok).toMatchObject({ summary: false, "first-bullet": false, "weak-openers": false, numbers: false });
    const weak = scanResume(doc).checks.find((c) => c.id === "weak-openers")!;
    expect(weak.label).toBe("2 bullets open with a duty, not an outcome");
    expect(weak.detail).toContain("Responsible for the");
    expect(scanResume(doc).score).toBeLessThan(scanResume(SAMPLE_RESUME).score);
  });

  it("handles an empty resume without throwing", () => {
    const empty: ResumeDoc = {
      contact: { full_name: "", email: "", phone: "", location: "", links: [] },
      summary: "",
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      other: [],
    };
    const r = scanResume(empty);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(byId(empty)).toMatchObject({ header: false, "latest-role": false, "first-bullet": false, numbers: false });
  });
});
