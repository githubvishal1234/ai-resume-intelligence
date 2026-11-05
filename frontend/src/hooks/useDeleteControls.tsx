import { Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DeleteConfirm } from "@/components/ui/DeleteConfirm";

type Action = { isPending: boolean; error: Error | null; mutate: () => void };

/**
 * The trash button for one list card and the inline confirm it opens. For cards whose whole
 * surface is a link: put `button` in the card's header and `confirm` below it.
 */
export function useDeleteControls({
  name,
  note,
  action,
  verb = "Delete",
  confirmLabel,
}: {
  name: string;
  note: string;
  action: Action;
  verb?: string;
  confirmLabel?: string;
}): { button: ReactNode; confirm: ReactNode } {
  const [confirming, setConfirming] = useState(false);
  return {
    button: (
      <Button
        variant="ghost"
        size="sm"
        className="relative z-10"
        aria-label={`${verb} ${name}`}
        aria-expanded={confirming}
        onClick={() => setConfirming(true)}
        icon={<Trash2 className="size-4" aria-hidden />}
      />
    ),
    confirm: confirming ? (
      <DeleteConfirm
        title={`${verb} “${name}”?`}
        body={note}
        confirmLabel={confirmLabel}
        pending={action.isPending}
        error={action.error}
        onConfirm={() => action.mutate()}
        onCancel={() => setConfirming(false)}
      />
    ) : null,
  };
}
