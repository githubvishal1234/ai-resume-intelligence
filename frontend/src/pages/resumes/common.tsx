import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PhotoBanner } from "@/components/ui/PhotoBanner";
import type { PhotoName } from "@/constants/images";

export function PageHeader({ title, description, back, actions, photo }: {
  title: string;
  description?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** Section landing pages show a photo banner; detail pages stay plain. */
  photo?: PhotoName;
}) {
  return (
    <header className="mb-6 space-y-2">
      {back ? (
        <Link to={back.to} className="-my-1 inline-flex min-h-6 items-center gap-1 text-label-md text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      {photo ? (
        <PhotoBanner photo={photo} title={title} description={description} actions={actions} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-headline-lg text-on-surface">{title}</h1>
            {description ? <p className="mt-1 text-body-lg text-on-surface-variant">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
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
