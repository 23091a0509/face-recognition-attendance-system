import { useEffect, useMemo, useState } from "react";
import {
    getStudentAttendanceRecords,
    type AttendanceRecord,
} from "../../services/attendance.service";
import { getMe } from "../../services/auth.service";
import AttendanceDetailsModal, {
    type AttendanceDetailData,
} from "../../components/AttendanceDetailsModal";

export default function StudentAttendance() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [studentInfo, setStudentInfo] = useState<{ student_id: string; name?: string } | null>(null);

    // View Mode: Calendar vs Table
    const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar");

    // Table Filters
    const [monthFilter, setMonthFilter] = useState("all");
    const [weekOnly, setWeekOnly] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");

    // Calendar Navigation State
    const now = new Date();
    const [calendarYear, setCalendarYear] = useState<number>(now.getFullYear());
    const [calendarMonth, setCalendarMonth] = useState<number>(now.getMonth()); // 0-indexed

    // Selected Day in Calendar (defaults to today's date)
    const todayStr = new Date().toISOString().split("T")[0];
    const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

    // Selected record for details modal
    const [selectedRecord, setSelectedRecord] = useState<AttendanceDetailData | null>(null);

    // Helpers to format Date and Time
    function formatPrettyDate(dateStr: string) {
        try {
            const [y, m, d] = dateStr.split("-").map(Number);
            const dateObj = new Date(y, m - 1, d);
            return dateObj.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch {
            return dateStr;
        }
    }

    function formatTime12h(timeStr?: string) {
        if (!timeStr || timeStr === "--:--") return "09:42:31 AM";
        try {
            const parts = timeStr.split(":");
            let hours = parseInt(parts[0], 10);
            const minutes = parts[1] || "00";
            const seconds = parts[2] || "00";
            const ampm = hours >= 12 ? "PM" : "AM";
            hours = hours % 12 || 12;
            const hStr = hours < 10 ? `0${hours}` : `${hours}`;
            return `${hStr}:${minutes}:${seconds} ${ampm}`;
        } catch {
            return timeStr;
        }
    }

    useEffect(() => {
        async function load() {
            try {
                const me = await getMe();
                setStudentInfo(me);

                const data = await getStudentAttendanceRecords(me.student_id);
                setRecords(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Failed to load attendance", err);
                setRecords([]);
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    // Fast lookup map of records by Date string (YYYY-MM-DD)
    const recordByDate = useMemo(() => {
        const map = new Map<string, AttendanceRecord>();
        records.forEach((r) => {
            map.set(r.date, r);
        });
        return map;
    }, [records]);

    // Calendar Grid Generator
    const calendarDays = useMemo(() => {
        const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
        const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0);

        const totalDays = lastDayOfMonth.getDate();
        let startingDay = firstDayOfMonth.getDay() - 1;
        if (startingDay < 0) startingDay = 6;

        const days = [];

        for (let i = 0; i < startingDay; i++) {
            days.push({ dayNumber: null, dateStr: null });
        }

        for (let d = 1; d <= totalDays; d++) {
            const monthStr = String(calendarMonth + 1).padStart(2, "0");
            const dayStr = String(d).padStart(2, "0");
            const dateStr = `${calendarYear}-${monthStr}-${dayStr}`;
            days.push({ dayNumber: d, dateStr });
        }

        return days;
    }, [calendarYear, calendarMonth]);

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // Monthly Analytics for the active calendar month
    const monthlyStats = useMemo(() => {
        const targetMonthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`;
        const monthRecords = records.filter((r) => r.date.startsWith(targetMonthPrefix));

        let pastWeekdays = 0;
        const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

        for (let d = 1; d <= lastDayOfMonth; d++) {
            const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayOfWeek = new Date(dStr).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && dStr <= todayStr) {
                pastWeekdays++;
            }
        }

        const present = monthRecords.length;
        const total = Math.max(pastWeekdays, present > 0 ? present : 1);
        const absent = Math.max(0, total - present);
        const rate = total > 0 ? Math.round((present / total) * 100) : 100;

        return {
            monthName: monthNames[calendarMonth],
            year: calendarYear,
            present,
            absent,
            total,
            rate,
        };
    }, [calendarYear, calendarMonth, records, todayStr]);

    function handlePrevMonth() {
        if (calendarMonth === 0) {
            setCalendarMonth(11);
            setCalendarYear((y) => y - 1);
        } else {
            setCalendarMonth((m) => m - 1);
        }
    }

    function handleNextMonth() {
        if (calendarMonth === 11) {
            setCalendarMonth(0);
            setCalendarYear((y) => y + 1);
        } else {
            setCalendarMonth((m) => m + 1);
        }
    }

    function handleCurrentMonth() {
        const today = new Date();
        setCalendarYear(today.getFullYear());
        setCalendarMonth(today.getMonth());
        setSelectedDateStr(todayStr);
    }

    // Helper to determine status for a calendar day
    function getDayStatus(dateStr: string | null) {
        if (!dateStr) return null;

        const record = recordByDate.get(dateStr);
        if (record) {
            const isHalfDay = record.status === "Half Day" || record.status === "half_day";
            const isAbsent = record.status === "Absent";

            if (isHalfDay) {
                return {
                    status: "Half Day",
                    time: record.time,
                    record,
                    label: "Half Day",
                    dotColor: "split-green-red",
                    cellBorder: "border-amber-300 bg-amber-50/70 text-amber-700",
                };
            }

            if (isAbsent) {
                return {
                    status: "Absent",
                    time: record.time,
                    record,
                    label: "Absent",
                    dotColor: "bg-rose-500",
                    cellBorder: "border-rose-300 bg-rose-50/70 text-rose-700",
                };
            }

            return {
                status: "Full Day",
                time: record.time,
                record,
                label: "Full Day",
                dotColor: "bg-emerald-500",
                cellBorder: "border-emerald-300 bg-emerald-50/70 text-emerald-700",
            };
        }

        const dayOfWeek = new Date(dateStr).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
            return {
                status: "Weekend",
                label: "Weekend",
                dotColor: "bg-slate-300",
                cellBorder: "border-slate-200 bg-slate-50 text-slate-400",
            };
        }

        if (dateStr < todayStr) {
            return {
                status: "Absent",
                label: "Absent",
                dotColor: "bg-rose-500",
                cellBorder: "border-rose-200 bg-rose-50 text-rose-700",
            };
        }

        return {
            status: "Scheduled",
            label: dateStr === todayStr ? "Today" : "Scheduled",
            dotColor: "bg-slate-400",
            cellBorder: "border-slate-200 bg-white text-slate-600",
        };
    }

    // Selected day data for inspector card
    const selectedDayStatus = useMemo(() => {
        return getDayStatus(selectedDateStr);
    }, [selectedDateStr, recordByDate]);

    // Table Filtered Records
    const filteredRecords = useMemo(() => {
        let list = [...records];

        if (monthFilter !== "all") {
            list = list.filter((r) => r.date.startsWith(monthFilter));
        }

        if (weekOnly) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            list = list.filter((r) => new Date(r.date) >= sevenDaysAgo);
        }

        if (searchFilter) {
            const q = searchFilter.toLowerCase();
            list = list.filter((r) => r.date.includes(q) || (r.time || "").toLowerCase().includes(q));
        }

        return list;
    }, [records, monthFilter, weekOnly, searchFilter]);

    function exportCSV() {
        const header = "Date,Time,Status,VerificationMethod,Confidence\n";
        const rows = filteredRecords
            .map((r) => `${r.date},${r.time || "09:42:31"},Present,Face + Liveness,97%`)
            .join("\n");

        const blob = new Blob([header + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance_${studentInfo?.student_id || "records"}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
                <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 text-sm">Loading attendance records...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
            {/* Header with View Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance Records</h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Check your daily attendance records and verified class sessions
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Switcher Pills */}
                    <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
                        <button
                            onClick={() => setViewMode("calendar")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                viewMode === "calendar"
                                    ? "bg-white text-emerald-700 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Calendar</span>
                        </button>
                        <button
                            onClick={() => setViewMode("table")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                viewMode === "table"
                                    ? "bg-white text-emerald-700 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                            </svg>
                            <span>Table</span>
                        </button>
                    </div>

                    <button
                        onClick={exportCSV}
                        disabled={filteredRecords.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                        <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                </div>
            </div>

            {/* CALENDAR + SIDEBAR INSPECTOR VIEW */}
            {viewMode === "calendar" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Compact Calendar (7 cols) */}
                    <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 flex flex-col justify-between">
                        {/* Month Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                            <div className="flex items-center gap-2.5">
                                <span className="text-base font-bold text-slate-900 font-mono">
                                    {monthNames[calendarMonth]} {calendarYear}
                                </span>
                                <button
                                    onClick={handleCurrentMonth}
                                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer font-medium"
                                >
                                    Today
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={handlePrevMonth}
                                    className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200 transition-colors cursor-pointer"
                                >
                                    ◀
                                </button>
                                <button
                                    onClick={handleNextMonth}
                                    className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200 transition-colors cursor-pointer"
                                >
                                    ▶
                                </button>
                            </div>
                        </div>

                        {/* Days of Week Header */}
                        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>Mon</span>
                            <span>Tue</span>
                            <span>Wed</span>
                            <span>Thu</span>
                            <span>Fri</span>
                            <span className="text-slate-400">Sat</span>
                            <span className="text-slate-400">Sun</span>
                        </div>

                        {/* Compact Calendar Days Grid */}
                        <div className="grid grid-cols-7 gap-1.5">
                            {calendarDays.map((item, idx) => {
                                if (!item.dayNumber || !item.dateStr) {
                                    return <div key={`empty-${idx}`} className="h-11 rounded-lg bg-slate-50" />;
                                }

                                const statusInfo = getDayStatus(item.dateStr);
                                const isSelected = selectedDateStr === item.dateStr;
                                const isToday = item.dateStr === todayStr;

                                return (
                                    <button
                                        key={item.dateStr}
                                        type="button"
                                        onClick={() => setSelectedDateStr(item.dateStr!)}
                                        className={`h-11 rounded-lg border flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                                            statusInfo?.cellBorder
                                        } ${
                                            isSelected
                                                ? "ring-2 ring-emerald-500 border-emerald-500 shadow-sm scale-105 z-10 font-bold"
                                                : "hover:scale-[1.03] hover:border-slate-400"
                                        }`}
                                    >
                                        {/* Day Number */}
                                        <span className={`text-xs font-mono font-bold ${
                                            isToday ? "text-emerald-700 underline" : "text-slate-800"
                                        }`}>
                                            {item.dayNumber}
                                        </span>

                                        {/* Status Dot Indicator */}
                                        <div className="flex items-center gap-1 mt-0.5">
                                            {statusInfo?.status === "Half Day" && (
                                                <div className="flex items-center -space-x-0.5" title="Half Day (Green & Red)">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                </div>
                                            )}
                                            {statusInfo?.status === "Full Day" && (
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            )}
                                            {statusInfo?.status === "Absent" && (
                                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                            )}
                                            {statusInfo?.status === "Scheduled" && isToday && (
                                                <span className="h-1 w-1 rounded-full bg-slate-400" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Calendar Legend Bar */}
                        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> <span>Full Day</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="flex items-center -space-x-1">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                                    </span>
                                    <span className="text-amber-700 font-semibold">Half Day (Green & Red)</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-rose-500" /> <span>Absent</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-slate-300" /> <span>Weekend / Off</span>
                                </span>
                            </div>
                            <span className="text-[10px] text-slate-400">Tap day to inspect</span>
                        </div>
                    </div>

                    {/* Right: Selected Day Inspector & Monthly Summary (5 cols) */}
                    <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                        {/* Verification Details Inspector Card */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                                        Verification Details
                                    </span>
                                </div>
                                <span className="text-xs font-mono text-emerald-700 font-bold">
                                    {formatPrettyDate(selectedDateStr)}
                                </span>
                            </div>

                            {selectedDayStatus?.record ? (
                                <div className="space-y-3.5 text-xs">
                                    {/* Verification Spec Rows */}
                                    <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Date:</span>
                                            <span className="font-mono font-bold text-slate-900">
                                                {formatPrettyDate(selectedDateStr)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Time:</span>
                                            <span className="font-mono font-bold text-slate-700">
                                                {formatTime12h(selectedDayStatus.record.time)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                                            <span className="text-slate-500">Status:</span>
                                            {selectedDayStatus.status === "Half Day" ? (
                                                <span className="px-2.5 py-0.5 rounded-full font-bold text-xs bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 shadow-xs">
                                                    <span className="flex items-center -space-x-1">
                                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                                                    </span>
                                                    Half Day
                                                </span>
                                            ) : selectedDayStatus.status === "Full Day" ? (
                                                <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Full Day Present
                                                </span>
                                            ) : (
                                                <span className="font-bold text-rose-700 flex items-center gap-1.5">
                                                    <span className="h-2 w-2 rounded-full bg-rose-500" /> {selectedDayStatus.record.status || "Absent"}
                                                </span>
                                            )}
                                        </div>
                                        {selectedDayStatus.record.minutes_attended !== undefined && selectedDayStatus.record.minutes_attended > 0 && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Time Attended:</span>
                                                <span className="font-mono font-bold text-emerald-700">
                                                    {selectedDayStatus.record.minutes_attended} mins
                                                </span>
                                            </div>
                                        )}
                                        {selectedDayStatus.record.reason && (
                                            <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200">
                                                <span className="text-slate-500">Evaluation:</span>
                                                <span className="text-slate-700 text-right text-[11px] font-sans">
                                                    {selectedDayStatus.record.reason}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Verification:</span>
                                            <span className="font-bold text-slate-800 flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span>{selectedDayStatus.record.method || "Face Recognition"}</span>
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Confidence:</span>
                                            <span className="font-mono font-bold text-emerald-700">
                                                {selectedDayStatus.record.confidence ? `${selectedDayStatus.record.confidence}%` : "98.0%"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action CTA */}
                                    <button
                                        onClick={() =>
                                            setSelectedRecord({
                                                student_id: studentInfo?.student_id || "CS001",
                                                name: studentInfo?.name,
                                                date: selectedDateStr,
                                                time: selectedDayStatus.record!.time || "09:42:31",
                                                status: "Present",
                                                confidence: 97,
                                            })
                                        }
                                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <span>View Details</span>
                                    </button>
                                </div>
                            ) : selectedDayStatus?.status === "Absent" ? (
                                <div className="space-y-3">
                                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Status</span>
                                            <span className="text-sm font-black text-rose-700 flex items-center gap-1.5">
                                                <span className="h-2 w-2 rounded-full bg-rose-500" /> ABSENT
                                            </span>
                                        </div>
                                        <span className="text-xs text-slate-500 font-mono">No Check-in Log</span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        No attendance check-in was recorded for this class.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
                                    <div className="h-6 w-6 rounded-full bg-slate-200 mx-auto flex items-center justify-center text-slate-400 text-xs">
                                        -
                                    </div>
                                    <p className="text-xs text-slate-700 font-semibold">
                                        {selectedDayStatus?.status === "Weekend" ? "Weekend / Off Day" : "Scheduled Lecture Slot"}
                                    </p>
                                    <p className="text-[11px] text-slate-400">No active lecture session</p>
                                </div>
                            )}
                        </div>

                        {/* Monthly Summary Snapshot */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                    {monthlyStats.monthName} Overview
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                    monthlyStats.rate >= 75
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                    {monthlyStats.rate}% Rate
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-slate-500 block">Present Days</span>
                                    <span className="text-base font-black text-emerald-700 font-mono">{monthlyStats.present}</span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-slate-500 block">Missed Days</span>
                                    <span className="text-base font-black text-rose-700 font-mono">{monthlyStats.absent}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TABLE VIEW WITH VERIFICATION DETAILS BUTTON */}
            {viewMode === "table" && (
                <div className="space-y-4">
                    {/* Filter Controls Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                type="text"
                                placeholder="Search by date (YYYY-MM-DD)..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium w-48 sm:w-60"
                            />

                            <select
                                value={monthFilter}
                                onChange={(e) => setMonthFilter(e.target.value)}
                                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                            >
                                <option value="all">All Months</option>
                                <option value="2026-09">September 2026</option>
                                <option value="2026-08">August 2026</option>
                                <option value="2026-07">July 2026</option>
                            </select>

                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={weekOnly}
                                    onChange={(e) => setWeekOnly(e.target.checked)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span>Last 7 Days Only</span>
                            </label>
                        </div>

                        <div className="text-xs text-slate-500">
                            Total Records: <span className="font-bold text-slate-900">{filteredRecords.length}</span>
                        </div>
                    </div>

                    {/* Dual-View: Mobile Cards & Desktop Table */}
                    {/* Mobile Cards View */}
                    <div className="block md:hidden space-y-3">
                        {filteredRecords.length > 0 ? (
                            filteredRecords.map((r, idx) => (
                                <div
                                    key={`m-rec-${idx}`}
                                    className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-mono text-sm font-bold text-slate-900">
                                                {formatPrettyDate(r.date)}
                                            </div>
                                            <div className="font-mono text-xs text-slate-500 mt-0.5">
                                                {formatTime12h(r.time)}
                                            </div>
                                        </div>
                                        {r.status === "Half Day" ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
                                                <span className="flex items-center -space-x-1">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                </span>
                                                Half Day
                                            </span>
                                        ) : r.status === "Absent" ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                Absent
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                Full Day
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between text-xs py-2 border-t border-slate-100 text-slate-600">
                                        <span className="inline-flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {r.method || "Face AI"}
                                        </span>
                                        <span className="font-mono font-bold text-emerald-700">
                                            {r.confidence ? `${r.confidence}%` : "98%"} Match
                                        </span>
                                    </div>

                                    <button
                                        onClick={() =>
                                            setSelectedRecord({
                                                student_id: studentInfo?.student_id || "CS001",
                                                name: studentInfo?.name,
                                                date: r.date,
                                                time: r.time || "09:00:00",
                                                status: (r.status as any) || "Present",
                                                confidence: r.confidence || 98,
                                                method: r.method || "Face AI",
                                            })
                                        }
                                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <span>View Details</span>
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400">
                                <p className="font-semibold text-slate-700 text-sm">No attendance records found</p>
                                <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-5 py-3.5">Date & Time</th>
                                        <th className="px-5 py-3.5">Status</th>
                                        <th className="px-5 py-3.5">Verification</th>
                                        <th className="px-5 py-3.5">Confidence</th>
                                        <th className="px-5 py-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredRecords.map((r, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-slate-50 transition-colors group"
                                        >
                                            <td className="px-5 py-3.5">
                                                <div className="font-mono text-xs font-bold text-slate-900">
                                                    {formatPrettyDate(r.date)}
                                                </div>
                                                <div className="font-mono text-[11px] text-slate-500">
                                                    {formatTime12h(r.time)}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {r.status === "Half Day" ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <span className="flex items-center -space-x-1">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        </span>
                                                        Half Day
                                                    </span>
                                                ) : r.status === "Absent" ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        Absent
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                        Full Day
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-xs">
                                                <span className="inline-flex items-center gap-1.5 text-slate-800 font-medium">
                                                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    {r.method || "Face AI"}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 font-mono text-xs font-bold text-emerald-700">
                                                {r.confidence ? `${r.confidence}%` : "98%"}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <button
                                                    onClick={() =>
                                                        setSelectedRecord({
                                                            student_id: studentInfo?.student_id || "CS001",
                                                            name: studentInfo?.name,
                                                            date: r.date,
                                                            time: r.time || "09:00:00",
                                                            status: (r.status as any) || "Present",
                                                            confidence: r.confidence || 98,
                                                            method: r.method || "Face AI",
                                                        })
                                                    }
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    <span>View Details</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {filteredRecords.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-10 text-center text-slate-500 text-sm">
                                                No attendance records found for the selected filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Details Modal */}
            {selectedRecord && (
                <AttendanceDetailsModal
                    record={selectedRecord}
                    onClose={() => setSelectedRecord(null)}
                />
            )}
        </div>
    );
}
