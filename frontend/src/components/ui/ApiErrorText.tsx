import { Link } from "react-router-dom";
import { ApiError } from "@/services/apiClient";

/** An API error's message. When the Free plan's AI allowance is used up, it links to Pro. */
export function ApiErrorText({ error, fallback = "Something went wrong. Please try again." }: { error: unknown; fallback?: string }) {
  if (!(error instanceof ApiError)) return <>{fallback}</>;
  return (
    <>
      {error.message}
      {error.code === "PLAN_UPGRADE_REQUIRED" ? (
        <>
          {" "}
          <Link to="/pricing" className="font-semibold underline">Upgrade to Pro</Link>
        </>
      ) : null}
    </>
  );
}
