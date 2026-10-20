import { NavLink } from "react-router-dom";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { BrandMark } from "./BrandMark";

/** Header for the public pages (product page and pricing). */
export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  // Plain anchors for the product page's sections: on /welcome they scroll, elsewhere they load it.
  const section = "hover:text-primary";
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="/welcome" className="min-w-0">
          <BrandMark />
        </a>
        <nav aria-label="Site" className="ml-6 hidden items-center gap-6 text-body-md text-on-surface-variant lg:flex">
          <a href="/welcome#how" className={section}>How it works</a>
          <a href="/welcome#features" className={section}>Features</a>
          <a href="/welcome#templates" className={section}>Templates</a>
          <NavLink to="/pricing" className={({ isActive }) => cn(section, isActive && "font-medium text-primary")}>Pricing</NavLink>
          <a href="/welcome#faq" className={section}>FAQ</a>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <NavLink to="/pricing" className={({ isActive }) => cn("text-body-md text-on-surface-variant hover:text-primary lg:hidden", isActive && "font-medium text-primary")}>
            Pricing
          </NavLink>
          {signedIn ? (
            <ButtonLink to="/" variant="primary" size="sm">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm">Sign in</ButtonLink>
              <ButtonLink to="/register" variant="primary" size="sm">Get started</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
