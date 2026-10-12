import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useUnreadCount } from "@/hooks/useApplications";

export function NotificationBell() {
  const unread = useUnreadCount().data ?? 0;
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      to="/notifications"
      aria-label={label}
      title={label}
      className="relative rounded-control p-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
    >
      <Bell className="size-5" aria-hidden />
      {unread ? (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-4 text-on-primary"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
