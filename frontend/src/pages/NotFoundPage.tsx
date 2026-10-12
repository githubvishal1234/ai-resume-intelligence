import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist, or it is not available yet."
      action={<ButtonLink to="/">Back to dashboard</ButtonLink>}
    />
  );
}
