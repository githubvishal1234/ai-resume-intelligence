import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coverLetterService, type Letter, type LetterPatch } from "@/services/coverLetterService";

export const letterKeys = {
  all: ["cover-letters"] as const,
  list: () => [...letterKeys.all, "list"] as const,
  detail: (id: string) => [...letterKeys.all, "detail", id] as const,
};

export function useLetterList() {
  return useQuery({ queryKey: letterKeys.list(), queryFn: coverLetterService.list });
}

export function useLetter(id: string) {
  return useQuery({ queryKey: letterKeys.detail(id), queryFn: () => coverLetterService.get(id) });
}

function useSettle() {
  const client = useQueryClient();
  return (letter: Letter) => {
    client.setQueryData(letterKeys.detail(letter.id), letter);
    void client.invalidateQueries({ queryKey: letterKeys.list() });
  };
}

export function useCreateLetter() {
  const settle = useSettle();
  return useMutation({ mutationFn: coverLetterService.create, onSuccess: settle });
}

export function useUpdateLetter(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: (patch: LetterPatch) => coverLetterService.update(id, patch), onSuccess: settle });
}

export function useDeleteLetter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: coverLetterService.remove,
    onSuccess: () => void client.invalidateQueries({ queryKey: letterKeys.list() }),
  });
}
