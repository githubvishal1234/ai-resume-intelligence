import type { components } from "@/types/api";
import { api } from "./apiClient";

export type JobSearch = components["schemas"]["JobSearchOut"];
export type JobListing = components["schemas"]["JobListingOut"];
export type JobSearchParams = { resumeId: string; what?: string; where?: string; page: number };

export const jobSearchService = {
  /** Live openings for a resume. `what`/`where` left out = the resume's own title and city. */
  search: ({ resumeId, what, where, page }: JobSearchParams) => {
    const query = new URLSearchParams({ page: String(page) });
    if (what !== undefined) query.set("what", what);
    if (where !== undefined) query.set("where", where);
    return api.get<JobSearch>(`/resumes/${resumeId}/jobs?${query}`);
  },
};
