import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useCapabilities } from "@/hooks/useCapabilities";

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-label-md text-on-surface">{label}</p>
        <p className="text-body-sm text-on-surface-variant">{detail}</p>
      </div>
      <Pill tone={ok ? "matched" : "neutral"}>{ok ? "Configured" : "Not configured"}</Pill>
    </li>
  );
}

/** Shows what this deployment can really do, straight from GET /system/capabilities. */
export function CapabilitiesCard() {
  const caps = useCapabilities();
  return (
    <Card aria-labelledby="caps-title">
      <CardHeader id="caps-title" title="System status" description="Integrations available in this deployment." />
      {caps.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : caps.isError ? (
        <ErrorState error={caps.error} onRetry={() => void caps.refetch()} title="Could not load system status" />
      ) : (
        <ul className="divide-y divide-hairline">
          <Row
            label="AI provider"
            ok={caps.data.ai.configured}
            detail={
              caps.data.ai.configured
                ? `${caps.data.ai.provider ?? ""} · ${caps.data.ai.model ?? ""}`
                : "AI-assisted features stay disabled until an administrator configures a provider."
            }
          />
          <Row
            label="Email delivery"
            ok={caps.data.email.configured}
            detail={caps.data.email.configured ? "Email notifications can be sent." : "Password reset and email notifications are unavailable."}
          />
          <Row label="File storage" ok detail={`Backend: ${caps.data.storage.backend}`} />
        </ul>
      )}
    </Card>
  );
}
