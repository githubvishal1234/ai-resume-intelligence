import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applicationService,
  notificationService,
  type ApplicationDetail,
  type ApplicationInput,
  type ApplicationStatus,
} from "@/services/applicationService";

export const applicationKeys = {
  all: ["applications"] as const,
  list: () => [...applicationKeys.all, "list"] as const,
  detail: (id: string) => [...applicationKeys.all, "detail", id] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
};

export function useApplicationList() {
  return useQuery({ queryKey: applicationKeys.list(), queryFn: applicationService.list });
}

export function useApplication(id: string) {
  return useQuery({ queryKey: applicationKeys.detail(id), queryFn: () => applicationService.get(id) });
}

function useSettle() {
  const client = useQueryClient();
  return (application: ApplicationDetail) => {
    client.setQueryData(applicationKeys.detail(application.id), application);
    void client.invalidateQueries({ queryKey: applicationKeys.list() });
    // A changed follow-up date or status can add or retire a reminder.
    void client.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

export function useCreateApplication() {
  const settle = useSettle();
  return useMutation({ mutationFn: (input: ApplicationInput) => applicationService.create(input), onSuccess: settle });
}

export function useUpdateApplication(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: (input: ApplicationInput) => applicationService.update(id, input), onSuccess: settle });
}

export function useSetApplicationStatus(id: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: (status: ApplicationStatus) => applicationService.setStatus(id, status),
    onSuccess: settle,
  });
}

export function useAddApplicationNote(id: string) {
  const settle = useSettle();
  return useMutation({ mutationFn: (note: string) => applicationService.addNote(id, note), onSuccess: settle });
}

export function useDeleteApplication(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => applicationService.remove(id),
    onSuccess: () => {
      client.removeQueries({ queryKey: applicationKeys.detail(id) });
      void client.invalidateQueries({ queryKey: applicationKeys.list() });
      void client.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useNotifications() {
  return useQuery({ queryKey: notificationKeys.list(), queryFn: notificationService.list });
}

export function useUnreadCount() {
  return useQuery({ queryKey: notificationKeys.unread(), queryFn: notificationService.unread, refetchInterval: 60_000 });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => void client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
