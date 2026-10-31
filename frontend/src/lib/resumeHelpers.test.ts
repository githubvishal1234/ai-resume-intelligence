import { describe, expect, it } from "vitest";
import { emptyResume, type ResumeDoc } from "@/services/resumeService";
import { bulletTips, completeness, draftSummary, isSectionEmpty, resumeChecklist, SAMPLE_RESUME } from "./resumeHelpers";

const NOW = new Date("2026-10-14T00:00:00Z");

function doc(patch: Partial<ResumeDoc>): ResumeDoc {
  return { ...emptyResume(), ...patch };
}

describe("resume checklist", () => {
  it("starts at zero and reaches 100% for a complete resume", () => {
    expect(completeness(emptyResume())).toBe(0);
    // The sample has no projects: with that section skipped it is complete.
    expect(resumeChecklist(SAMPLE_RESUME, ["projects"]).filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    expect(completeness(SAMPLE_RESUME, ["projects"])).toBe(100);
  });

  it("leaves skipped sections out of the checklist and the score", () => {
    const noProjects = doc({ ...SAMPLE_RESUME });
    expect(resumeChecklist(noProjects).find((c) => c.id === "project")?.ok).toBe(false);
    expect(completeness(noProjects)).toBeLessThan(100);
    expect(resumeChecklist(noProjects, ["projects"]).some((c) => c.step === "projects")).toBe(false);
    expect(completeness(noProjects, ["projects"])).toBe(100);
    expect(isSectionEmpty(noProjects, "projects")).toBe(true);
    const withProject = { name: "Stock Alerts", url: "", description: "", technologies: [], bullets: ["Built alerts."], id: "p1" };
    expect(isSectionEmpty(doc({ projects: [withProject] }), "projects")).toBe(false);
  });

  it("asks for numbers in at least half the bullet points", () => {
    const role = { ...SAMPLE_RESUME.experience[0]!, bullets: ["Built the API.", "Led the team.", "Cut costs by 10%."] };
    const numbers = resumeChecklist(doc({ experience: [role] })).find((c) => c.id === "numbers")!;
    expect(numbers.ok).toBe(false);
    expect(numbers.step).toBe("experience");
  });
});

describe("bullet tips", () => {
  it("flags weak openers and missing numbers, and passes a strong bullet", () => {
    expect(bulletTips("Responsible for the billing system")).toEqual([
      "Start with an action verb, such as “Led” or “Built”.",
      "Add a number if you can: %, time, money, users or team size.",
    ]);
    expect(bulletTips("Reduced billing errors by 30% in two quarters")).toEqual([]);
    expect(bulletTips("   ")).toEqual([]);
  });
});

describe("summary draft", () => {
  it("is built only from the user's own entries", () => {
    const text = draftSummary(SAMPLE_RESUME, NOW);
    expect(text).toBe(
      "Senior Backend Engineer with 7+ years of experience, currently at Northwind Retail. " +
        "Skilled in Python, PostgreSQL, AWS and Docker. Holds a B.Tech in Computer Science from University of Pune.",
    );
    // Every proper noun and number in the draft comes from the resume itself.
    for (const word of ["Northwind Retail", "Python", "PostgreSQL", "B.Tech", "University of Pune"]) {
      expect(JSON.stringify(SAMPLE_RESUME)).toContain(word);
    }
  });

  it("never rounds experience up", () => {
    const role = (start_date: string, end_date: string) => ({ ...SAMPLE_RESUME.experience[1]!, start_date, end_date, current: false });
    const yearsIn = (start: string, end: string) =>
      /with (\d+)\+ years/.exec(draftSummary(doc({ experience: [role(start, end)], skills: SAMPLE_RESUME.skills }), NOW))?.[1] ?? "none";
    expect(yearsIn("Dec 2021", "Jan 2026")).toBe("4"); // 4 years 1 month, not "5+"
    expect(yearsIn("03/2020", "03/2023")).toBe("3");
    expect(yearsIn("2021", "2026")).toBe("4"); // year only: shortest reading, Dec 2021 to Jan 2026
    expect(yearsIn("Jun 2025", "Jan 2026")).toBe("none"); // under a year
  });

  it("leaves out the years when dates can't be read, and returns nothing when there is too little", () => {
    const role = { ...SAMPLE_RESUME.experience[1]!, start_date: "", end_date: "", current: false };
    expect(draftSummary(doc({ experience: [role], skills: SAMPLE_RESUME.skills.slice(0, 2) }), NOW)).toBe(
      "Software Engineer most recently at Contoso Labs. Skilled in Python and PostgreSQL.",
    );
    expect(draftSummary(doc({ experience: [role] }), NOW)).toBe("");
  });
});
