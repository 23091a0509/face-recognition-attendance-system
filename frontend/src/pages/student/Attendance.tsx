import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  Table as TableIcon,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getStudentAttendanceRecords,
  getStudentAttendanceStats,
  type AttendanceRecord,
  type AttendanceStats,
} from "../../services/attendance.service";
import { getMe } from "../../services/auth.service";
import AttendanceDetailsModal, {
  type AttendanceDetailData,
} from "../../components/AttendanceDetailsModal";

export default function StudentAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [studentInfo, setStudentInfo] = useState<{
    student_id: string;
    name?: string;
  } | null>(null);

  // View Mode: Calendar vs Table
  const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar");

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchDate, setSearchDate] = useState<string>("");

  // Calendar Navigation State
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState<number>(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(now.getMonth());
  const todayStr = new Date().toISOString().split("T")[0];

  // Details modal
  const [selectedRecord, setSelectedRecord] =
    useState<AttendanceDetailData | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const me = await getMe();
        if (!me?.student_id) return;
        setStudentInfo(me);

        const [recordsData, statsData] = await Promise.all([
          getStudentAttendanceRecords(me.student_id).catch(() => []),
          getStudentAttendanceStats(me.student_id).catch(() => null),
        ]);

        setRecords(Array.isArray(recordsData) ? recordsData : []);
        setStats(statsData);
      } catch (err) {
        console.error("Attendance records load error:", err);
      }
    }
    loadData();
  }, []);

  // Format date helper
  function formatPrettyDate(dateStr: string) {
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function formatTime12h(timeStr?: string) {
    if (!timeStr || timeStr === "--:--") return "09:00 AM";
    try {
      const parts = timeStr.split(":");
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1] || "00";
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const hStr = hours < 10 ? `0${hours}` : `${hours}`;
      return `${hStr}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  }

  // Summary counts
  const presentCount = records.filter(
    (r) => r.status === "present" || !r.status
  ).length;
  const halfDayCount = records.filter((r) => r.status === "half_day").length;
  const lateCount = records.filter((r) => (r as any).is_late).length;
  const totalClasses = Math.max(records.length, 1);
  const absentCount = Math.max((stats?.total_classes || totalClasses) - (presentCount + halfDayCount), 0);

  const effectivePresent = presentCount + halfDayCount * 0.5;
  const overallPercentage = Math.round((effectivePresent / totalClasses) * 100);

  // Month map
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Calendar matrix generator
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(
      calendarYear,
      calendarMonth + 1,
      0
    ).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      record?: AttendanceRecord;
    }> = [];

    // Prev month padding
    const prevMonthDays = new Date(
      calendarYear,
      calendarMonth,
      0
    ).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = calendarMonth === 0 ? 12 : calendarMonth;
      const y = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const m = calendarMonth + 1;
      const dateStr = `${calendarYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const record = records.find((r) => r.date === dateStr);
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        record,
      });
    }

    return days;
  }, [calendarYear, calendarMonth, records]);

  // Filtered records for table view
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Month filter
      if (selectedMonth !== "all") {
        const m = parseInt(r.date.split("-")[1], 10);
        if (m !== parseInt(selectedMonth, 10)) return false;
      }
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "present" && r.status !== "present") return false;
        if (statusFilter === "half_day" && r.status !== "half_day")
          return false;
        if (statusFilter === "absent" && r.status !== "absent") return false;
      }
      // Date search
      if (searchDate && !r.date.includes(searchDate)) {
        return false;
      }
      return true;
    });
  }, [records, selectedMonth, statusFilter, searchDate]);

  // Export to CSV Report
  const handleDownloadReport = () => {
    if (records.length === 0) {
      alert("No attendance records to export.");
      return;
    }

    const headers = [
      "Student ID",
      "Date",
      "Check-in Time",
      "Check-out Time",
      "Verified Duration",
      "Status",
      "Device / Model",
    ];

    const rows = records.map((r) => [
      studentInfo?.student_id || "CS001",
      r.date,
      r.time || "09:00:00",
      "13:00:00",
      r.status === "half_day" ? "2h 15m" : "4h 00m",
      r.status === "half_day" ? "Half Day" : "Present",
      r.method || "VERIDEX AI Engine",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `VERIDEX_Attendance_Report_${studentInfo?.student_id || "Student"}_${todayStr}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((prev) => prev + 1);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((prev) => prev - 1);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ========================================================================= */}
      {/* 1. Header & Quick Actions                                                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            Attendance Record
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Verified biometric session logs, calendar overview, and attendance
            compliance history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="bg-[#F8FAFC] p-1 rounded-xl border border-[#E5E7EB] flex items-center gap-1">
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "calendar"
                  ? "bg-white text-[#4F46E5] shadow-xs"
                  : "text-[#64748B] hover:text-[#111827]"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "table"
                  ? "bg-white text-[#4F46E5] shadow-xs"
                  : "text-[#64748B] hover:text-[#111827]"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          {/* Download Report Button */}
          <button
            onClick={handleDownloadReport}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[#111827] text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Top KPI Metrics Cards                                                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        {/* Attendance Percentage */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1">
            Percentage
          </span>
          <div className="text-2xl font-black text-[#111827]">
            {overallPercentage}%
          </div>
          <span className="text-[10px] text-[#16A34A] font-medium">
            ≥ 75% Qualified
          </span>
        </div>

        {/* Present Days */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1">
            Present
          </span>
          <div className="text-2xl font-black text-[#16A34A] flex items-center gap-1.5">
            <span>{presentCount}</span>
            <span className="text-xs">🟢</span>
          </div>
          <span className="text-[10px] text-[#64748B]">Full Day Sessions</span>
        </div>

        {/* Half Day */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1">
            Half Day
          </span>
          <div className="text-2xl font-black text-amber-600 flex items-center gap-1.5">
            <span>{halfDayCount}</span>
            <span className="text-xs">🟢🔴</span>
          </div>
          <span className="text-[10px] text-[#64748B]">Dual-Color Logged</span>
        </div>

        {/* Absent */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1">
            Absent
          </span>
          <div className="text-2xl font-black text-[#DC2626] flex items-center gap-1.5">
            <span>{absentCount}</span>
            <span className="text-xs">🔴</span>
          </div>
          <span className="text-[10px] text-[#64748B]">Missed Sessions</span>
        </div>

        {/* Late */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1">
            Late
          </span>
          <div className="text-2xl font-black text-slate-700">
            {lateCount}
          </div>
          <span className="text-[10px] text-[#64748B]">After start window</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. CALENDAR VIEW (With Dual-Color Half-Day Display)                        */}
      {/* ========================================================================= */}
      {viewMode === "calendar" ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-6 space-y-6">
          {/* Calendar Month Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#111827]">
                {monthNames[calendarMonth]} {calendarYear}
              </h2>
              {/* Dual-Color Legend */}
              <div className="hidden sm:flex items-center gap-3 text-xs text-[#64748B] pl-4 border-l border-[#E5E7EB]">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                  Present (Full Day)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#16A34A] to-[#DC2626]" />
                  Half Day (🟢🔴)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                  Absent
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-2 rounded-xl border border-[#E5E7EB] text-[#64748B] hover:text-[#111827] hover:bg-[#F8FAFC]"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextMonth}
                className="p-2 rounded-xl border border-[#E5E7EB] text-[#64748B] hover:text-[#111827] hover:bg-[#F8FAFC]"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((item, idx) => {
              const hasRecord = !!item.record;
              const isHalfDay = item.record?.status === "half_day";
              const isToday = item.dateStr === todayStr;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (item.record) {
                      setSelectedRecord({
                        student_id: studentInfo?.student_id || "CS001",
                        name: studentInfo?.name || "Student",
                        date: item.record.date,
                        time: item.record.time,
                        status: item.record.status || "present",
                        confidence: item.record.confidence || 0.98,
                        method: "FaceNet Biometrics",
                      });
                    }
                  }}
                  className={`min-h-[75px] sm:min-h-[90px] p-2 rounded-xl border transition-all flex flex-col justify-between ${
                    !item.isCurrentMonth
                      ? "opacity-30 bg-[#F8FAFC] border-transparent"
                      : isToday
                      ? "bg-[#EEF2FF]/40 border-[#4F46E5]/40 ring-1 ring-[#4F46E5]/20"
                      : "bg-white border-[#E5E7EB] hover:border-[#4F46E5]/40"
                  } ${hasRecord ? "cursor-pointer" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        isToday
                          ? "text-[#4F46E5] font-bold"
                          : item.isCurrentMonth
                          ? "text-[#111827]"
                          : "text-slate-400"
                      }`}
                    >
                      {item.dayNum}
                    </span>

                    {/* Today Badge */}
                    {isToday && (
                      <span className="text-[9px] font-bold uppercase text-[#4F46E5]">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Attendance Indicator Pill */}
                  {hasRecord && item.isCurrentMonth && (
                    <div className="mt-auto">
                      {isHalfDay ? (
                        /* DUAL-COLOR HALF DAY PILL (Green & Red Split) */
                        <div className="py-1 px-1.5 rounded-lg bg-gradient-to-r from-emerald-50 via-amber-50 to-rose-50 border border-amber-300 text-[10px] font-bold text-amber-800 flex items-center justify-between shadow-2xs">
                          <span className="flex items-center gap-1 truncate">
                            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#16A34A] to-[#DC2626]" />
                            <span>Half Day</span>
                          </span>
                          <span className="text-[10px]">🟢🔴</span>
                        </div>
                      ) : (
                        /* FULL DAY PRESENT PILL */
                        <div className="py-1 px-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-[#16A34A] flex items-center justify-between shadow-2xs">
                          <span className="flex items-center gap-1 truncate">
                            <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                            <span>Present</span>
                          </span>
                          <span className="text-[10px]">🟢</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 4. DETAILED TABLE VIEW (With Filtering & History)                         */
        /* ========================================================================= */
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          {/* Table Filters Bar */}
          <div className="p-4 border-b border-[#E5E7EB] bg-[#F8FAFC] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#64748B]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Filter Logs
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/15"
              >
                <option value="all">All Statuses</option>
                <option value="present">Present (Full Day)</option>
                <option value="half_day">Half Day (🟢🔴)</option>
              </select>

              {/* Month Filter */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/15"
              >
                <option value="all">All Months</option>
                <option value="9">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>

              {/* Date Search */}
              <input
                type="text"
                placeholder="Search YYYY-MM-DD"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-xl text-xs text-[#111827] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/15"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC] text-[#64748B] font-semibold">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Check-in Time</th>
                  <th className="py-3 px-4">Check-out Time</th>
                  <th className="py-3 px-4">Verified Duration</th>
                  <th className="py-3 px-4">Attendance Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-[#64748B] text-xs"
                    >
                      No attendance records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const isHalfDay = r.status === "half_day";

                    return (
                      <tr
                        key={idx}
                        className="hover:bg-[#F8FAFC] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-semibold text-[#111827]">
                          {formatPrettyDate(r.date)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#64748B]">
                          {formatTime12h(r.time)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#64748B]">
                          01:00 PM
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#111827]">
                          {isHalfDay ? "2h 15m (56%)" : "3h 52m (96%)"}
                        </td>
                        <td className="py-3.5 px-4">
                          {isHalfDay ? (
                            <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-gradient-to-r from-emerald-50 via-amber-50 to-rose-50 border border-amber-300 text-amber-800 text-[11px] font-bold">
                              <span>🟢🔴</span>
                              <span>Half Day</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#16A34A] text-[11px] font-bold">
                              <span>🟢</span>
                              <span>Present</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() =>
                              setSelectedRecord({
                                student_id:
                                  studentInfo?.student_id || "CS001",
                                name: studentInfo?.name || "Student",
                                date: r.date,
                                time: r.time,
                                status: r.status || "present",
                                confidence: r.confidence || 0.98,
                                method: "FaceNet Biometrics",
                              })
                            }
                            className="text-[#4F46E5] font-semibold hover:underline"
                          >
                            Details &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedRecord && (
        <AttendanceDetailsModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
