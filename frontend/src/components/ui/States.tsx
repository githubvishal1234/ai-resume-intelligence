import { CloudOff, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/services/apiClient";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-hairline-strong bg-surface-container-lowest px-6 py-10 text-center">
      <div className="mb-3 text-outline">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <h3 className="font-display text-headline-sm">{title}</h3>
      <p className="mt-1 max-w-md text-body-md text-on-surface-variant">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Error state with the request id so users can quote it to support. Never shows internals. */
export function ErrorState({
  error,
  onRetry,
  title = "Something went wrong",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="flex flex-col items-center rounded-card border border-critical-border bg-critical-surface px-6 py-10 text-center">
      <CloudOff className="mb-3 size-8 text-critical" aria-hidden />
      <h3 className="font-display text-headline-sm text-critical-ink">{title}</h3>
      <p className="mt-1 max-w-md text-body-md text-critical-ink">
        {api?.message ?? "An unexpected error occurred. Please try again."}
      </p>
      {api?.requestId ? (
        <p className="mt-2 font-mono text-code-sm text-critical-ink/80">Reference: {api.requestId}</p>
      ) : null}
      {onRetry ? (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-control bg-surface-container", className)} />;
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4 p-1">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
