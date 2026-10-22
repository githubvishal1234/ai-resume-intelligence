import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "@/services/apiClient";

const PHOTO = "/account/photo";
const key = ["account", "photo"] as const;

/** The signed-in user's photo as a Blob, or null when none is uploaded. */
async function fetchPhoto(): Promise<Blob | null> {
  const response = await fetch(`/api/v1${PHOTO}`, { credentials: "include" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load the photo.");
  return response.blob();
}

/** An object URL for the user's photo (null when there is none), revoked when it changes. */
export function useProfilePhoto() {
  const photo = useQuery({ queryKey: key, queryFn: fetchPhoto, staleTime: Infinity });
  const url = useMemo(() => (photo.data ? URL.createObjectURL(photo.data) : null), [photo.data]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return { url, isPending: photo.isPending };
}

export function useUploadPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.put<void>(PHOTO, form);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useRemovePhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(PHOTO),
    onSuccess: () => client.setQueryData(key, null),
  });
}
