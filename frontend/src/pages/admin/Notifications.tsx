import { useState, useEffect, useCallback } from "react";
import {
    getNotifications,
    broadcastAnnouncement,
    triggerLowAttendanceCheck,
    sendAttendanceCorrection,
    deleteNotification,
    type NotificationItem,
} from "../../services/notifications.service";
import { getAllStudents, type Student } from "../../services/students";

export default function AdminNotificationsPage() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [successMsg, setSuccessMsg] = useState<string>("");
    const [activeTab, setActiveTab] = useState<"LOGS" | "ANNOUNCE" | "AUDIT" | "CORRECT">("LOGS");

    // Announcement Form State
    const [announcementTitle, setAnnouncementTitle] = useState("");
    const [announcementMsg, setAnnouncementMsg] = useState("");
    const [recipientType, setRecipientType] = useState<"ALL" | "STUDENT">("ALL");
    const [selectedStudent, setSelectedStudent] = useState("");
    const [priority, setPriority] = useState<"normal" | "high">("normal");
    const [submittingAnnounce, setSubmittingAnnounce] = useState(false);

    // Audit State
    const [threshold, setThreshold] = useState<number>(75.0);
    const [auditing, setAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<string | null>(null);

    // Correction Form State
    const [corrStudentId, setCorrStudentId] = useState("");
    const [corrDate, setCorrDate] = useState(new Date().toISOString().split("T")[0]);
    const [corrStatus, setCorrStatus] = useState("Present");
    const [corrNote, setCorrNote] = useState("Record verified and updated by administrator");
    const [submittingCorr, setSubmittingCorr] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const [notifRes, studentList] = await Promise.all([
                getNotifications(),
                getAllStudents(),
            ]);
            setNotifications(Array.isArray(notifRes?.notifications) ? notifRes.notifications : []);
            setUnreadCount(typeof notifRes?.unread_count === "number" ? notifRes.unread_count : 0);
            setStudents(Array.isArray(studentList) ? studentList : []);
            if (studentList && studentList.length > 0) {
                setSelectedStudent(studentList[0].student_id);
                setCorrStudentId(studentList[0].student_id);
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to load data.");
            setNotifications([]);
            setStudents([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!announcementTitle.trim() || !announcementMsg.trim()) {
            setError("Please fill in both title and message.");
            return;
        }

        try {
            setSubmittingAnnounce(true);
            setError("");
            setSuccessMsg("");
            const recipient = recipientType === "ALL" ? "ALL" : selectedStudent;
            await broadcastAnnouncement({
                title: announcementTitle.trim(),
                message: announcementMsg.trim(),
                recipient,
                priority,
            });
            setSuccessMsg(`Announcement broadcasted to ${recipient} successfully!`);
            setAnnouncementTitle("");
            setAnnouncementMsg("");
            setActiveTab("LOGS");
            loadData();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to broadcast announcement.");
        } finally {
            setSubmittingAnnounce(false);
        }
    };

    const handleRunAudit = async () => {
        try {
            setAuditing(true);
            setError("");
            setAuditResult(null);
            const res = await triggerLowAttendanceCheck(threshold);
            setAuditResult(res.message);
            loadData();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to run audit.");
        } finally {
            setAuditing(false);
        }
    };

    const handleSendCorrection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!corrStudentId || !corrDate) {
            setError("Student ID and Date are required.");
            return;
        }

        try {
            setSubmittingCorr(true);
            setError("");
            setSuccessMsg("");
            await sendAttendanceCorrection({
                student_id: corrStudentId,
                date: corrDate,
                status: corrStatus,
                note: corrNote,
            });
            setSuccessMsg(`Correction notification dispatched to ${corrStudentId}!`);
            setActiveTab("LOGS");
            loadData();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to send correction notification.");
        } finally {
            setSubmittingCorr(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteNotification(id);
            setNotifications((prev) => (prev || []).filter((n) => n.id !== id));
        } catch (err) {
            console.error("Delete error:", err);
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
                    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
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
                    color: "text-amber-700 bg-amber-50 border-amber-200",
                };
            case "announcement":
                return {
                    label: "Announcement",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                    ),
                    color: "text-purple-700 bg-purple-50 border-purple-200",
                };
            case "correction":
                return {
                    label: "Record Correction",
                    icon: (
                        <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                    ),
                    color: "text-blue-700 bg-blue-50 border-blue-200",
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
                    color: "text-slate-700 bg-slate-100 border-slate-200",
                };
        }
    };

    const safeNotifications = Array.isArray(notifications) ? notifications : [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-sm">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                            Notifications & Broadcast Station
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    {unreadCount} Unread
                                </span>
                            )}
                        </h1>
                        <p className="text-xs text-slate-500">
                            Broadcast announcements, run low-attendance policy audits, and dispatch attendance correction alerts
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
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

            {/* Notification Feature Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                <button
                    onClick={() => { setActiveTab("LOGS"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] ${
                        activeTab === "LOGS"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Notification Logs</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 font-mono">
                        {safeNotifications.length}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveTab("ANNOUNCE"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] ${
                        activeTab === "ANNOUNCE"
                            ? "bg-purple-600 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    <span>Broadcast Announcement</span>
                </button>

                <button
                    onClick={() => { setActiveTab("AUDIT"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] ${
                        activeTab === "AUDIT"
                            ? "bg-amber-600 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Low-Attendance Audit</span>
                </button>

                <button
                    onClick={() => { setActiveTab("CORRECT"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] ${
                        activeTab === "CORRECT"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Attendance Correction</span>
                </button>
            </div>

            {/* Status Messages */}
            {successMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center justify-between animate-fade-in shadow-xs">
                    <span>{successMsg}</span>
                    <button onClick={() => setSuccessMsg("")} className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5" aria-label="Dismiss">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between animate-fade-in shadow-xs">
                    <span>{error}</span>
                    <button onClick={() => setError("")} className="text-rose-700 hover:text-rose-900 cursor-pointer p-0.5" aria-label="Dismiss">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* TAB 1: NOTIFICATION LOGS */}
            {activeTab === "LOGS" && (
                <div className="space-y-4">
                    {loading ? (
                        <div className="py-16 text-center text-slate-500 text-xs font-mono">
                            Loading notification records...
                        </div>
                    ) : safeNotifications.length === 0 ? (
                        <div className="py-16 bg-white border border-slate-200 rounded-2xl text-center shadow-sm flex flex-col items-center justify-center">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3 shadow-xs">
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                            </div>
                            <p className="text-sm font-bold text-slate-900">No notifications recorded yet</p>
                            <p className="text-xs text-slate-500 mt-1">Use the tabs above to broadcast announcements or run an attendance check.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {safeNotifications.map((item) => {
                                if (!item) return null;
                                const meta = getTypeMeta(item.type);
                                return (
                                    <div
                                        key={item.id}
                                        className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 sm:p-5 transition-all shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                                <div className="flex-shrink-0 mt-0.5">{meta.icon}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${meta.color}`}>
                                                            {meta.label}
                                                        </span>
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                                                            To: <strong className="text-slate-900">{item.student_id || "ALL"}</strong>
                                                        </span>
                                                        <span className="text-[11px] text-slate-500 font-mono">
                                                            {item.created_at}
                                                        </span>
                                                    </div>

                                                    <h2 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                                                        {item.title}
                                                    </h2>

                                                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                                                        {item.message}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                title="Delete record"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: BROADCAST ANNOUNCEMENT */}
            {activeTab === "ANNOUNCE" && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                        <span>Broadcast Official Announcement</span>
                    </h2>
                    <p className="text-xs text-slate-500 mb-6">
                        Dispatches push notifications and alerts directly to students' Notifications Center.
                    </p>

                    <form onSubmit={handleBroadcast} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Recipient Audience
                            </label>
                            <div className="flex items-center gap-4 mb-2">
                                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="recipientType"
                                        checked={recipientType === "ALL"}
                                        onChange={() => setRecipientType("ALL")}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>All Students (Institutional Broadcast)</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="recipientType"
                                        checked={recipientType === "STUDENT"}
                                        onChange={() => setRecipientType("STUDENT")}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Specific Student</span>
                                </label>
                            </div>

                            {recipientType === "STUDENT" && (
                                <select
                                    value={selectedStudent}
                                    onChange={(e) => setSelectedStudent(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                >
                                    {students.map((s) => (
                                         <option key={s.student_id} value={s.student_id}>
                                             {s.name} ({s.student_id}) - {s.department || "General"}
                                         </option>
                                     ))}
                                 </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Announcement Title
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Midterm Attendance & Exam Entry Policy"
                                value={announcementTitle}
                                onChange={(e) => setAnnouncementTitle(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Message Details
                            </label>
                            <textarea
                                rows={4}
                                placeholder="Write the complete notification message..."
                                value={announcementMsg}
                                onChange={(e) => setAnnouncementMsg(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Priority Level
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as "normal" | "high")}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                            >
                                <option value="normal">Normal Notice</option>
                                <option value="high">Urgent / Important Alert</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={submittingAnnounce}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm cursor-pointer active:scale-[0.98]"
                        >
                            {submittingAnnounce ? "Broadcasting..." : "Send Announcement"}
                        </button>
                    </form>
                </div>
            )}

            {/* TAB 3: LOW-ATTENDANCE AUDIT */}
            {activeTab === "AUDIT" && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <span>Automated Low-Attendance Policy Audit</span>
                    </h2>
                    <p className="text-xs text-slate-500 mb-6">
                        Scans biometric records for all enrolled students. Automatically generates personalized warning notifications for any student below the institutional threshold.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Minimum Required Attendance Rate (%)
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="10"
                                    max="100"
                                    step="1"
                                    value={threshold}
                                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                    className="w-32 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-mono font-medium transition-colors"
                                />
                                <span className="text-xs text-slate-500 font-mono">
                                    Standard academic policy: <strong>75%</strong>
                                </span>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 leading-relaxed flex items-start gap-2.5">
                            <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <strong>Smart Anti-Spam:</strong> The system ensures only 1 warning is generated per student per day, preventing multiple duplicate alerts for the same evaluation period.
                            </div>
                        </div>

                        {auditResult && (
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono">
                                {auditResult}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleRunAudit}
                            disabled={auditing}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                        >
                            {auditing ? (
                                <>
                                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Auditing Attendance Records...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span>Run Attendance Audit & Send Warnings</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 4: ATTENDANCE CORRECTION NOTIFICATION */}
            {activeTab === "CORRECT" && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                        <span>Dispatch Attendance Correction Notice</span>
                    </h2>
                    <p className="text-xs text-slate-500 mb-6">
                        Inform a student that their attendance record for a specific date has been manually adjusted or verified.
                    </p>

                    <form onSubmit={handleSendCorrection} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Target Student
                            </label>
                            <select
                                value={corrStudentId}
                                onChange={(e) => setCorrStudentId(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                            >
                                {students.map((s) => (
                                    <option key={s.student_id} value={s.student_id}>
                                        {s.name} ({s.student_id}) - {s.department || "General"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Session Date
                            </label>
                            <input
                                type="date"
                                value={corrDate}
                                onChange={(e) => setCorrDate(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Adjusted Status
                            </label>
                            <select
                                value={corrStatus}
                                onChange={(e) => setCorrStatus(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                            >
                                <option value="Present (Verified)">Present (Verified)</option>
                                <option value="Excused Leave">Excused Leave</option>
                                <option value="Medical Exemption">Medical Exemption</option>
                                <option value="Absent (Manual Adjustment)">Absent (Manual Adjustment)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Administrative Note
                            </label>
                            <textarea
                                rows={3}
                                value={corrNote}
                                onChange={(e) => setCorrNote(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                                placeholder="Explain reason for modification..."
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submittingCorr}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                        >
                            {submittingCorr ? "Dispatching..." : "Send Correction Alert"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
