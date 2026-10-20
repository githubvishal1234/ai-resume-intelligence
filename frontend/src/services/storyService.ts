import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type Story = S["StoryOut"];
export type Theme = Story["themes"][number];
export type StorySuggestion = S["StorySuggestionOut"];
/** Only the title is required; the API fills the other parts with empty defaults. */
export type StoryDraft = Partial<S["StoryIn"]> & Pick<S["StoryIn"], "title">;
export type StoryPatch = S["StoryPatch"];

export const THEMES: { id: Theme; label: string; prompt: string }[] = [
  { id: "conflict", label: "Conflict", prompt: "A disagreement you worked through" },
  { id: "failure", label: "Setback", prompt: "Something that went wrong and what you learned" },
  { id: "priorities", label: "Priorities", prompt: "Choosing what to do when everything was urgent" },
  { id: "leadership", label: "Leadership", prompt: "Leading or growing other people" },
  { id: "impact", label: "Impact", prompt: "A measurable result you drove" },
  { id: "technical", label: "Technical depth", prompt: "A hard technical problem you solved" },
  { id: "ownership", label: "Ownership", prompt: "Something you started or owned end to end" },
  { id: "collaboration", label: "Collaboration", prompt: "Working across teams" },
];

export const storyService = {
  list: () => api.get<Story[]>("/stories"),
  suggestions: () => api.get<S["StorySuggestionsOut"]>("/stories/suggestions"),
  create: (body: StoryDraft) => api.post<Story>("/stories", body),
  update: (id: string, body: StoryPatch) => api.patch<Story>(`/stories/${id}`, body),
  remove: (id: string) => api.delete<void>(`/stories/${id}`),
};
