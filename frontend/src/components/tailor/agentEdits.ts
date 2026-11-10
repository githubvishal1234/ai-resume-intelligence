import { items, text, type Session } from "@/services/tailoringService";

/** One real rewrite to show being written: the wording comes from the finished session. */
export type AgentEdit = {
  kind: "headline" | "summary" | "bullet";
  from: string;
  to: string;
  /** The fact check raised something, so it waits for the user's review. */
  flagged: boolean;
};

const ORDER = { headline: 0, summary: 1, bullet: 2 };
/** Enough to see it work, and short enough that nobody waits on the animation. */
export const SHOWN_EDITS = 6;

export function agentEdits(session: Session): AgentEdit[] {
  const edits: AgentEdit[] = [];
  for (const c of session.changes) {
    if (c.decision === "rejected") continue;
    const kind = c.kind === "rewrite_bullet" ? "bullet" : c.kind;
    if (kind !== "headline" && kind !== "summary" && kind !== "bullet") continue;
    const to = text(c.edited ?? c.proposed);
    if (to) edits.push({ kind, from: text(c.original), to, flagged: c.flags.length > 0 });
  }
  return edits.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/** Skills this session takes off the copy (removed in the job's favour, never invented). */
export function removedSkills(session: Session): string[] {
  const out: string[] = [];
  for (const c of session.changes) {
    if (c.kind !== "trim_skills" || c.decision === "rejected") continue;
    const kept = new Set(items(c.edited ?? c.proposed).map((i) => i.text));
    out.push(...items(c.original).map((i) => i.text).filter((name) => !kept.has(name)));
  }
  return out;
}
