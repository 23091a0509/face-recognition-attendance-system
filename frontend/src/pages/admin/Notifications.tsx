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
                return { label: "Attendance Marked", icon: "✅", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" };
            case "low_attendance":
                return { label: "Low-Attendance Warning", icon: "⚠️", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" };
            case "announcement":
                return { label: "Announcement", icon: "📢", color: "text-purple-400 bg-purple-500/15 border-purple-500/30" };
            case "correction":
                return { label: "Record Correction", icon: "✏️", color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30" };
            default:
                return { label: "Notification", icon: "🔔", color: "text-slate-400 bg-slate-800 border-slate-700" };
        }
    };

    const safeNotifications = Array.isArray(notifications) ? notifications : [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-emerald-500/20">
                        <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                            Notifications & Broadcast Station
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-black shadow-md shadow-emerald-500/30">
                                    {unreadCount} Unread
                                </span>
                            )}
                        </h1>
                        <p className="text-xs text-slate-400">
                            Broadcast announcements, run low-attendance policy audits, and dispatch attendance correction alerts
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                        title="Refresh notifications"
                    >
                        <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Notification Feature Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                <button
                    onClick={() => { setActiveTab("LOGS"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        activeTab === "LOGS"
                            ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                            : "bg-[#0b1120] text-slate-400 hover:text-white border border-slate-800"
                    }`}
                >
                    <span>📋 Notification Logs</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                        {safeNotifications.length}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveTab("ANNOUNCE"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        activeTab === "ANNOUNCE"
                            ? "bg-purple-500 text-white shadow-md shadow-purple-500/20"
                            : "bg-[#0b1120] text-slate-400 hover:text-white border border-slate-800"
                    }`}
                >
                    <span>📢 Broadcast Announcement</span>
                </button>

                <button
                    onClick={() => { setActiveTab("AUDIT"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        activeTab === "AUDIT"
                            ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                            : "bg-[#0b1120] text-slate-400 hover:text-white border border-slate-800"
                    }`}
                >
                    <span>⚠️ Low-Attendance Audit</span>
                </button>

                <button
                    onClick={() => { setActiveTab("CORRECT"); setError(""); setSuccessMsg(""); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        activeTab === "CORRECT"
                            ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                            : "bg-[#0b1120] text-slate-400 hover:text-white border border-slate-800"
                    }`}
                >
                    <span>✏️ Attendance Correction</span>
                </button>
            </div>

            {/* Status Messages */}
            {successMsg && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-between animate-fade-in">
                    <span>{successMsg}</span>
                    <button onClick={() => setSuccessMsg("")} className="text-emerald-300 hover:text-white">✕</button>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium flex items-center justify-between animate-fade-in">
                    <span>{error}</span>
                    <button onClick={() => setError("")} className="text-red-300 hover:text-white">✕</button>
                </div>
            )}

            {/* TAB 1: NOTIFICATION LOGS */}
            {activeTab === "LOGS" && (
                <div className="space-y-4">
                    {loading ? (
                        <div className="py-16 text-center text-slate-400 text-xs font-mono">
                            Loading notification records...
                        </div>
                    ) : safeNotifications.length === 0 ? (
                        <div className="py-16 bg-[#0b1120] border border-slate-800 rounded-2xl text-center">
                            <span className="text-3xl block mb-2">📭</span>
                            <p className="text-sm font-bold text-white">No notifications recorded yet</p>
                            <p className="text-xs text-slate-400 mt-1">Use the tabs above to broadcast announcements or run an attendance check.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {safeNotifications.map((item) => {
                                if (!item) return null;
                                const meta = getTypeMeta(item.type);
                                return (
                                    <div
                                        key={item.id}
                                        className="bg-[#0b1120] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <span className="text-2xl mt-0.5">{meta.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${meta.color}`}>
                                                            {meta.label}
                                                        </span>
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                                            To: <strong className="text-slate-200">{item.student_id || "ALL"}</strong>
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 font-mono">
                                                            {item.created_at}
                                                        </span>
                                                    </div>

                                                    <h2 className="text-sm sm:text-base font-bold text-white mb-1">
                                                        {item.title}
                                                    </h2>

                                                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                                                        {item.message}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                        <span>📢 Broadcast Official Announcement</span>
                    </h2>
                    <p className="text-xs text-slate-400 mb-6">
                        Dispatches push notifications and alerts directly to students' Notifications Center.
                    </p>

                    <form onSubmit={handleBroadcast} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Recipient Audience
                            </label>
                            <div className="flex items-center gap-4 mb-2">
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="recipientType"
                                        checked={recipientType === "ALL"}
                                        onChange={() => setRecipientType("ALL")}
                                        className="text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span>All Students (Institutional Broadcast)</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="recipientType"
                                        checked={recipientType === "STUDENT"}
                                        onChange={() => setRecipientType("STUDENT")}
                                        className="text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span>Specific Student</span>
                                </label>
                            </div>

                            {recipientType === "STUDENT" && (
                                <select
                                    value={selectedStudent}
                                    onChange={(e) => setSelectedStudent(e.target.value)}
                                    className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
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
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Announcement Title
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Midterm Attendance & Exam Entry Policy"
                                value={announcementTitle}
                                onChange={(e) => setAnnouncementTitle(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Message Details
                            </label>
                            <textarea
                                rows={4}
                                placeholder="Write the complete notification message..."
                                value={announcementMsg}
                                onChange={(e) => setAnnouncementMsg(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Priority Level
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as "normal" | "high")}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                            >
                                <option value="normal">Normal Notice</option>
                                <option value="high">Urgent / Important Alert</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={submittingAnnounce}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-purple-500/20"
                        >
                            {submittingAnnounce ? "Broadcasting..." : "Send Announcement"}
                        </button>
                    </form>
                </div>
            )}

            {/* TAB 3: LOW-ATTENDANCE AUDIT */}
            {activeTab === "AUDIT" && (
                <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                        <span>⚠️ Automated Low-Attendance Policy Audit</span>
                    </h2>
                    <p className="text-xs text-slate-400 mb-6">
                        Scans biometric records for all enrolled students. Automatically generates personalized warning notifications for any student below the institutional threshold.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                                    className="w-32 bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                                />
                                <span className="text-xs text-slate-400 font-mono">
                                    Standard academic policy: <strong>75%</strong>
                                </span>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
                            💡 <strong>Smart Anti-Spam:</strong> The system ensures only 1 warning is generated per student per day, preventing multiple duplicate alerts for the same evaluation period.
                        </div>

                        {auditResult && (
                            <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                                {auditResult}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleRunAudit}
                            disabled={auditing}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-all shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2"
                        >
                            {auditing ? (
                                <>
                                    <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                    <span>Auditing Attendance Records...</span>
                                </>
                            ) : (
                                <>
                                    <span>⚡ Run Attendance Audit & Send Warnings</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 4: ATTENDANCE CORRECTION NOTIFICATION */}
            {activeTab === "CORRECT" && (
                <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                        <span>✏️ Dispatch Attendance Correction Notice</span>
                    </h2>
                    <p className="text-xs text-slate-400 mb-6">
                        Inform a student that their attendance record for a specific date has been manually adjusted or verified.
                    </p>

                    <form onSubmit={handleSendCorrection} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Target Student
                            </label>
                            <select
                                value={corrStudentId}
                                onChange={(e) => setCorrStudentId(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                                {students.map((s) => (
                                    <option key={s.student_id} value={s.student_id}>
                                        {s.name} ({s.student_id}) - {s.department || "General"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Session Date
                            </label>
                            <input
                                type="date"
                                value={corrDate}
                                onChange={(e) => setCorrDate(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Adjusted Status
                            </label>
                            <select
                                value={corrStatus}
                                onChange={(e) => setCorrStatus(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                                <option value="Present (Verified)">Present (Verified)</option>
                                <option value="Excused Leave">Excused Leave</option>
                                <option value="Medical Exemption">Medical Exemption</option>
                                <option value="Absent (Manual Adjustment)">Absent (Manual Adjustment)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                Administrative Note
                            </label>
                            <textarea
                                rows={3}
                                value={corrNote}
                                onChange={(e) => setCorrNote(e.target.value)}
                                className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                                placeholder="Explain reason for modification..."
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submittingCorr}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition-all shadow-lg shadow-cyan-400/20"
                        >
                            {submittingCorr ? "Dispatching..." : "Send Correction Alert"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
