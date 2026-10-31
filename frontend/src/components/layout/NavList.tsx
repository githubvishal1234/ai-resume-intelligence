import { ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  const heading = "px-3 text-label-sm uppercase tracking-wider text-outline";
  return (
    <nav aria-label="Primary" className="space-y-5">
      {NAV_GROUPS.map((group) => {
        const list = (
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <NavRow item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        );
        if (group.collapsible) {
          const here = group.items.some((i) => i.to && pathname.startsWith(i.to));
          return (
            <details key={group.id} open={here || undefined} className="group/more">
              <summary className={cn(heading, "mb-1.5 flex cursor-pointer list-none items-center gap-1 hover:text-on-surface")}>
                <ChevronRight className="size-3.5 transition-transform group-open/more:rotate-90" aria-hidden />
                {group.label}
              </summary>
              {list}
            </details>
          );
        }
        return (
          <div key={group.id}>
            <p className={cn(heading, "mb-1.5")}>{group.label}</p>
            {list}
          </div>
        );
      })}
    </nav>
  );
}
