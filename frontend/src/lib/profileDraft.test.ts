import { describe, expect, it } from "vitest";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";
import type { ResumeDoc } from "@/services/resumeService";
import { ABOUT_LIMIT, draftProfile, HEADLINE_LIMIT, measuredClause, topSkills } from "./profileDraft";

const tokens = (text: string) => (text.toLowerCase().match(/[a-z0-9%$.+#-]+/g) ?? []).map((w) => w.replace(/[.,:;]+$/, ""));
const words = (doc: ResumeDoc) => new Set(tokens(JSON.stringify(doc)));

describe("draftProfile", () => {
  it("builds headlines and an About section from the resume's own wording", () => {
    const d = draftProfile(SAMPLE_RESUME);
    expect(d.headlines[0]).toBe("Senior Backend Engineer | PostgreSQL · Docker · REST APIs");
    expect(d.headlines[1]).toBe("Senior Backend Engineer at Northwind Retail | Cutting checkout errors by 38%");
    expect(d.about.startsWith(SAMPLE_RESUME.summary)).toBe(true);
    expect(d.about).toContain("As Senior Backend Engineer at Northwind Retail, I led the move of order processing");
    expect(d.about).toContain("Before that: Software Engineer at Contoso Labs.");
    expect(d.about).toContain("Certifications: AWS Certified Developer – Associate.");
    // Nothing invented: every word in the drafts comes from the resume, plus our joining words.
    const allowed = new Set([...words(SAMPLE_RESUME), "as", "i", "and", "at", "before", "that", "skills", "certifications", "highlights", "also"]);
    for (const w of tokens(`${d.headlines.join(" ")} ${d.about}`)) expect(allowed.has(w), w).toBe(true);
  });

  it("ranks skills the experience shows ahead of listed-only ones", () => {
    // The bullets mention PostgreSQL, Docker and REST APIs; the rest are only listed.
    expect(topSkills(SAMPLE_RESUME, 8)).toEqual(["PostgreSQL", "Docker", "REST APIs", "Python", "AWS", "Kafka", "Git", "Unit testing"]);
    expect(topSkills(SAMPLE_RESUME)).toHaveLength(5);
  });

  it("finds a measured outcome, not a count", () => {
    expect(measuredClause("Led the move to events, cutting checkout errors by 38%.")).toBe("cutting checkout errors by 38%");
    expect(measuredClause("Mentored 4 engineers through code reviews.")).toBe("");
  });

  it("stays within LinkedIn's limits and handles an empty resume", () => {
    const long = { ...SAMPLE_RESUME, summary: "word ".repeat(1000) };
    const d = draftProfile(long);
    expect(d.about.length).toBeLessThanOrEqual(ABOUT_LIMIT);
    expect(d.headlines.every((h) => h.length <= HEADLINE_LIMIT)).toBe(true);
    const empty: ResumeDoc = { contact: { full_name: "", headline: "", email: "", phone: "", location: "", links: [] }, summary: "", experience: [], education: [], skills: [], projects: [], certifications: [], other: [], section_order: [] };
    expect(draftProfile(empty)).toEqual({ headlines: [], about: "", skills: [] });
  });
});
