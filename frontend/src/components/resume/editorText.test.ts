import { describe, expect, it } from "vitest";
import { linesToList, skillsToText, textToSkills } from "./editorText";

describe("editor text helpers", () => {
  it("splits lines and drops blanks", () => {
    expect(linesToList(" a \n\n b\n")).toEqual(["a", "b"]);
  });

  it("round-trips grouped skills and keeps ids of unchanged skills", () => {
    const skills = [
      { id: "s1", name: "Python", category: "Languages" },
      { id: "s2", name: "Go", category: "Languages" },
      { id: "s3", name: "Docker", category: "" },
    ];
    const text = skillsToText(skills);
    expect(text).toBe("Languages: Python, Go\nDocker");
    const parsed = textToSkills(`${text}, Kubernetes\nLanguages: python`, skills);
    expect(parsed.map((s) => [s.name, s.category])).toEqual([
      ["Python", "Languages"],
      ["Go", "Languages"],
      ["Docker", ""],
      ["Kubernetes", ""],
    ]);
    expect(parsed[0]?.id).toBe("s1");
    expect(parsed[3]?.id).not.toBe("s1");
  });

  it("merges bullets pasted from a PDF, where long ones wrap onto unmarked lines", () => {
    const pasted = "• Developed an HRMS chatbot to handle HR\nqueries for employees.\n• Built REST APIs.\n- Wrote tests";
    expect(linesToList(pasted)).toEqual([
      "Developed an HRMS chatbot to handle HR queries for employees.",
      "Built REST APIs.",
      "Wrote tests",
    ]);
    expect(linesToList("linkedin.com/in/a\ngithub.com/a")).toEqual(["linkedin.com/in/a", "github.com/a"]);
  });
});
