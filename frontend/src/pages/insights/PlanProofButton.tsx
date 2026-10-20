import { Hammer } from "lucide-react";
import { Link } from "react-router-dom";
import { useCreateProof, useProofs } from "@/hooks/useInsights";

/** "Plan a proof" for one skill gap; once planned, a link to the Proof Board instead. */
export function PlanProofButton({ skill, jobId }: { skill: string; jobId?: string | null }) {
  const proofs = useProofs();
  const create = useCreateProof();
  const planned = proofs.data?.some((p) => p.skill === skill) || create.isSuccess;
  if (planned) {
    return (
      <Link to="/proofs" className="inline-flex min-h-6 items-center gap-1 text-label-md text-success-ink hover:underline">
        <Hammer className="size-3.5" aria-hidden /> On your Proof Board
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={create.isPending || proofs.isPending}
      onClick={() => create.mutate({ skill, job_id: jobId ?? null })}
      className="inline-flex min-h-6 items-center gap-1 text-label-md text-primary hover:underline disabled:opacity-60"
    >
      <Hammer className="size-3.5" aria-hidden /> {create.isPending ? "Planning…" : "Plan a proof"}
    </button>
  );
}
