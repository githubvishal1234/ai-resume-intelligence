import { ImageUp, Trash2, UserRound } from "lucide-react";
import { useRef } from "react";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useProfilePhoto, useRemovePhoto, useUploadPhoto } from "@/hooks/useProfilePhoto";
import { cn } from "@/lib/cn";

/** The photo (or a placeholder) with Upload / Replace / Remove. One photo per account. */
export function PhotoUploader({ size = "md" }: { size?: "sm" | "md" }) {
  const { url } = useProfilePhoto();
  const upload = useUploadPhoto();
  const remove = useRemovePhoto();
  const input = useRef<HTMLInputElement>(null);
  const error = upload.error ?? remove.error;
  const avatar = size === "sm" ? "size-14" : "size-20";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {url ? (
          <img src={url} alt="Your profile photo" className={cn(avatar, "rounded-full object-cover ring-1 ring-hairline")} />
        ) : (
          <span className={cn(avatar, "flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant")}>
            <UserRound className="size-7" aria-hidden />
            <span className="sr-only">No photo yet</span>
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <Button variant={url ? "secondary" : "primary"} size="sm" loading={upload.isPending} icon={<ImageUp className="size-4" aria-hidden />} onClick={() => input.current?.click()}>
            {url ? "Replace photo" : "Upload photo"}
          </Button>
          {url ? (
            <Button variant="ghost" size="sm" loading={remove.isPending} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => remove.mutate()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-body-sm text-on-surface-variant">JPEG, PNG or WebP up to 5 MB. It is cropped to a square, and location and camera details are removed.</p>
      {error ? (
        <p role="alert" className="mt-2 text-body-sm text-critical-ink">
          <ApiErrorText error={error} />
        </p>
      ) : null}
    </div>
  );
}

/** Settings card for the profile photo that photo templates (Portrait, Portfolio) show. */
export function ProfilePhotoCard() {
  return (
    <Card aria-labelledby="photo-title">
      <CardHeader
        id="photo-title"
        title="Profile photo"
        description="Optional. Shown only by photo templates such as Portrait and Portfolio. Common in India, Europe and the Gulf; many other employers prefer none."
      />
      <PhotoUploader />
    </Card>
  );
}
