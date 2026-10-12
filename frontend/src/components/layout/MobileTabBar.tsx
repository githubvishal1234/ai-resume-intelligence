import { NavLink } from "react-router-dom";
import { ALL_NAV_ITEMS, MOBILE_TAB_IDS, navDisabledReason } from "@/constants/navigation";
import { cn } from "@/lib/cn";

/** Bottom task bar for < md (DESIGN.md mobile). Unbuilt destinations are visibly disabled. */
export function MobileTabBar() {
  const items = MOBILE_TAB_IDS.map((id) => ALL_NAV_ITEMS.find((i) => i.id === id)).filter(
    (i): i is NonNullable<typeof i> => Boolean(i),
  );
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const body = (
            <>
              <Icon className="size-5" aria-hidden />
              <span className="text-label-sm">{item.label.replace("My ", "")}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.to ? (
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1",
                      isActive ? "text-primary" : "text-on-surface-variant",
                    )
                  }
                >
                  {body}
                </NavLink>
              ) : (
                <span
                  role="link"
                  aria-disabled="true"
                  tabIndex={0}
                  title={navDisabledReason(item)}
                  className="flex min-h-14 cursor-not-allowed flex-col items-center justify-center gap-0.5 px-1 text-outline-variant"
                >
                  {body}
                  <span className="sr-only">{navDisabledReason(item)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
