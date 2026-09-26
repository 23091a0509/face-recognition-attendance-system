import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    type NotificationItem,
} from "../../services/notifications.service";

type FilterType = "ALL" | "attendance_success" | "low_attendance" | "announcement" | "correction";

export default function StudentNotificationsPage() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");
    const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
    const [actionId, setActionId] = useState<number | null>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const filterParam = activeFilter === "ALL" ? undefined : activeFilter;
            const res = await getNotifications({
                notif_type: filterParam,
                unread_only: unreadOnly,
            });
            setNotifications(Array.isArray(res?.notifications) ? res.notifications : []);
            setUnreadCount(typeof res?.unread_count === "number" ? res.unread_count : 0);
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to load notifications.");
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    }, [activeFilter, unreadOnly]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleMarkAsRead = async (id: number) => {
        try {
            setActionId(id);
            await markNotificationRead(id);
            setNotifications((prev) =>
                (prev || []).map((n) => (n.id === id ? { ...n, is_read: true } : n))
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch (err) {
            console.error("Error marking read:", err);
        } finally {
            setActionId(null);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsRead();
            setNotifications((prev) => (prev || []).map((n) => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error("Error marking all read:", err);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            setActionId(id);
            await deleteNotification(id);
            setNotifications((prev) => (prev || []).filter((n) => n.id !== id));
        } catch (err) {
            console.error("Error deleting notification:", err);
        } finally {
            setActionId(null);
        }
    };

    const getTypeMeta = (type: string) => {
        switch (type) {
            case "attendance_success":
                return {
                    label: "Attendance Marked",
                    icon: "✅",
                    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                    borderHighlight: "border-l-4 border-l-emerald-500",
                };
            case "low_attendance":
                return {
                    label: "Low-Attendance Warning",
                    icon: "⚠️",
                    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                    borderHighlight: "border-l-4 border-l-amber-500",
                };
            case "announcement":
                return {
                    label: "Official Announcement",
                    icon: "📢",
                    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
                    borderHighlight: "border-l-4 border-l-purple-500",
                };
            case "correction":
                return {
                    label: "Attendance Correction",
                    icon: "✏️",
                    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                    borderHighlight: "border-l-4 border-l-cyan-500",
                };
            default:
                return {
                    label: "Notification",
                    icon: "🔔",
                    badgeColor: "bg-slate-700 text-slate-300 border-slate-600",
                    borderHighlight: "border-l-4 border-l-slate-500",
                };
        }
    };

    // Safe array guarantee to avoid undefined.length crashes
    const safeNotifications = Array.isArray(notifications) ? notifications : [];
    const attendanceCount = safeNotifications.filter((n) => n && n.type === "attendance_success").length;
    const warningCount = safeNotifications.filter((n) => n && n.type === "low_attendance").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-emerald-500/20">
                            <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                Notifications Center
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-black shadow-md shadow-emerald-500/30 animate-pulse">
                                        {unreadCount} New
                                    </span>
                                )}
                            </h1>
                            <p className="text-xs text-slate-400">
                                Live attendance receipts, policy warnings, administrator announcements & record corrections
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-all shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Mark all as read</span>
                        </button>
                    )}
                    <button
                        onClick={fetchNotifications}
                        disabled={loading}
                        className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                        title="Refresh notifications"
                    >
                        <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400">Total Alerts</p>
                        <p className="text-xl font-bold text-white mt-0.5">{safeNotifications.length}</p>
                    </div>
                    <span className="text-xl">🔔</span>
                </div>
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400">Unread</p>
                        <p className="text-xl font-bold text-emerald-400 mt-0.5">{unreadCount}</p>
                    </div>
                    <span className="text-xl">⚡</span>
                </div>
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400">Attendance Logged</p>
                        <p className="text-xl font-bold text-teal-400 mt-0.5">{attendanceCount}</p>
                    </div>
                    <span className="text-xl">✅</span>
                </div>
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400">Warnings</p>
                        <p className="text-xl font-bold text-amber-400 mt-0.5">{warningCount}</p>
                    </div>
                    <span className="text-xl">⚠️</span>
                </div>
            </div>

            {/* Filter Tabs & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0b1120] border border-slate-800 rounded-xl p-2">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    <button
                        onClick={() => setActiveFilter("ALL")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeFilter === "ALL"
                                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                    >
                        All Alerts
                    </button>
                    <button
                        onClick={() => setActiveFilter("attendance_success")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeFilter === "attendance_success"
                                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                    >
                        ✅ Attendance Marked
                    </button>
                    <button
                        onClick={() => setActiveFilter("low_attendance")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeFilter === "low_attendance"
                                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                    >
                        ⚠️ Warnings
                    </button>
                    <button
                        onClick={() => setActiveFilter("announcement")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeFilter === "announcement"
                                ? "bg-purple-500 text-white shadow-md shadow-purple-500/20"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                    >
                        📢 Announcements
                    </button>
                    <button
                        onClick={() => setActiveFilter("correction")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeFilter === "correction"
                                ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                    >
                        ✏️ Corrections
                    </button>
                </div>

                <div className="flex items-center gap-2 pl-2 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={unreadOnly}
                            onChange={(e) => setUnreadOnly(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                        />
                        <span>Unread only</span>
                    </label>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    {error}
                </div>
            )}

            {/* Notifications List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                    <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-mono">Loading notifications...</p>
                </div>
            ) : safeNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-[#0b1120] border border-slate-800 rounded-2xl text-center">
                    <div className="h-16 w-16 rounded-full bg-slate-800/80 flex items-center justify-center text-3xl mb-3 shadow-inner">
                        🎉
                    </div>
                    <h3 className="text-base font-bold text-white mb-1">No notifications to display</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                        {unreadOnly
                            ? "You have caught up with all your notifications!"
                            : "Attendance logs, warnings, and institutional announcements will appear here."}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {safeNotifications.map((item) => {
                        if (!item) return null;
                        const meta = getTypeMeta(item.type);
                        return (
                            <div
                                key={item.id}
                                className={`group relative bg-[#0b1120] border ${
                                    item.is_read
                                        ? "border-slate-800/80 opacity-85"
                                        : "border-slate-700 bg-slate-900/40 shadow-lg"
                                } ${meta.borderHighlight} rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:border-slate-600`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="text-2xl flex-shrink-0 mt-0.5">{meta.icon}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span
                                                    className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md border ${meta.badgeColor}`}
                                                >
                                                    {meta.label}
                                                </span>

                                                {!item.is_read && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                        New
                                                    </span>
                                                )}

                                                <span className="text-[11px] text-slate-400 font-mono">
                                                    {item.created_at}
                                                </span>
                                            </div>

                                            <h2 className="text-sm sm:text-base font-bold text-white mb-1.5 leading-snug">
                                                {item.title}
                                            </h2>

                                            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed break-words">
                                                {item.message}
                                            </p>

                                            {/* Action Link & Metadata Badge */}
                                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                                {item.action_url && (
                                                    <Link
                                                        to={item.action_url}
                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                                                    >
                                                        <span>View Details</span>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                        </svg>
                                                    </Link>
                                                )}

                                                {item.metadata && (
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">
                                                        {item.metadata.confidence && (
                                                            <span>Match: {item.metadata.confidence}%</span>
                                                        )}
                                                        {item.metadata.current_rate && (
                                                            <span>Rate: {item.metadata.current_rate}%</span>
                                                        )}
                                                        {item.metadata.priority && (
                                                            <span className="uppercase text-amber-400 font-bold">
                                                                {item.metadata.priority}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions (Mark Read, Delete) */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {!item.is_read && (
                                            <button
                                                onClick={() => handleMarkAsRead(item.id)}
                                                disabled={actionId === item.id}
                                                title="Mark as read"
                                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            disabled={actionId === item.id}
                                            title="Dismiss notification"
                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
