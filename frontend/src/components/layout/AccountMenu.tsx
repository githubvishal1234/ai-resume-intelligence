import { ChevronDown, Loader2, LogOut, Settings } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDismiss } from "@/hooks/useDismiss";
import { useLogout } from "@/hooks/useSession";
import { cn } from "@/lib/cn";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const ITEM =
  "flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-body-md text-on-surface transition-colors hover:bg-surface-container-low";

/** The signed-in user in the header: who they are, Settings and Sign out. */
export function AccountMenu({ user }: { user: { display_name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const logout = useLogout();
  useDismiss(open, () => setOpen(false), root);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-control py-1 pl-1 pr-1.5 transition-colors hover:bg-surface-container-low",
          open && "bg-surface-container-low",
        )}
      >
        <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary-fixed text-label-sm font-semibold text-on-primary-fixed">
          {initials(user.display_name)}
        </span>
        <span className="hidden max-w-40 truncate text-label-md font-medium text-on-surface sm:block">{user.display_name}</span>
        <ChevronDown className={cn("size-4 text-outline transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="absolute right-0 top-full z-40 mt-2 w-64 origin-top-right animate-menu rounded-card border border-hairline bg-surface-container-lowest p-1.5 shadow-level-3">
          <div className="border-b border-hairline px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-label-md font-medium text-on-surface">{user.display_name}</p>
            <p className="truncate text-body-sm text-on-surface-variant">{user.email}</p>
          </div>
          <ul className="mt-1.5">
            <li>
              <Link to="/settings" onClick={() => setOpen(false)} className={ITEM}>
                <Settings className="size-4 text-on-surface-variant" aria-hidden /> Settings
              </Link>
            </li>
            <li>
              <button
                type="button"
                aria-busy={logout.isPending || undefined}
                onClick={() => {
                  if (!logout.isPending) logout.mutate();
                }}
                className={ITEM}
              >
                {logout.isPending ? (
                  <Loader2 className="size-4 animate-spin text-on-surface-variant" aria-hidden />
                ) : (
                  <LogOut className="size-4 text-on-surface-variant" aria-hidden />
                )}
                Sign out
              </button>
            </li>
          </ul>
          {logout.isError ? (
            <p role="alert" className="px-2.5 pb-1.5 pt-1 text-body-sm text-critical">
              We couldn&apos;t sign you out. Check your connection and try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
