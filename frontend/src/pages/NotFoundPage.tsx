import { ButtonLink } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p className="tnum font-mono text-label-md text-on-surface-variant">404</p>
      <h1 className="mt-2 font-display text-headline-md text-on-surface">Page not found</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">This page does not exist, or it is not available yet.</p>
      <ButtonLink to="/" className="mt-6">
        Back to dashboard
      </ButtonLink>
    </div>
  );
}
