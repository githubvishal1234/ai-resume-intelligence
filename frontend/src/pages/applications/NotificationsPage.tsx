import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/hooks/useApplications";
import { cn } from "@/lib/cn";
import { formatDate, PageHeader } from "@/pages/resumes/common";

export function NotificationsPage() {
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  if (list.isPending) return <PageLoading label="Loading notifications" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const unread = list.data.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Follow-up reminders for your applications."
        actions={
          unread ? (
            <Button
              variant="secondary"
              loading={markAll.isPending}
              icon={<CheckCheck className="size-4" aria-hidden />}
              onClick={() => markAll.mutate()}
            >
              Mark all as read
            </Button>
          ) : null
        }
      />
      {list.data.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-8" aria-hidden />}
          title="Nothing yet"
          description="Set a follow-up date on an application and its reminder appears here on that day."
        />
      ) : (
        <ul className="space-y-3">
          {list.data.map((n) => (
            <li key={n.id}>
              <Card className={cn("relative", n.read_at ? "opacity-80" : "border-primary")}>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn("mt-2 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")}
                  />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => (n.read_at ? undefined : markRead.mutate(n.id))}
                        className="text-label-md text-on-surface after:absolute after:inset-0 hover:text-primary"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-label-md text-on-surface">{n.title}</p>
                    )}
                    <p className="text-body-md text-on-surface-variant">{n.body}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {formatDate(n.created_at)}
                      {n.read_at ? "" : " · Unread"}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
