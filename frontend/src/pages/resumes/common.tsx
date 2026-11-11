import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** The top of every app page: where you are, one line on what it is for, and its actions. */
export function PageHeader({ title, description, back, actions }: {
  title: string;
  description?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-hairline pb-5">
      {back ? (
        <Link to={back.to} className="-mt-1 mb-2 inline-flex min-h-6 items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-display text-headline-md text-on-surface sm:text-[26px] sm:leading-8">{title}</h1>
          {description ? <p className="mt-1 text-body-md text-on-surface-variant">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const SOURCE_LABEL: Record<string, string> = {
  upload: "Uploaded",
  edit: "Edited",
  restore: "Restored",
  tailoring: "Tailoring",
};
