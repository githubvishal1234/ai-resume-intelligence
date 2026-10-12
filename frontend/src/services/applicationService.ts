import type { components } from "@/types/api";
import { api } from "./apiClient";

type S = components["schemas"];

export type ApplicationStatus = S["ApplicationSummaryOut"]["status"];
export type ApplicationSummary = Omit<Required<S["ApplicationSummaryOut"]>, "job_title" | "resume_title"> & {
  job_title: string | null;
  resume_title: string | null;
};
export type ApplicationEvent = S["ApplicationEventOut"];
export type ApplicationDetail = ApplicationSummary & { notes: string; events: ApplicationEvent[] };
export type Notification = S["NotificationOut"];

/** What the forms send. Empty strings mean "not set". */
export type ApplicationInput = {
  company: string;
  role: string;
  url: string;
  job_id: string;
  resume_id: string;
  resume_version: number | null;
  status: ApplicationStatus;
  applied_on: string;
  follow_up_on: string;
  notes: string;
};

export const STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const CLOSED: ReadonlySet<ApplicationStatus> = new Set(["accepted", "rejected", "withdrawn"]);

function summary(a: S["ApplicationSummaryOut"]): ApplicationSummary {
  return { ...a, job_title: a.job_title ?? null, resume_title: a.resume_title ?? null };
}

function detail(a: S["ApplicationDetailOut"]): ApplicationDetail {
  return { ...summary(a), notes: a.notes, events: a.events };
}

function body(input: ApplicationInput) {
  const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    company: input.company.trim(),
    role: input.role.trim(),
    url: orNull(input.url),
    job_id: orNull(input.job_id),
    resume_id: orNull(input.resume_id),
    resume_version: input.resume_id ? input.resume_version : null,
    status: input.status,
    applied_on: orNull(input.applied_on),
    follow_up_on: orNull(input.follow_up_on),
    notes: input.notes,
  };
}

export const applicationService = {
  list: async () => (await api.get<S["ApplicationSummaryOut"][]>("/applications")).map(summary),
  get: async (id: string) => detail(await api.get<S["ApplicationDetailOut"]>(`/applications/${id}`)),
  create: async (input: ApplicationInput) =>
    detail(await api.post<S["ApplicationDetailOut"]>("/applications", body(input))),
  update: async (id: string, input: ApplicationInput) =>
    detail(await api.patch<S["ApplicationDetailOut"]>(`/applications/${id}`, body(input))),
  setStatus: async (id: string, status: ApplicationStatus) =>
    detail(await api.patch<S["ApplicationDetailOut"]>(`/applications/${id}`, { status })),
  addNote: async (id: string, note: string) =>
    detail(await api.post<S["ApplicationDetailOut"]>(`/applications/${id}/notes`, { note })),
  remove: (id: string) => api.delete<void>(`/applications/${id}`),
};

export const notificationService = {
  list: () => api.get<Notification[]>("/notifications"),
  unread: async () => (await api.get<S["UnreadCountOut"]>("/notifications/unread-count")).unread,
  markRead: (id: string) => api.post<Notification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>("/notifications/read-all"),
};
