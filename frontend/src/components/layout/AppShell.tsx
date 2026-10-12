import { LogOut, Menu, Search } from "lucide-react";
import { useState } from "react";
import { Outlet, useNavigation } from "react-router-dom";
import { useLogout, useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/Button";
import { BrandMark, BrandIcon } from "./BrandMark";
import { MobileTabBar } from "./MobileTabBar";
import { NavDrawer } from "./NavDrawer";
import { NavList } from "./NavList";
import { NotificationBell } from "./NotificationBell";

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

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const session = useSession();
  const logout = useLogout();
  const user = session.data?.user;
  const navigating = useNavigation().state === "loading";

  return (
    <div className="min-h-dvh bg-surface">
      {navigating ? (
        <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary-fixed">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar (lg+) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-hairline bg-surface-container-lowest lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-hairline px-4">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
      </aside>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-hairline bg-surface-container-lowest/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-control p-2 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <BrandIcon className="size-7 lg:hidden" />

          <div className="relative ml-auto hidden w-full max-w-sm md:ml-0 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder" aria-hidden />
            <input
              type="search"
              disabled
              aria-label="Search"
              title="Global search is planned for a later phase."
              placeholder="Search — not available yet"
              className="h-10 w-full cursor-not-allowed rounded-control border border-hairline bg-surface-container-low pl-9 pr-3 text-body-md placeholder:text-placeholder"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            {user ? (
              <div className="hidden items-center gap-2.5 sm:flex">
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full bg-primary-fixed font-display text-label-md text-on-primary-fixed"
                >
                  {initials(user.display_name)}
                </span>
                <div className="leading-tight">
                  <p className="text-label-md text-on-surface">{user.display_name}</p>
                  <p className="text-body-sm text-on-surface-variant">{user.email}</p>
                </div>
              </div>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              loading={logout.isPending}
              onClick={() => logout.mutate()}
              icon={<LogOut className="size-4" aria-hidden />}
            >
              {/* One label: visually hidden on mobile, so the accessible name is never doubled. */}
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 focus:outline-none sm:px-6 md:pb-10 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
