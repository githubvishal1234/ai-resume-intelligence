import { newId, type Skill } from "@/services/resumeService";

/** One item per non-empty line. */
export function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function listToLines(items: string[]): string {
  return items.join("\n");
}

/** Skills edit as lines of "Category: a, b, c" (category optional), grouped in order. */
export function skillsToText(skills: Skill[]): string {
  const groups: { category: string; names: string[] }[] = [];
  for (const skill of skills) {
    const group = groups.find((g) => g.category === skill.category);
    if (group) group.names.push(skill.name);
    else groups.push({ category: skill.category, names: [skill.name] });
  }
  return groups.map((g) => (g.category ? `${g.category}: ${g.names.join(", ")}` : g.names.join(", "))).join("\n");
}

/** Parses the skills text back, reusing ids of skills that kept their name (stable evidence links). */
export function textToSkills(text: string, previous: Skill[]): Skill[] {
  const byName = new Map(previous.map((s) => [s.name.toLowerCase(), s]));
  const seen = new Set<string>();
  const result: Skill[] = [];
  for (const line of linesToList(text)) {
    const match = /^([^:,]{1,40}):\s*(.*)$/.exec(line);
    const category = match ? (match[1] ?? "").trim() : "";
    const list = match ? (match[2] ?? "") : line;
    for (const raw of list.split(",")) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.push({ id: byName.get(key)?.id ?? newId(), name: name.slice(0, 100), category });
    }
  }
  return result;
}
