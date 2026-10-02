import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Student } from "../../services/students";
import { getAllStudents, deleteStudent } from "../../services/students";
import { resolveImageUrl } from "../../services/api";
import AddStudentModal from "../../components/admin/AddStudentModal";

export default function StudentsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDept, setSelectedDept] = useState("ALL");
    const [selectedFaceStatus, setSelectedFaceStatus] = useState("ALL");
    const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [retrying, setRetrying] = useState(false);

    async function load() {
        try {
            setLoading(true);
            setError("");
            const data = await getAllStudents();
            setStudents(Array.isArray(data) ? data : []);
            setError("");
        } catch (err: any) {
            console.error("Failed to load students:", err);
            const msg = err.response?.data?.detail || "Failed to load students. Server may be starting up.";
            setError(msg);
        } finally {
            setLoading(false);
            setRetrying(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function handleDelete(studentId: string, studentName?: string) {
        const name = studentName || studentId;
        if (!window.confirm(`Are you sure you want to delete ${name} (${studentId})? This will remove their attendance records and saved face data.`)) {
            return;
        }
        try {
            setDeletingId(studentId);
            await deleteStudent(studentId);
            await load();
        } catch {
            alert(`Failed to delete student ${studentId}`);
        } finally {
            setDeletingId(null);
        }
    }

    async function handleClearAll() {
        const nonAdminStudents = students.filter((s) => s.student_id !== "admin");
        if (nonAdminStudents.length === 0) {
            alert("No students to remove.");
            return;
        }
        if (!window.confirm(`Are you sure you want to delete ALL ${nonAdminStudents.length} students from the system? You will be able to add fresh students right after.`)) {
            return;
        }

        try {
            setLoading(true);
            for (const s of nonAdminStudents) {
                await deleteStudent(s.student_id);
            }
            await load();
            alert("All students have been removed. You can now add fresh students!");
        } catch {
            alert("Error removing some students");
        } finally {
            setLoading(false);
        }
    }

    const departments = useMemo(() => {
        const set = new Set<string>();
        students.forEach((s) => {
            if (s.department) set.add(s.department);
        });
        return Array.from(set);
    }, [students]);

    const filteredStudents = useMemo(() => {
        return students.filter((s) => {
            const matchesSearch =
                (s.student_id?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                (s.name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
            
            const matchesDept = selectedDept === "ALL" || s.department === selectedDept;

            const matchesStatus =
                selectedFaceStatus === "ALL" ||
                (selectedFaceStatus === "registered" && (s.has_face || s.face_status === "registered")) ||
                (selectedFaceStatus === "not_registered" && !s.has_face && s.face_status !== "registered");

            return matchesSearch && matchesDept && matchesStatus;
        });
    }, [students, searchQuery, selectedDept, selectedFaceStatus]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-slate-500">
                <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mr-3" />
                <p className="text-sm font-medium">Loading student list...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-3 max-w-lg mx-auto my-12 text-center shadow-sm animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">Could Not Load Students</h3>
                <p className="text-xs text-slate-600">{error}</p>
                <div className="pt-2">
                    <button
                        onClick={() => { setRetrying(true); load(); }}
                        disabled={retrying}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                        {retrying ? "Connecting to server..." : "Retry Connection"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Student Directory</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs font-mono">
                            {students.length} Total
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Add new students with face photos, manage profiles, or remove students
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {students.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3.5 py-2.5 text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Remove All</span>
                        </button>
                    )}

                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition-all shadow-sm cursor-pointer"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add New Student</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                {/* Search */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Search student by name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                    />
                </div>

                {/* Department */}
                <div>
                    <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium cursor-pointer"
                    >
                        <option value="ALL">All Departments ({departments.length || 1})</option>
                        {departments.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Face Status */}
                <div>
                    <select
                        value={selectedFaceStatus}
                        onChange={(e) => setSelectedFaceStatus(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium cursor-pointer"
                    >
                        <option value="ALL">All Face Registration Statuses</option>
                        <option value="registered">Registered Biometrics</option>
                        <option value="not_registered">Pending Biometrics</option>
                    </select>
                </div>
            </div>

            {/* DUAL VIEW: Responsive Cards for Mobile, Data Table for Desktop */}

            {/* 1. Mobile Cards View (block md:hidden) */}
            <div className="block md:hidden space-y-3">
                {filteredStudents.length > 0 ? (
                    filteredStudents.map((s) => {
                        const isRegistered = s.has_face || s.face_status === "registered";
                        const rate = s.attendance_rate || 0;

                        return (
                            <div
                                key={`mob-${s.student_id}`}
                                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        {s.photo_url ? (
                                            <img
                                                src={resolveImageUrl(s.photo_url)}
                                                alt={s.name}
                                                className="h-11 w-11 rounded-full object-cover border border-emerald-400 shadow-xs flex-shrink-0"
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="h-11 w-11 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-sm flex-shrink-0">
                                                {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                                    {s.student_id}
                                                </span>
                                                <h3 className="font-bold text-sm text-slate-900 truncate">{s.name}</h3>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">
                                                {s.department || "Computer Science"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Face Status Pill */}
                                    {isRegistered ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            Face AI
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                            Pending
                                        </span>
                                    )}
                                </div>

                                {/* Attendance Rate & Progress Bar */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-slate-500 font-medium">
                                        <span>Attendance Rate</span>
                                        <span className="font-bold text-slate-900">{rate}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className={`h-1.5 rounded-full ${
                                                rate >= 75 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-rose-500"
                                            }`}
                                            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        onClick={() => setSelectedStudentForProfile(s)}
                                        className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors text-center cursor-pointer"
                                    >
                                        View Profile
                                    </button>
                                    <button
                                        onClick={() => handleDelete(s.student_id, s.name)}
                                        disabled={deletingId === s.student_id}
                                        className="py-2 px-3 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        {deletingId === s.student_id ? "..." : "Delete"}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
                        <p className="font-semibold text-slate-700">No students match your filter</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting the search or department filter</p>
                    </div>
                )}
            </div>

            {/* 2. Desktop High-Density Table (hidden md:block) */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-5 py-3.5">ID</th>
                                <th className="px-5 py-3.5">Student Name</th>
                                <th className="px-5 py-3.5">Department</th>
                                <th className="px-5 py-3.5">Face Biometric</th>
                                <th className="px-5 py-3.5">Attendance Rate</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.length > 0 ? (
                                filteredStudents.map((s) => {
                                    const isRegistered = s.has_face || s.face_status === "registered";
                                    const needsUpdate = s.face_status === "needs_update";
                                    const rate = s.attendance_rate || 0;

                                    return (
                                        <tr key={s.student_id} className="hover:bg-slate-50 transition-colors">
                                            {/* Student ID */}
                                            <td className="px-5 py-3.5 font-mono font-bold text-blue-700">
                                                {s.student_id}
                                            </td>

                                            {/* Student Avatar + Name */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {s.photo_url ? (
                                                        <img
                                                            src={resolveImageUrl(s.photo_url)}
                                                            alt={s.name}
                                                            className="h-9 w-9 rounded-full object-cover border border-emerald-400 shadow-xs flex-shrink-0"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs flex-shrink-0">
                                                            {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-semibold text-slate-900 block">{s.name}</span>
                                                        <span className="text-[11px] text-slate-500 font-mono">
                                                            {s.email || `${s.student_id.toLowerCase()}@institution.edu`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Department */}
                                            <td className="px-5 py-3.5 text-slate-600">
                                                {s.department || "General"}
                                            </td>

                                            {/* Face Registration Status */}
                                            <td className="px-5 py-3.5">
                                                {isRegistered ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                        Face Registered
                                                    </span>
                                                ) : needsUpdate ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                        Needs Update
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        Not Registered
                                                    </span>
                                                )}
                                            </td>

                                            {/* Attendance Rate */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-1.5 rounded-full ${
                                                                rate >= 75 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-rose-500"
                                                            }`}
                                                            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                                        />
                                                    </div>
                                                    <span className="font-semibold text-slate-800 text-xs font-mono">{rate}%</span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => setSelectedStudentForProfile(s)}
                                                        className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors cursor-pointer font-medium"
                                                    >
                                                        Profile
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(s.student_id, s.name)}
                                                        disabled={deletingId === s.student_id}
                                                        className="px-2.5 py-1.5 text-xs text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {deletingId === s.student_id ? "Deleting..." : "Delete"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        <p className="font-medium text-slate-600">No students found matching your criteria.</p>
                                        <p className="text-xs text-slate-400 mt-1">Click "+ Add New Student" above to register new profiles.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Student Modal */}
            {showModal && (
                <AddStudentModal
                    onClose={() => setShowModal(false)}
                    onSuccess={load}
                />
            )}

            {/* Student Profile Quick View Modal */}
            {selectedStudentForProfile && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <h3 className="text-base font-bold text-slate-900">Student Profile</h3>
                            <button
                                onClick={() => setSelectedStudentForProfile(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                aria-label="Close"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="text-center space-y-2 py-2">
                            {selectedStudentForProfile.photo_url ? (
                                <img
                                    src={resolveImageUrl(selectedStudentForProfile.photo_url)}
                                    alt={selectedStudentForProfile.name}
                                    className="h-24 w-24 mx-auto rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                                />
                            ) : (
                                <div className="h-20 w-20 mx-auto rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center font-bold text-2xl text-blue-700">
                                    {selectedStudentForProfile.name?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <h4 className="text-lg font-bold text-slate-900">{selectedStudentForProfile.name}</h4>
                            <p className="text-xs font-mono text-blue-700 font-bold">{selectedStudentForProfile.student_id}</p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Department:</span>
                                <span className="text-slate-900 font-semibold">{selectedStudentForProfile.department || "Computer Science"}</span>
                            </div>
                            {selectedStudentForProfile.year && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Academic Year:</span>
                                    <span className="text-slate-900 font-semibold">{selectedStudentForProfile.year}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-slate-500">Student Email:</span>
                                <span className="text-slate-700 font-mono">{selectedStudentForProfile.email || `${selectedStudentForProfile.student_id.toLowerCase()}@institution.edu`}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Face Registration:</span>
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    {selectedStudentForProfile.has_face ? (
                                        <>
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span>Enrolled</span>
                                        </>
                                    ) : (
                                        <span className="text-slate-500">Pending Enrollment</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Attendance Rate:</span>
                                <span className="text-blue-700 font-bold font-mono">{selectedStudentForProfile.attendance_rate || 0}%</span>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => {
                                    handleDelete(selectedStudentForProfile.student_id, selectedStudentForProfile.name);
                                    setSelectedStudentForProfile(null);
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                            >
                                Delete Student
                            </button>
                            <button
                                onClick={() => setSelectedStudentForProfile(null)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-all cursor-pointer border border-slate-200"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
