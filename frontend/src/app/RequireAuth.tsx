import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorState, PageLoading } from "@/components/ui/States";
import { useSession } from "@/hooks/useSession";

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <div className="p-6"><PageLoading label="Checking your session" /></div>;
  if (session.isError) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} title="We couldn't verify your session" />
      </div>
    );
  }
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const session = useSession();
  if (session.isPending) return <div className="p-6"><PageLoading label="Loading" /></div>;
  if (session.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
