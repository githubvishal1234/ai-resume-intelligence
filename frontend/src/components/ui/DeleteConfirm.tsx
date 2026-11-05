import { ApiError } from "@/services/apiClient";
import { Button } from "./Button";
import { Notice } from "./Notice";

/**
 * The inline "are you sure?" under a list card. It sits above the card's full-size link (z-10),
 * says what goes and what stays, and shows the server's reason if the delete fails.
 */
export function DeleteConfirm({
  title,
  body,
  confirmLabel = "Delete permanently",
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Notice
      tone="critical"
      title={title}
      className="relative z-10 mt-3"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" disabledReason={pending ? "Deleting…" : undefined} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      }
    >
      {error ? (error instanceof ApiError ? error.message : "Something went wrong. Please try again.") : body}
    </Notice>
  );
}
