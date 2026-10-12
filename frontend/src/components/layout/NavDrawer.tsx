import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { BrandMark } from "./BrandMark";
import { NavList } from "./NavList";

/** Slide-over navigation for < lg screens. Native <dialog> gives focus trapping, Esc and inert background. */
export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface-container-lowest p-0 shadow-level-3 backdrop:bg-on-surface/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between border-b border-hairline px-4">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-control p-2 text-on-surface-variant hover:bg-surface-container-low"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList onNavigate={onClose} />
        </div>
      </div>
    </dialog>
  );
}
