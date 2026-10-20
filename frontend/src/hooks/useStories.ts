import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storyService, type StoryDraft, type StoryPatch } from "@/services/storyService";

export const storyKeys = {
  all: ["stories"] as const,
  list: () => [...storyKeys.all, "list"] as const,
  suggestions: () => [...storyKeys.all, "suggestions"] as const,
};

export function useStories() {
  return useQuery({ queryKey: storyKeys.list(), queryFn: storyService.list });
}

export function useStorySuggestions() {
  return useQuery({ queryKey: storyKeys.suggestions(), queryFn: storyService.suggestions });
}

function useRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: storyKeys.all });
}

export function useCreateStory() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body: StoryDraft) => storyService.create(body), onSuccess: refresh });
}

export function useUpdateStory() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...body }: StoryPatch & { id: string }) => storyService.update(id, body),
    onSuccess: refresh,
  });
}

export function useDeleteStory() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => storyService.remove(id), onSuccess: refresh });
}
