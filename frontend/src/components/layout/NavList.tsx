import { NavLink } from "react-router-dom";
import { NAV_GROUPS, navDisabledReason, type NavItem } from "@/constants/navigation";
import { cn } from "@/lib/cn";

const ROW =
  "flex items-center gap-3 rounded-control px-3 py-2 text-body-md transition-colors";

export function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/"}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            ROW,
            isActive
              ? "bg-primary font-semibold text-on-primary shadow-brand"
              : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
          )
        }
      >
        <Icon className="size-[18px] shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }
  // Not built yet: never a link, never pretends to work.
  const reason = navDisabledReason(item);
  return (
    <span
      role="link"
      aria-disabled="true"
      tabIndex={0}
      title={reason}
      className={cn(ROW, "cursor-not-allowed text-outline")}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      <span className="ml-auto rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
        P{item.phase}
      </span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 px-3 text-label-sm uppercase tracking-wider text-outline">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <NavRow item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
