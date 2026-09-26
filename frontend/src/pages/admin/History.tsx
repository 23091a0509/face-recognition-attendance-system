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
                    <h1 className="text-2xl font-bold text-white tracking-tight">Attendance History</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Complete chronological audit log of all facial recognition check-ins
                    </p>
                </div>
                <button
                    onClick={() => exportAttendanceCsv(filteredRecords, `Attendance_History_${new Date().toISOString().split("T")[0]}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black transition-all shadow-lg shadow-emerald-500/20"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export CSV ({filteredRecords.length})</span>
                </button>
            </div>

            {/* Filter Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
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
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>

                {/* Department Filter */}
                <div>
                    <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
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
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
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
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b1120] shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800">
                            <tr>
                                <th className="px-5 py-3.5 font-semibold">Student ID</th>
                                <th className="px-5 py-3.5 font-semibold">Student Name</th>
                                <th className="px-5 py-3.5 font-semibold">Department</th>
                                <th className="px-5 py-3.5 font-semibold">Date</th>
                                <th className="px-5 py-3.5 font-semibold">Time</th>
                                <th className="px-5 py-3.5 font-semibold">Status</th>
                                <th className="px-5 py-3.5 font-semibold">Method</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/80">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                        <div className="inline-block animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full mr-2" />
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
                                        className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-5 py-3.5 font-mono font-medium text-emerald-400">
                                            {r.student_id}
                                        </td>
                                        <td className="px-5 py-3.5 font-medium text-slate-200">
                                            {r.name || r.student_id}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-400">
                                            {r.department || "General"}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-300">
                                            {r.date}
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-slate-400 text-xs">
                                            {r.time}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                    r.status === "Late"
                                                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                }`}
                                            >
                                                <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-400" : "bg-emerald-400"}`} />
                                                {r.status || "Present"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                {r.method || "Face AI"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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

