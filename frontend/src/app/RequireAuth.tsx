import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useSession } from "@/hooks/useSession";

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  // Someone who was signed in here and just signed out goes to sign-in, not the product page.
  const [wasSignedIn, setWasSignedIn] = useState(false);
  if (session.data && !wasSignedIn) setWasSignedIn(true);
  if (session.isPending) return <div className="p-6"><PageLoading label="Checking your session" /></div>;
  if (session.isError) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} title="We couldn't verify your session" />
      </div>
    );
  }
  if (!session.data) {
    // A visitor opening the site's root sees the product page; deep links go to sign-in.
    if (location.pathname === "/" && !wasSignedIn) return <Navigate to="/welcome" replace />;
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <div className="p-6"><PageLoading label="Loading" /></div>;
  if (session.data) {
    // Signed up (or already signed in) from the Pro waitlist button: confirm on the pricing page.
    const wantsPro = new URLSearchParams(location.search).get("plan") === "pro";
    return <Navigate to={wantsPro ? "/pricing?join=pro" : "/"} replace />;
  }
  return <Outlet />;
}
