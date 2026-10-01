import { useEffect, useState, useMemo } from "react";
import { getAttendanceHistory, type AttendanceRecord } from "../../services/attendance.service";
import { exportAttendanceCsv } from "../../utils/exportCsv";
import AttendanceDetailsModal, {
    type AttendanceDetailData,
} from "../../components/AttendanceDetailsModal";

export default function HistoryPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<AttendanceDetailData | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDepartment, setSelectedDepartment] = useState("ALL");
    const [selectedStatus, setSelectedStatus] = useState("ALL");
    const [selectedDate, setSelectedDate] = useState("");

    useEffect(() => {
        getAttendanceHistory()
            .then((data) => {
                if (Array.isArray(data)) {
                    setRecords(data);
                }
            })
            .catch((err) => console.error("Failed to load history", err))
            .finally(() => setLoading(false));
    }, []);

    const departments = useMemo(() => {
        const set = new Set<string>();
        records.forEach((r) => {
            if (r.department) set.add(r.department);
        });
        return Array.from(set);
    }, [records]);

    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            const matchesSearch =
                (r.student_id?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                (r.name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
            
            const matchesDept =
                selectedDepartment === "ALL" || r.department === selectedDepartment;

            const matchesStatus =
                selectedStatus === "ALL" || (r.status || "Present") === selectedStatus;

            const matchesDate =
                !selectedDate || r.date === selectedDate;

            return matchesSearch && matchesDept && matchesStatus && matchesDate;
        });
    }, [records, searchQuery, selectedDepartment, selectedStatus, selectedDate]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance History</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Complete chronological audit log of all facial recognition check-ins
                    </p>
                </div>
                <button
                    onClick={() => exportAttendanceCsv(filteredRecords, `Attendance_History_${new Date().toISOString().split("T")[0]}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition-all shadow-sm cursor-pointer"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export CSV ({filteredRecords.length})</span>
                </button>
            </div>

            {/* Filter Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                {/* Search */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Search student or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                    />
                </div>

                {/* Department Filter */}
                <div>
                    <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                    >
                        <option value="ALL">All Departments</option>
                        {departments.map((dept) => (
                            <option key={dept} value={dept}>
                                {dept}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Status Filter */}
                <div>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="Present">Present</option>
                        <option value="Late">Late</option>
                    </select>
                </div>

                {/* Date Picker */}
                <div>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                    />
                </div>
            </div>

            {/* Dual View: Mobile Cards & Desktop Table */}
            {/* Mobile Cards View */}
            <div className="block md:hidden space-y-3">
                {loading ? (
                    <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-500 shadow-sm">
                        <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2" />
                        <p className="text-sm font-semibold">Loading attendance logs...</p>
                    </div>
                ) : filteredRecords.length > 0 ? (
                    filteredRecords.map((r, i) => (
                        <div
                            key={`m-hist-${r.student_id}-${r.date}-${r.time}-${i}`}
                            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm text-slate-900 truncate">{r.name || r.student_id}</h3>
                                        <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold shrink-0">{r.student_id}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{r.department || "General"}</p>
                                </div>
                                <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                                        r.status === "Late"
                                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    }`}
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                    {r.status || "Present"}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-100 text-slate-600">
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span>{r.date}</span>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono">
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{r.time}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                    <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    {r.method || "Face AI"}
                                </span>
                                <button
                                    onClick={() =>
                                        setSelectedRecord({
                                            student_id: r.student_id,
                                            name: r.name,
                                            date: r.date,
                                            time: r.time,
                                            status: r.status || "Present",
                                            confidence: 97.4,
                                            method: r.method || "Face AI",
                                        })
                                    }
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer active:scale-95"
                                >
                                    <span>View Details</span>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400">
                        <p className="font-semibold text-slate-700 text-sm">No attendance records found</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query</p>
                    </div>
                )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-5 py-3.5">Student ID</th>
                                <th className="px-5 py-3.5">Student Name</th>
                                <th className="px-5 py-3.5">Department</th>
                                <th className="px-5 py-3.5">Date</th>
                                <th className="px-5 py-3.5">Time</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5">Method</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        <div className="inline-block animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
                                        Loading attendance logs...
                                    </td>
                                </tr>
                            ) : filteredRecords.length > 0 ? (
                                filteredRecords.map((r, i) => (
                                    <tr
                                        key={`${r.student_id}-${r.date}-${r.time}-${i}`}
                                        onClick={() =>
                                            setSelectedRecord({
                                                student_id: r.student_id,
                                                name: r.name,
                                                date: r.date,
                                                time: r.time,
                                                status: r.status || "Present",
                                                confidence: 97.4,
                                                method: r.method || "Face AI",
                                            })
                                        }
                                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-5 py-3.5 font-mono font-bold text-blue-700">
                                            {r.student_id}
                                        </td>
                                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                                            {r.name || r.student_id}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">
                                            {r.department || "General"}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-700">
                                            {r.date}
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-slate-500 text-xs">
                                            {r.time}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                    r.status === "Late"
                                                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                }`}
                                            >
                                                <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                                {r.status || "Present"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                                <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                {r.method || "Face AI"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                        No attendance records found matching your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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
