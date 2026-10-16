import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Check, PenLine, Sparkles, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResumeView } from "@/components/resume/ResumeView";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import {
  useDecide,
  useDiscardTailoring,
  useFinalize,
  useRewrite,
  useRewriteBullet,
  useTailoringSession,
} from "@/hooks/useTailoring";
import { ApiError } from "@/services/apiClient";
import { TIER_LABEL, type Tier } from "@/services/jobService";
import { items, text, type Bullet, type Session, type TailoringChange } from "@/services/tailoringService";
import { EvidenceList } from "@/pages/match/common";
import { PageHeader } from "@/pages/resumes/common";

const DECISION_PILL = {
  pending: <Pill>Not reviewed</Pill>,
  accepted: <Pill tone="matched">Accepted</Pill>,
  rejected: <Pill tone="neutral">Rejected</Pill>,
};

export function TailorReviewPage() {
  const { sessionId = "" } = useParams();
  const session = useTailoringSession(sessionId);
  if (session.isPending) return <PageLoading label="Loading proposals" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  return <Review session={session.data} />;
}

function Review({ session: s }: { session: Session }) {
  const draft = s.status === "draft";
  const accepted = s.changes.filter((c) => c.decision === "accepted").length;
  return (
    <div>
      <PageHeader
        title={`Tailor for ${s.job_title}`}
        description={`${accepted} of ${s.changes.length} changes accepted · based on master version ${s.base_version}`}
        back={{ to: "/tailor", label: "Tailor Resume" }}
      />
      {s.master_current_version !== s.base_version && draft ? (
        <Notice tone="warning" title="Your master resume changed" className="mb-4">
          These proposals were made from version {s.base_version}; your master is now at version{" "}
          {s.master_current_version}. The tailored resume will be built from version {s.base_version}. Start a new
          session to use the latest version.
        </Notice>
      ) : null}
      {!draft ? (
        <Notice tone="info" title={s.status === "finalized" ? "This session is finished" : "This session was discarded"} className="mb-4">
          {s.status === "finalized" ? "The tailored resume was created. Changes can no longer be reviewed here." : null}
        </Notice>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <ol className="space-y-4" aria-label="Proposed changes">
            {s.changes.map((c, i) => (
              <li key={c.id} id={`change-${c.id}`}>
                <ChangeCard session={s} change={c} index={i + 1} />
              </li>
            ))}
          </ol>
          {draft && s.bullets.length ? <BulletRewrites session={s} /> : null}
        </div>
        <div className="space-y-6">
          {draft ? <Finish session={s} accepted={accepted} /> : null}
          <Card aria-labelledby="preview-title">
            <CardHeader id="preview-title" title="Preview" description="Your master resume with the accepted changes." />
            <div className="max-h-[70vh] overflow-auto rounded-control border border-hairline p-4" tabIndex={0} aria-label="Resume preview">
              <ResumeView doc={s.preview} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChangeCard({ session, change: c, index }: { session: Session; change: TailoringChange; index: number }) {
  const decide = useDecide(session.id);
  const rewrite = useRewrite(session.id);
  const draft = session.status === "draft";
  const [editing, setEditing] = useState(false);
  const current = text(c.edited) || text(c.proposed);
  const [draftText, setDraftText] = useState(current);
  const headingId = useId();
  const busy = decide.isPending || rewrite.isPending;
  const blocking = c.flags.filter((f) => f.severity !== "warn");
  const warnings = c.flags.filter((f) => f.severity === "warn");
  const failure = decide.error ?? rewrite.error;
  // A factual-check refusal is already explained by the flags shown on the card.
  const error = failure instanceof ApiError && failure.code === "FACTUAL_CHECK_FAILED" ? null : failure;

  return (
    <Card aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={headingId} className="font-display text-headline-sm text-on-surface">
          <span className="text-on-surface-variant">{index}. </span>
          {c.title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {c.source === "llm" ? <Pill tone="brand">AI rewrite</Pill> : null}
          {DECISION_PILL[c.decision]}
        </div>
      </div>
      <p className="mt-2 text-body-md text-on-surface-variant">{c.reason}</p>
      {c.requirements.length ? (
        <div className="mt-3">
          <p className="text-label-md text-on-surface">Serves</p>
          <ul className="mt-1 space-y-1">
            {c.requirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2 text-body-sm text-on-surface">
                <Pill tone={r.tier === "required" ? "brand" : "info"}>{TIER_LABEL[r.tier as Tier] ?? r.tier}</Pill>
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <Diff change={c} />
      </div>
      {c.evidence.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-label-md text-primary">Evidence from your resume</summary>
          <EvidenceList evidence={c.evidence} />
        </details>
      ) : null}
      {blocking.length ? (
        <Notice tone="critical" title="Not in your master resume" className="mt-4">
          <ul className="list-disc space-y-1 pl-5">
            {blocking.map((f) => (
              <li key={`${f.kind}-${f.value}`}>{f.message}</li>
            ))}
          </ul>
          <p className="mt-2">Edit the text to remove these, or reject the change.</p>
        </Notice>
      ) : null}
      {warnings.length ? (
        <Notice tone="warning" title="Check these claims" className="mt-4">
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((f) => (
              <li key={`${f.kind}-${f.value}`}>{f.message}</li>
            ))}
          </ul>
          <p className="mt-2">The AI check could not match these to your master resume. Accept only if they are true.</p>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="critical" title="That didn't work" className="mt-4">
          {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}

      {draft && editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            decide.mutate(
              { changeId: c.id, decision: "accepted", editedText: draftText },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <label className="block text-label-md text-on-surface" htmlFor={`${headingId}-edit`}>Your wording</label>
          <Textarea id={`${headingId}-edit`} rows={5} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={decide.isPending} icon={<Check className="size-4" aria-hidden />}>Save and accept</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : draft ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={c.decision === "accepted" ? "secondary" : "primary"}
            disabledReason={blocking.length ? "Remove the flagged facts first" : undefined}
            loading={decide.isPending && decide.variables?.decision === "accepted"}
            disabled={busy || c.decision === "accepted"}
            icon={<Check className="size-4" aria-hidden />}
            onClick={() => decide.mutate({ changeId: c.id, decision: "accepted" })}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || c.decision === "rejected"}
            loading={decide.isPending && decide.variables?.decision === "rejected"}
            icon={<X className="size-4" aria-hidden />}
            onClick={() => decide.mutate({ changeId: c.id, decision: "rejected" })}
          >
            Reject
          </Button>
          {c.editable ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={<PenLine className="size-4" aria-hidden />}
                onClick={() => {
                  setDraftText(current);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={rewrite.isPending}
                disabledReason={session.ai.configured ? undefined : "AI rewriting is not set up yet"}
                icon={<Sparkles className="size-4" aria-hidden />}
                onClick={() => rewrite.mutate(c.id)}
              >
                Rewrite with AI
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Diff({ change: c }: { change: TailoringChange }) {
  if (c.kind === "summary" || c.kind === "rewrite_bullet") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Block label="Now">{text(c.original)}</Block>
        <Block label={c.edited ? "Your edit" : "Proposed"} highlight>{text(c.edited) || text(c.proposed)}</Block>
      </div>
    );
  }
  if (c.kind === "add_skills") {
    return (
      <div>
        <p className="mb-2 text-label-md text-on-surface-variant">Added to your skills list</p>
        <ul className="flex flex-wrap gap-1.5">
          {items(c.proposed).map((i) => (
            <li key={i.text}><Pill tone="matched">+ {i.text}</Pill></li>
          ))}
        </ul>
      </div>
    );
  }
  const before = items(c.original);
  const after = items(c.proposed);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Block label="Now"><OrderedList values={before.map((i) => i.text)} /></Block>
      <Block label="Proposed order" highlight>
        <OrderedList values={after.map((i) => i.text)} moved={after.map((i, n) => before[n]?.text !== i.text)} />
      </Block>
    </div>
  );
}

function BulletRewrites({ session: s }: { session: Session }) {
  const rewrite = useRewriteBullet(s.id);
  const id = useId();
  const roles: { role: string; bullets: Bullet[] }[] = [];
  for (const b of s.bullets) {
    const last = roles[roles.length - 1];
    if (last && last.bullets[0]?.experience_id === b.experience_id) last.bullets.push(b);
    else roles.push({ role: b.role, bullets: [b] });
  }
  const position = new Map(s.changes.map((c, i) => [c.id, i + 1]));
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader
        id={`${id}-title`}
        title="Reword a bullet with AI"
        description="Pick a bullet from your master resume. The new wording is added above as a change to review, and it is checked against your master resume like every other change."
      />
      {!s.ai.configured ? (
        <Notice tone="info" title="AI rewriting is not set up yet" className="mb-4">
          An administrator has to connect an AI provider before bullets can be reworded.
        </Notice>
      ) : null}
      {rewrite.isError ? (
        <Notice tone="critical" title="That didn't work" className="mb-4">
          <ApiErrorText error={rewrite.error} />
        </Notice>
      ) : null}
      <div className="space-y-4">
        {roles.map((r) => (
          <section key={r.bullets[0]?.experience_id} aria-label={r.role}>
            <h3 className="text-label-md text-on-surface">{r.role}</h3>
            <ul className="mt-2 space-y-2">
              {r.bullets.map((b) => {
                const n = b.change_id ? position.get(b.change_id) : undefined;
                const pending =
                  rewrite.isPending &&
                  rewrite.variables?.experienceId === b.experience_id &&
                  rewrite.variables.index === b.index;
                return (
                  <li
                    key={b.index}
                    className="flex flex-col gap-2 rounded-control border border-hairline p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 text-body-md text-on-surface">
                      <p id={`${id}-b-${b.experience_id}-${b.index}`} className="break-words">{b.text}</p>
                      {n ? <p className="mt-1 text-body-sm text-on-surface-variant">Reworded as change {n}.</p> : null}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      loading={pending}
                      disabled={rewrite.isPending && !pending}
                      disabledReason={s.ai.configured ? undefined : "AI rewriting is not set up yet"}
                      icon={<Sparkles className="size-4" aria-hidden />}
                      aria-describedby={`${id}-b-${b.experience_id}-${b.index}`}
                      onClick={() =>
                        rewrite.mutate(
                          { experienceId: b.experience_id, index: b.index },
                          {
                            onSuccess: (next) => {
                              const changeId = next.bullets.find(
                                (x) => x.experience_id === b.experience_id && x.index === b.index,
                              )?.change_id;
                              if (changeId) document.getElementById(`change-${changeId}`)?.scrollIntoView?.({ block: "start" });
                            },
                          },
                        )
                      }
                    >
                      {b.change_id ? "Rewrite again" : "Rewrite with AI"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function Block({ label, highlight, children }: { label: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div className={highlight ? "rounded-control border border-primary-fixed-dim bg-primary-fixed/30 p-3" : "rounded-control border border-hairline bg-surface-container-low p-3"}>
      <p className="mb-1 text-label-sm text-on-surface-variant">{label}</p>
      <div className="text-body-md text-on-surface">{children}</div>
    </div>
  );
}

function OrderedList({ values, moved }: { values: string[]; moved?: boolean[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      {values.map((v, i) => (
        <li key={`${v}-${i}`} className={moved?.[i] ? "font-medium" : undefined}>
          {v}
          {moved?.[i] ? <span className="sr-only"> (moved)</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Finish({ session: s, accepted }: { session: Session; accepted: number }) {
  const finalize = useFinalize(s.id);
  const discard = useDiscardTailoring(s.id);
  const navigate = useNavigate();
  const [title, setTitle] = useState(`${s.job_title}${s.job_company ? ` (${s.job_company})` : ""}`.slice(0, 200));
  const id = useId();
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader id={`${id}-title`} title="Create the tailored resume" description="Your master resume stays exactly as it is." />
      {finalize.isError ? (
        <Notice tone="critical" title="Could not create it" className="mb-4">
          {finalize.error instanceof ApiError ? finalize.error.message : "Something went wrong. Please try again."}
        </Notice>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="block text-label-md text-on-surface">Name</label>
        <Input id={`${id}-name`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          loading={finalize.isPending}
          disabledReason={accepted === 0 ? "Accept at least one change first" : undefined}
          onClick={() =>
            finalize.mutate(title.trim() || undefined, {
              onSuccess: (done) => done.result_resume_id && navigate(`/resumes/${done.result_resume_id}`),
            })
          }
        >
          Create tailored resume
        </Button>
        <Button
          variant="ghost"
          loading={discard.isPending}
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => discard.mutate(undefined, { onSuccess: () => navigate("/tailor", { replace: true }) })}
        >
          Discard session
        </Button>
      </div>
    </Card>
  );
}
