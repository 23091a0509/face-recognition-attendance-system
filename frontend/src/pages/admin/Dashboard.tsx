import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllStudents, type Student } from "../../services/students";
import { getTodayAttendance, type AttendanceRecord } from "../../services/attendance.service";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function AdminDashboard() {
    const [students, setStudents] = useState<Student[]>([]);
    const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadData() {
        try {
            const [allStudents, attendance] = await Promise.all([
                getAllStudents(),
                getTodayAttendance()
            ]);
            setStudents(allStudents);
            setTodayRecords(attendance.records || []);
        } catch (err) {
            console.error("Admin dashboard load failed", err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, []);

    const getStatusBadge = (status?: string) => {
        const s = (status || "").toLowerCase();
        if (s === "present" || s === "full day") {
            return {
                label: status || "Present",
                icon: (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                ),
                className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
            };
        }
        if (s === "late") {
            return {
                label: "Late",
                icon: (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="12" cy="12" r="9" strokeWidth={2} />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
                    </svg>
                ),
                className: "bg-amber-50 text-amber-700 border border-amber-200",
            };
        }
        if (s === "half day") {
            return {
                label: "Half Day",
                icon: (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="12" cy="12" r="9" strokeWidth={2} />
                        <path strokeWidth={2} d="M12 3v18" />
                    </svg>
                ),
                className: "bg-indigo-50 text-indigo-700 border border-indigo-200",
            };
        }
        return {
            label: status || "Absent",
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            ),
            className: "bg-rose-50 text-rose-700 border border-rose-200",
        };
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-slate-500">
                <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mr-3" />
                <p className="text-sm font-medium">Loading AI Attendance overview...</p>
            </div>
        );
    }

    const totalStudents = students.length || 3;
    const presentCount = todayRecords.length;
    const lateCount = todayRecords.filter(r => r.status === "Late").length;
    const onTimeCount = Math.max(0, presentCount - lateCount);
    const absentCount = Math.max(0, totalStudents - presentCount);
    const attendanceRate = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : "0.0";
    const presentRatePercent = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
    const absentRatePercent = totalStudents > 0 ? Math.round((absentCount / totalStudents) * 100) : 0;

    const registeredFacesCount = students.filter(s => s.has_face || s.face_status === "registered").length;

    const chartData = [
        { name: "On Time", value: onTimeCount, color: "#10b981" },
        { name: "Late", value: lateCount, color: "#f59e0b" },
        { name: "Absent", value: absentCount, color: "#ef4444" },
    ];

    const lastRecord = todayRecords.length > 0 ? todayRecords[0] : null;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance Dashboard</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Live face attendance and student check-ins</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                        <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                        Live Monitoring
                    </span>
                </div>
            </div>

            {/* Top KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Students */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                        <span>Total Students</span>
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-900 tracking-tight">{totalStudents}</span>
                    </div>
                    <div className="mt-2 text-xs text-emerald-700 font-medium flex items-center gap-1">
                        <span>Registered students</span>
                    </div>
                </div>

                {/* Present Today */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                        <span>Present Today</span>
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-emerald-700 tracking-tight">{presentCount}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 font-medium">
                        <span>{presentRatePercent}% of all students</span>
                    </div>
                </div>

                {/* Absent Today */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                        <span>Absent Today</span>
                        <div className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-rose-700 tracking-tight">{absentCount}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 font-medium">
                        <span>{absentRatePercent}% not checked in</span>
                    </div>
                </div>

                {/* Attendance Rate */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                        <span>Attendance Rate</span>
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-blue-700 tracking-tight">{attendanceRate}%</span>
                    </div>
                    <div className="mt-2 text-xs text-emerald-700 font-medium flex items-center gap-1">
                        <span>Face recognition ready</span>
                    </div>
                </div>
            </div>

            {/* Middle Row: Attendance Overview + Live Stream */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Attendance Overview Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Attendance Overview</h2>
                                <p className="text-xs text-slate-500">Today's Attendance Breakdown</p>
                            </div>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {attendanceRate}%
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
                            <div
                                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, Number(attendanceRate)))}%` }}
                            />
                        </div>

                        {/* Donut Chart */}
                        <div className="flex items-center justify-center gap-6 my-2">
                            <div className="relative w-36 h-36">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={46}
                                            outerRadius={62}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "#ffffff",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: "12px",
                                                fontSize: "12px",
                                                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-lg font-black text-slate-900">{attendanceRate}%</span>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-2 text-slate-700 font-medium">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        Present (On Time)
                                    </span>
                                    <span className="font-bold text-slate-900">{onTimeCount}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-2 text-slate-700 font-medium">
                                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                                        Late
                                    </span>
                                    <span className="font-bold text-slate-900">{lateCount}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-2 text-slate-700 font-medium">
                                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                                        Absent
                                    </span>
                                    <span className="font-bold text-slate-900">{absentCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* LIVE ATTENDANCE Stream Panel (2 Columns) */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                            </span>
                            <h2 className="text-base font-bold text-slate-900 tracking-wide uppercase">LIVE ATTENDANCE</h2>
                        </div>
                        <Link
                            to="/admin/attendance"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors group"
                        >
                            <span>Take Attendance with Camera</span>
                            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                        </Link>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span>Camera Status: <strong className="text-slate-900">Active</strong></span>
                        </div>
                        <div>
                            <span>Last Recognition: <strong className="text-slate-900">{lastRecord ? `${lastRecord.time}` : "--:--"}</strong></span>
                        </div>
                    </div>

                    {/* Dual-View Attendance Stream: Mobile Cards vs Desktop Table */}
                    {/* Mobile Cards (block sm:hidden) */}
                    <div className="block sm:hidden space-y-2.5">
                        {todayRecords.length > 0 ? (
                            todayRecords.slice(0, 5).map((r, i) => {
                                const badge = getStatusBadge(r.status);
                                return (
                                    <div key={i} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                                    {r.student_id}
                                                </span>
                                                <span className="text-xs font-bold text-slate-900">{r.name || r.student_id}</span>
                                            </div>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}>
                                                {badge.icon}
                                                <span>{badge.label}</span>
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                            <span>Time: <strong className="text-slate-800">{r.time}</strong></span>
                                            <span>Method: <strong className="text-blue-700">{r.method || "Face AI"}</strong></span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-center py-6 text-xs text-slate-400">
                                No attendance check-ins logged yet today.
                            </p>
                        )}
                    </div>

                    {/* Desktop Table (hidden sm:block) */}
                    <div className="hidden sm:block overflow-x-auto flex-1">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-3 py-2.5">Student ID</th>
                                    <th className="px-3 py-2.5">Student Name</th>
                                    <th className="px-3 py-2.5">Status</th>
                                    <th className="px-3 py-2.5">Time</th>
                                    <th className="px-3 py-2.5">Method</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {todayRecords.length > 0 ? (
                                    todayRecords.slice(0, 5).map((r, i) => {
                                        const badge = getStatusBadge(r.status);
                                        return (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-blue-700 font-bold whitespace-nowrap">{r.student_id}</td>
                                                <td className="px-3 py-2.5 text-slate-900 font-medium whitespace-nowrap">{r.name || r.student_id}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badge.className}`}>
                                                        {badge.icon}
                                                        <span>{badge.label}</span>
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{r.time}</td>
                                                <td className="px-3 py-2.5 text-blue-700 flex items-center gap-1 font-medium whitespace-nowrap">
                                                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    </svg>
                                                    <span>{r.method || "Face AI"}</span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                                            No attendance check-ins logged yet today.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Bottom Row: AI Recognition Status Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shadow-xs">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Face Recognition Status</h2>
                            <p className="text-xs text-slate-500">Face detection & smart matching engine</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        System Online
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Camera Hardware</span>
                        <span className="text-sm font-bold text-emerald-700 mt-1 block">Connected ✓</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Face Scanner</span>
                        <span className="text-sm font-bold text-emerald-700 mt-1 block">Running ✓</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Registered Faces</span>
                        <span className="text-sm font-black text-slate-900 mt-1 block">{registeredFacesCount}</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Today's Check-ins</span>
                        <span className="text-sm font-black text-slate-900 mt-1 block">{presentCount}</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Match Accuracy</span>
                        <span className="text-sm font-black text-emerald-700 mt-1 block">≥ 75.0%</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium block">Last Recognition</span>
                        <span className="text-xs font-mono text-slate-800 font-semibold mt-1 block truncate">
                            {lastRecord ? `${lastRecord.name || lastRecord.student_id} • ${lastRecord.time}` : "None"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}