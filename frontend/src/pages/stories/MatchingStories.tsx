import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useStories } from "@/hooks/useStories";
import type { Question } from "@/services/interviewService";
import { THEMES, type Theme } from "@/services/storyService";
import { completeness } from "./StoryBankPage";

/** The story themes a question is asking about. Gap questions get none: answer those honestly. */
export function questionThemes(q: Pick<Question, "category" | "text">): Theme[] {
  const text = q.text.toLowerCase();
  switch (q.category) {
    case "behavioral":
      if (text.includes("disagree")) return ["conflict", "collaboration"];
      if (text.includes("didn't go as planned") || text.includes("learn")) return ["failure"];
      if (text.includes("urgent") || text.includes("work on")) return ["priorities"];
      return ["leadership", "collaboration"];
    case "experience":
      return ["impact", "technical", "ownership"];
    case "technical":
      return ["technical"];
    case "opening":
      return ["impact", "leadership"];
    case "role":
      return ["ownership", "leadership"];
    default:
      return [];
  }
}

/** Shows the user's own STAR stories that fit the question being practiced. */
export function MatchingStories({ question }: { question: Question }) {
  const stories = useStories();
  const themes = questionThemes(question);
  if (!themes.length || !stories.data) return null;
  const matching = stories.data.filter((s) => s.themes.some((t) => themes.includes(t))).slice(0, 3);
  const names = themes.map((t) => THEMES.find((x) => x.id === t)?.label ?? t).join(" or ");

  return (
    <section aria-label="Your stories for this question" className="mt-4 rounded-control border border-hairline bg-surface-container-low p-3">
      <p className="flex items-center gap-1.5 text-label-md font-semibold text-on-surface">
        <BookOpen className="size-4 text-primary" aria-hidden /> Your stories for this question
      </p>
      {matching.length === 0 ? (
        <p className="mt-1 text-body-sm text-on-surface-variant">
          No {names.toLowerCase()} story yet.{" "}
          <Link to="/stories" className="font-semibold text-primary hover:underline">Write one in the Story Bank</Link>.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {matching.map((s) => (
            <li key={s.id}>
              <details>
                <summary className="cursor-pointer py-1 text-body-md text-on-surface">
                  {s.title} <span className="text-body-sm text-on-surface-variant">· {completeness(s)} of 4 parts</span>
                </summary>
                <dl className="mt-1 space-y-1 pl-4 text-body-sm">
                  {(["situation", "task", "action", "result"] as const).map((p) =>
                    s[p].trim() ? (
                      <div key={p}>
                        <dt className="inline font-semibold capitalize text-on-surface">{p}: </dt>
                        <dd className="inline text-on-surface-variant">{s[p]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
