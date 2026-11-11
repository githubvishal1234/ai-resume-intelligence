import { Menu } from "lucide-react";
import { useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { AccountMenu } from "./AccountMenu";
import { BrandMark, BrandIcon } from "./BrandMark";
import { GlobalSearch } from "./GlobalSearch";
import { MobileTabBar } from "./MobileTabBar";
import { NavDrawer } from "./NavDrawer";
import { NavList } from "./NavList";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const session = useSession();
  const user = session.data?.user;
  const navigating = useNavigation().state === "loading";
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-surface">
      {navigating ? (
        <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-progress bg-primary" />
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
        <div className="flex h-14 shrink-0 items-center border-b border-hairline px-4">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
      </aside>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-hairline bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-control p-2 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <BrandIcon className="size-7 lg:hidden" />

          <GlobalSearch />

          <div className="flex items-center gap-1 md:ml-auto">
            <ThemeToggle />
            <NotificationBell />
            {user ? <AccountMenu user={user} /> : null}
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 focus:outline-none sm:px-6 md:pb-12 lg:px-8 lg:pt-8">
          {/* Each page fades in as it arrives (instant under reduced motion). */}
          <div key={pathname} className="animate-page">
            <Outlet />
          </div>
          <ScrollRestoration />
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
