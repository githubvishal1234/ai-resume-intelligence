import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useAiUsage, useCapabilities } from "@/hooks/useCapabilities";
import type { AiUsage } from "@/services/systemService";

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-label-md text-on-surface">{label}</p>
        <p className="text-body-sm text-on-surface-variant">{detail}</p>
      </div>
      <Pill tone={ok ? "matched" : "neutral"}>{ok ? "On" : "Off"}</Pill>
    </li>
  );
}

function providerName(provider: string | null | undefined): string {
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "our AI provider";
}

function usageText(u: AiUsage): string {
  if (u.daily_limit === 0) return `${u.used_today} AI requests today · no daily limit`;
  return `${u.used_today} of ${u.daily_limit} AI requests used today · resets at midnight UTC`;
}

/**
 * What this account can use, from GET /system/capabilities. It names the AI provider because
 * that is where resume text goes; hosting details (model id, storage) are not the user's concern.
 */
export function CapabilitiesCard() {
  const caps = useCapabilities();
  const usage = useAiUsage(Boolean(caps.data?.ai.configured));
  return (
    <Card aria-labelledby="caps-title">
      <CardHeader id="caps-title" title="AI and email" description="What is switched on for your account." />
      {caps.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : caps.isError ? (
        <ErrorState error={caps.error} onRetry={() => void caps.refetch()} title="Could not load this section" />
      ) : (
        <ul className="divide-y divide-hairline">
          <Row
            label="AI assistance"
            ok={caps.data.ai.configured}
            detail={
              caps.data.ai.configured
                ? `When you use an AI button, the text involved is sent to ${providerName(caps.data.ai.provider)}.`
                : "AI buttons are switched off. Everything else works with built-in rules."
            }
          />
          {caps.data.ai.configured && usage.data ? (
            <li className="py-3">
              <p className="text-label-md text-on-surface">Your AI use</p>
              <p className="text-body-sm text-on-surface-variant">{usageText(usage.data)}</p>
            </li>
          ) : null}
          <Row
            label="Password reset by email"
            ok={caps.data.email.configured}
            detail={caps.data.email.configured ? "You can reset a forgotten password from the sign-in page." : "Not available yet. Keep your password somewhere safe."}
          />
        </ul>
      )}
    </Card>
  );
}
