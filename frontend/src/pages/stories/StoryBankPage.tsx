import { BookOpen, ChevronDown, Plus, Quote, Save, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useCreateStory, useDeleteStory, useStories, useStorySuggestions, useUpdateStory } from "@/hooks/useStories";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/pages/resumes/common";
import { THEMES, type Story, type StorySuggestion, type Theme } from "@/services/storyService";

const label = (t: Theme) => THEMES.find((x) => x.id === t)?.label ?? t;
const PARTS = ["situation", "task", "action", "result"] as const;

/** How many of the four STAR parts a story has written. */
export function completeness(s: Pick<Story, (typeof PARTS)[number]>) {
  return PARTS.filter((p) => s[p].trim()).length;
}

export function StoryBankPage() {
  const stories = useStories();
  const suggestions = useStorySuggestions();
  const create = useCreateStory();
  const [openId, setOpenId] = useState<string | null>(null);
  if (stories.isPending) return <PageLoading label="Loading your stories" />;
  if (stories.isError) return <ErrorState error={stories.error} onRetry={() => void stories.refetch()} />;

  const count = (t: Theme) => stories.data.filter((s) => s.themes.includes(t)).length;
  const start = (s: StorySuggestion) =>
    create.mutate(
      { title: s.title, action: s.line, result: s.result, themes: s.themes, source_line: s.line, source: s.source },
      { onSuccess: (story) => setOpenId(story.id) },
    );

  return (
    <div>
      <PageHeader
        title="Story Bank"
        photo="interview"
        description="Interview stories in STAR form, grown from lines your resume already backs up. Ready before anyone asks."
      />

      <Card className="mb-6" aria-labelledby="coverage-title">
        <CardHeader id="coverage-title" title="Theme coverage" description="Most behavioral questions ask about one of these. Aim for a story in each." />
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((t) => {
            const n = count(t.id);
            return (
              <li key={t.id} className={cn("rounded-control border p-3", n ? "border-success-border bg-success-surface" : "border-dashed border-hairline-strong")}>
                <p className={cn("text-label-md font-semibold", n ? "text-success-ink" : "text-on-surface")}>{t.label}</p>
                <p className={cn("text-body-sm", n ? "text-success-ink" : "text-on-surface-variant")}>{n ? `${n} ${n === 1 ? "story" : "stories"}` : t.prompt}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section aria-labelledby="stories-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="stories-title" className="font-display text-headline-sm text-on-surface">Your stories</h2>
            <Button
              size="sm"
              variant="secondary"
              loading={create.isPending && !create.variables?.source_line}
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => create.mutate({ title: "New story" }, { onSuccess: (story) => setOpenId(story.id) })}
            >
              Write one from scratch
            </Button>
          </div>
          {create.isError ? <p role="alert" className="mb-3 text-body-sm text-critical-ink"><ApiErrorText error={create.error} /></p> : null}
          {stories.data.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline-strong px-6 py-10 text-center">
              <BookOpen className="mx-auto size-8 text-outline" aria-hidden />
              <p className="mt-3 font-display text-headline-sm">Start with a line you're proud of</p>
              <p className="mt-1 text-body-md text-on-surface-variant">Pick a suggestion: the action and result come from your resume, word for word. You add what only you know.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {stories.data.map((s) => (
                <li key={s.id}>
                  <StoryCard story={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside aria-labelledby="suggest-title">
          <Card>
            <CardHeader id="suggest-title" title="From your resume" description="Lines with a clear action or a measured result make the strongest stories." />
            {suggestions.data && !suggestions.data.has_master ? (
              <Notice tone="info" title="Add your master resume first">
                Suggestions come from it. <Link to="/resumes/upload" className="font-semibold underline">Upload or build one</Link>.
              </Notice>
            ) : (suggestions.data?.suggestions ?? []).length === 0 ? (
              <p className="text-body-md text-on-surface-variant">{suggestions.isPending ? "Reading your resume…" : "Every strong line already has a story."}</p>
            ) : (
              <ul className="space-y-3">
                {suggestions.data!.suggestions.map((s) => (
                  <li key={s.line} className="rounded-control border border-hairline bg-surface-container-low p-3">
                    <p className="flex gap-2 text-body-md text-on-surface">
                      <Quote className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
                      {s.line}
                    </p>
                    <p className="mt-1 text-body-sm text-on-surface-variant">{s.source}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {s.themes.map((t) => (
                        <Pill key={t} tone="brand">{label(t)}</Pill>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        loading={create.isPending && create.variables?.source_line === s.line}
                        icon={<Sparkles className="size-4" aria-hidden />}
                        onClick={() => start(s)}
                      >
                        Start a story
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 font-mono text-label-sm text-on-surface-variant">Method {suggestions.data?.method_version ?? "stories-v1"}: verb and keyword rules, no AI.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StoryCard({ story: s, open, onToggle }: { story: Story; open: boolean; onToggle: () => void }) {
  const update = useUpdateStory();
  const remove = useDeleteStory();
  const [draft, setDraft] = useState({ title: s.title, situation: s.situation, task: s.task, action: s.action, result: s.result, themes: s.themes });
  const done = completeness(s);
  const dirty =
    draft.title !== s.title || PARTS.some((p) => draft[p] !== s[p]) || draft.themes.join() !== s.themes.join();
  const toggleTheme = (t: Theme) =>
    setDraft((d) => ({ ...d, themes: d.themes.includes(t) ? d.themes.filter((x) => x !== t) : [...d.themes, t] }));
  const bodyId = `story-${s.id}`;

  return (
    <article className="rounded-card border border-hairline bg-surface-container-lowest shadow-level-1">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-body-lg font-semibold text-on-surface">{s.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.themes.map((t) => (
              <Pill key={t} tone="brand">{label(t)}</Pill>
            ))}
            <span className="text-body-sm text-on-surface-variant">{done} of 4 STAR parts written</span>
          </span>
        </span>
        <span aria-hidden className="flex gap-1 pt-1.5">
          {PARTS.map((p) => (
            <span key={p} className={cn("size-2 rounded-full", s[p].trim() ? "bg-success" : "bg-hairline-strong")} />
          ))}
        </span>
        <ChevronDown className={cn("mt-1 size-5 shrink-0 text-on-surface-variant transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={bodyId} className="space-y-4 border-t border-hairline p-4">
          {s.source_line ? (
            <p className="flex gap-2 rounded-control bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                From your resume ({s.source}): “{s.source_line}”
              </span>
            </p>
          ) : null}
          <Field label="Title">{({ id }) => <Input id={id} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
          <Field label="Situation" hint="Where were you and what was going on? Your resume doesn't say, so only you can write this.">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={3} maxLength={3000} value={draft.situation} onChange={(e) => setDraft({ ...draft, situation: e.target.value })} />}
          </Field>
          <Field label="Task" hint="What were you responsible for?">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={2} maxLength={3000} value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} />}
          </Field>
          <Field label="Action" hint="What you did yourself. Starts as your resume line.">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={3} maxLength={3000} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />}
          </Field>
          <Field label="Result" hint="The outcome, with the numbers your resume states.">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={2} maxLength={3000} value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} />}
          </Field>
          <fieldset>
            <legend className="mb-2 text-label-md text-on-surface">Themes</legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-label-md has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                    draft.themes.includes(t.id) ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-hairline-strong text-on-surface-variant",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={draft.themes.includes(t.id)} onChange={() => toggleTheme(t.id)} />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={update.isPending}
              disabledReason={dirty ? undefined : "No changes to save"}
              onClick={() => update.mutate({ id: s.id, ...draft, themes: THEMES.map((t) => t.id).filter((t) => draft.themes.includes(t)) })}
              icon={<Save className="size-4" aria-hidden />}
            >
              Save story
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" loading={remove.isPending} onClick={() => remove.mutate(s.id)} icon={<Trash2 className="size-4" aria-hidden />}>
              <span className="sr-only">Delete the story “{s.title}”</span>
            </Button>
          </div>
          {update.isError ? <p role="alert" className="text-body-sm text-critical-ink"><ApiErrorText error={update.error} /></p> : null}
        </div>
      ) : null}
    </article>
  );
}
