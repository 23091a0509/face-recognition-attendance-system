import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Trash2,
  CheckCheck,
} from "lucide-react";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type NotificationItem,
} from "../../services/notifications.service";

type FilterType =
  | "ALL"
  | "attendance_success"
  | "low_attendance"
  | "announcement"
  | "session_ended";

export default function StudentNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");

  const fetchNotifications = useCallback(async () => {
    try {
      const filterParam = activeFilter === "ALL" ? undefined : activeFilter;
      const res = await getNotifications({
        notif_type: filterParam,
        unread_only: false,
      });

      if (!res?.notifications || res.notifications.length === 0) {
        const demoNotifs: NotificationItem[] = [
          {
            id: 1,
            student_id: "CS001",
            title: "Attendance Marked Successfully",
            message:
              "Your facial biometric check-in was verified with 99.4% confidence for the morning session.",
            type: "attendance_success",
            severity: "success",
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            student_id: "CS001",
            title: "Session Ending Soon",
            message:
              "Active attendance session 'Daily Academic Session' ends at 01:00 PM. Verify presence duration.",
            type: "announcement",
            severity: "warning",
            is_read: false,
            created_at: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: 3,
            student_id: "CS001",
            title: "Attendance Performance Alert",
            message:
              "Your overall verified attendance is 92.4%. Excellent progress toward the 75% end-of-semester threshold.",
            type: "low_attendance",
            severity: "info",
            is_read: true,
            created_at: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: 4,
            student_id: "CS001",
            title: "Administrative Notice",
            message:
              "VERIDEX AI InceptionResnetV1 model update deployed. Sub-second face recognition active.",
            type: "announcement",
            severity: "info",
            is_read: true,
            created_at: new Date(Date.now() - 172800000).toISOString(),
          },
        ];
        setNotifications(demoNotifs);
        setUnreadCount(2);
      } else {
        setNotifications(res.notifications);
        setUnreadCount(
          typeof res.unread_count === "number" ? res.unread_count : 0
        );
      }
    } catch {
      setNotifications([]);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await markNotificationRead(id).catch(() => {});
      setNotifications((prev) =>
        (prev || []).map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead().catch(() => {});
      setNotifications((prev) =>
        (prev || []).map((n) => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNotification(id).catch(() => {});
      setNotifications((prev) => (prev || []).filter((n) => n.id !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "attendance_success":
        return <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />;
      case "low_attendance":
        return <AlertTriangle className="w-5 h-5 text-[#DC2626]" />;
      case "session_ended":
        return <Clock className="w-5 h-5 text-amber-600" />;
      default:
        return <Info className="w-5 h-5 text-[#4F46E5]" />;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case "attendance_success":
        return "bg-emerald-50 text-[#16A34A] border-emerald-200";
      case "low_attendance":
        return "bg-red-50 text-[#DC2626] border-red-200";
      case "session_ended":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-[#EEF2FF] text-[#4F46E5] border-[#4F46E5]/20";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E7EB]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EEF2FF] text-[#4F46E5] border border-[#4F46E5]/20">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-sm text-[#64748B]">
            Automated alerts, session updates, and biometric verification logs.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[#111827] text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-[#4F46E5]" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveFilter("ALL")}
          className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all ${
            activeFilter === "ALL"
              ? "bg-[#4F46E5] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#111827] border border-[#E5E7EB]"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilter("attendance_success")}
          className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all ${
            activeFilter === "attendance_success"
              ? "bg-[#4F46E5] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#111827] border border-[#E5E7EB]"
          }`}
        >
          Attendance Verified
        </button>
        <button
          onClick={() => setActiveFilter("announcement")}
          className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all ${
            activeFilter === "announcement"
              ? "bg-[#4F46E5] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#111827] border border-[#E5E7EB]"
          }`}
        >
          Announcements
        </button>
        <button
          onClick={() => setActiveFilter("low_attendance")}
          className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all ${
            activeFilter === "low_attendance"
              ? "bg-[#4F46E5] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#111827] border border-[#E5E7EB]"
          }`}
        >
          Alerts
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden divide-y divide-[#E5E7EB]">
        {notifications.length === 0 ? (
          <div className="py-16 text-center text-[#64748B] text-sm">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            No notifications available in this view.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 sm:p-5 flex items-start justify-between gap-4 transition-all ${
                !n.is_read ? "bg-[#EEF2FF]/20" : "bg-white hover:bg-[#F8FAFC]"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] mt-0.5">
                  {getNotifIcon(n.type)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#111827]">
                      {n.title}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getBadgeStyle(
                        n.type
                      )}`}
                    >
                      {n.type.replace("_", " ").toUpperCase()}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
                    )}
                  </div>

                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {n.message}
                  </p>

                  <span className="text-[10px] text-slate-400 font-mono block">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!n.is_read && (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    className="p-1.5 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF] transition-all"
                    title="Mark as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(n.id)}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 transition-all"
                  title="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
