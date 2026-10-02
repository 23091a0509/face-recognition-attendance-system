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
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    ),
                    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    borderHighlight: "border-l-4 border-l-emerald-600",
                };
            case "low_attendance":
                return {
                    label: "Low-Attendance Warning",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    ),
                    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
                    borderHighlight: "border-l-4 border-l-amber-500",
                };
            case "announcement":
                return {
                    label: "Official Announcement",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                    ),
                    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
                    borderHighlight: "border-l-4 border-l-purple-500",
                };
            case "correction":
                return {
                    label: "Attendance Correction",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                    ),
                    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
                    borderHighlight: "border-l-4 border-l-cyan-600",
                };
            default:
                return {
                    label: "Notification",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                    ),
                    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
                    borderHighlight: "border-l-4 border-l-slate-400",
                };
        }
    };

    const safeNotifications = Array.isArray(notifications) ? notifications : [];
    const attendanceCount = safeNotifications.filter((n) => n && n.type === "attendance_success").length;
    const warningCount = safeNotifications.filter((n) => n && n.type === "low_attendance").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-sm">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                                Notifications Center
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {unreadCount} New
                                    </span>
                                )}
                            </h1>
                            <p className="text-xs text-slate-500">
                                Live attendance receipts, policy warnings, administrator announcements & record corrections
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
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
                        className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
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
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-500">Total Alerts</p>
                        <p className="text-xl font-black text-slate-900 mt-0.5">{safeNotifications.length}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-500">Unread</p>
                        <p className="text-xl font-black text-emerald-700 mt-0.5">{unreadCount}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-500">Attendance Logged</p>
                        <p className="text-xl font-black text-teal-700 mt-0.5">{attendanceCount}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-500">Warnings</p>
                        <p className="text-xl font-black text-amber-700 mt-0.5">{warningCount}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Filter Tabs & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    <button
                        onClick={() => setActiveFilter("ALL")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            activeFilter === "ALL"
                                ? "bg-emerald-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        All Alerts
                    </button>
                    <button
                        onClick={() => setActiveFilter("attendance_success")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            activeFilter === "attendance_success"
                                ? "bg-emerald-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Attendance Marked</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("low_attendance")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            activeFilter === "low_attendance"
                                ? "bg-amber-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Warnings</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("announcement")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            activeFilter === "announcement"
                                ? "bg-purple-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                        </svg>
                        <span>Announcements</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("correction")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            activeFilter === "correction"
                                ? "bg-cyan-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>Corrections</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 pl-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={unreadOnly}
                            onChange={(e) => setUnreadOnly(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Unread only</span>
                    </label>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {error}
                </div>
            )}

            {/* Notifications List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                    <div className="h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-mono">Loading notifications...</p>
                </div>
            ) : safeNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-slate-200 rounded-2xl text-center shadow-sm">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-3 shadow-xs">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">No notifications to display</h3>
                    <p className="text-xs text-slate-500 max-w-sm">
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
                                className={`group relative bg-white border ${
                                    item.is_read
                                        ? "border-slate-200 opacity-90 shadow-xs"
                                        : "border-emerald-300 bg-emerald-50/20 shadow-sm"
                                } ${meta.borderHighlight} rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:shadow-md`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                        <div className="flex-shrink-0 mt-0.5">{meta.icon}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span
                                                    className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md border ${meta.badgeColor}`}
                                                >
                                                    {meta.label}
                                                </span>

                                                {!item.is_read && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                                        New
                                                    </span>
                                                )}

                                                <span className="text-[11px] text-slate-500 font-mono">
                                                    {item.created_at}
                                                </span>
                                            </div>

                                            <h2 className="text-sm sm:text-base font-bold text-slate-900 mb-1.5 leading-snug">
                                                {item.title}
                                            </h2>

                                            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-words">
                                                {item.message}
                                            </p>

                                            {/* Action Link & Metadata Badge */}
                                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                                {item.action_url && (
                                                    <Link
                                                        to={item.action_url}
                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                                                    >
                                                        <span>View Details</span>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                        </svg>
                                                    </Link>
                                                )}

                                                {item.metadata && (
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                                                        {item.metadata.confidence && (
                                                            <span>Match: {item.metadata.confidence}%</span>
                                                        )}
                                                        {item.metadata.current_rate && (
                                                            <span>Rate: {item.metadata.current_rate}%</span>
                                                        )}
                                                        {item.metadata.priority && (
                                                            <span className="uppercase text-amber-700 font-bold">
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
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer border border-slate-200"
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
                                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-700 transition-colors cursor-pointer border border-slate-200"
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
