import { ArrowLeft, ArrowRight, Award, CircleAlert, CircleCheck, Code2, Hammer, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useCreateProof, useDeleteProof, useMarket, useProofs, useUpdateProof } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/pages/resumes/common";
import type { Proof, ProofKind, ProofStatus } from "@/services/insightsService";
import { EVIDENCE } from "./MarketMapPage";

const COLUMNS: { status: ProofStatus; label: string; hint: string }[] = [
  { status: "todo", label: "To do", hint: "Planned" },
  { status: "doing", label: "Doing", hint: "In progress" },
  { status: "done", label: "Done", hint: "Finished" },
];
const KIND: Record<ProofKind, { label: string; icon: typeof Code2 }> = {
  project: { label: "Project", icon: Code2 },
  certification: { label: "Certification", icon: Award },
  writeup: { label: "Write-up", icon: NotebookPen },
};

export function ProofBoardPage() {
  const proofs = useProofs();
  const market = useMarket();
  if (proofs.isPending) return <PageLoading label="Loading your proof board" />;
  if (proofs.isError) return <ErrorState error={proofs.error} onRetry={() => void proofs.refetch()} />;
  const planned = new Set(proofs.data.map((p) => p.skill));
  const ideas = (market.data?.skills ?? [])
    .filter((s) => (s.status === "missing" || s.status === "partial") && !planned.has(s.name))
    .slice(0, 6)
    .map((s) => s.name);

  return (
    <div>
      <PageHeader
        title="Proof Board"
        photo="proofs"
        description="Turn skill gaps into real evidence: small projects, certifications or write-ups, tracked until your resume shows them."
      />
      <AddProof ideas={ideas} />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = proofs.data.filter((p) => p.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`} className="rounded-panel bg-surface-container-low p-3">
              <header className="mb-3 flex items-center justify-between px-2 pt-1">
                <h2 id={`col-${col.status}`} className="font-display text-headline-sm text-on-surface">{col.label}</h2>
                <span className="tnum rounded-full bg-surface-container-lowest px-2.5 py-0.5 font-mono text-label-sm text-on-surface-variant">{items.length}</span>
              </header>
              <ul className="space-y-3">
                {items.map((p) => (
                  <li key={p.id}>
                    <ProofCard proof={p} />
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="rounded-card border border-dashed border-hairline-strong px-4 py-6 text-center text-body-sm text-on-surface-variant">
                    Nothing {col.hint.toLowerCase()}.
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-6 font-mono text-label-sm text-on-surface-variant">
        Evidence is checked against your master resume on every visit, with the same rules as Job Match. Marking a task done
        does not change it: adding the result to your resume does.
      </p>
    </div>
  );
}

function AddProof({ ideas }: { ideas: string[] }) {
  const create = useCreateProof();
  const [skill, setSkill] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (skill.trim()) create.mutate({ skill: skill.trim() }, { onSuccess: () => setSkill("") });
  };
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56">
          <span className="mb-1 block text-label-md text-on-surface">Plan a proof for a skill</span>
          <input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            maxLength={100}
            placeholder="For example Kubernetes"
            className="h-11 w-full rounded-control border border-hairline-strong bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-placeholder focus:border-primary focus:shadow-focus focus:outline-none"
          />
        </label>
        <Button type="submit" variant="primary" loading={create.isPending} icon={<Plus className="size-4" aria-hidden />}>
          Add
        </Button>
      </form>
      {ideas.length ? (
        <div className="mt-4">
          <p className="mb-2 text-label-sm uppercase tracking-wide text-on-surface-variant">Gaps from your Market Map</p>
          <div className="flex flex-wrap gap-2">
            {ideas.map((name) => (
              <button
                key={name}
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate({ skill: name })}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-container-lowest px-3.5 text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary"
              >
                <Plus className="size-3.5" aria-hidden /> {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {create.isError ? <p role="alert" className="mt-3 text-body-sm text-critical-ink"><ApiErrorText error={create.error} /></p> : null}
    </Card>
  );
}

function ProofCard({ proof: p }: { proof: Proof }) {
  const update = useUpdateProof();
  const remove = useDeleteProof();
  const idx = COLUMNS.findIndex((c) => c.status === p.status);
  const Kind = KIND[p.kind].icon;
  const steps = p.plan.split("\n").filter(Boolean);
  const proven = p.evidence_status === "strong";
  const move = (to: number) => update.mutate({ id: p.id, status: COLUMNS[to]!.status });

  return (
    <article className={cn("rounded-card border bg-surface-container-lowest p-4 shadow-level-1", proven ? "border-success-border" : "border-hairline")}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">{p.skill}</Pill>
        <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
          <Kind className="size-3.5" aria-hidden /> {KIND[p.kind].label}
        </span>
      </div>
      <h3 className="mt-2 font-display text-body-lg font-semibold text-on-surface">{p.title}</h3>

      {p.evidence_status ? (
        <p className={cn("mt-2 inline-flex items-center gap-1.5 text-body-sm", proven ? "text-success-ink" : "text-on-surface-variant")}>
          {proven ? <CircleCheck className="size-4" aria-hidden /> : <Hammer className="size-4" aria-hidden />}
          Resume: {EVIDENCE[p.evidence_status].label.toLowerCase()}
        </p>
      ) : null}
      {p.status === "done" && !proven ? (
        <p className="mt-2 flex gap-1.5 rounded-control bg-warning-surface px-3 py-2 text-body-sm text-warning-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Done, but your resume doesn't show it yet.{" "}
            <Link to="/resumes" className="font-semibold underline">Add it to your master resume</Link> to make it count.
          </span>
        </p>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer py-1 text-label-md text-primary">Plan ({steps.length} steps)</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-body-sm text-on-surface-variant">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-hairline pt-3">
        <Button size="sm" variant="ghost" disabledReason={idx === 0 ? "Already the first column" : undefined} onClick={() => move(idx - 1)} icon={<ArrowLeft className="size-4" aria-hidden />}>
          <span className="sr-only">Move to {COLUMNS[idx - 1]?.label ?? ""}</span>
        </Button>
        <Button size="sm" variant="secondary" disabledReason={idx === COLUMNS.length - 1 ? "Already done" : undefined} onClick={() => move(idx + 1)}>
          {idx < COLUMNS.length - 1 ? (
            <>
              <span className="sr-only">Move to </span>
              {COLUMNS[idx + 1]!.label}
            </>
          ) : (
            "Done"
          )}{" "}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          loading={remove.isPending}
          onClick={() => remove.mutate(p.id)}
          icon={<Trash2 className="size-4" aria-hidden />}
        >
          <span className="sr-only">Delete the {p.skill} proof task</span>
        </Button>
      </div>
    </article>
  );
}
