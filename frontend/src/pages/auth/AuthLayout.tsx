import { Outlet } from "react-router-dom";
import { BrandMark } from "@/components/layout/BrandMark";
import { PRODUCT_TAGLINE } from "@/constants/branding";

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandMark />
          <p className="text-body-md text-on-surface-variant">{PRODUCT_TAGLINE}</p>
        </div>
        <main className="rounded-card border border-hairline bg-surface-container-lowest p-6 shadow-level-2 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
