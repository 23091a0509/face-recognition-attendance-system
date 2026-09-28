import { useEffect, useState, useMemo } from "react";
import type { Student } from "../../services/students";
import { getAllStudents, deleteStudent } from "../../services/students";
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

    async function load() {
        try {
            const data = await getAllStudents();
            setStudents(data);
        } catch {
            setError("Failed to load students");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function handleDelete(studentId: string, studentName?: string) {
        const name = studentName || studentId;
        if (!window.confirm(`Are you sure you want to delete ${name} (${studentId})? This will remove all their records and face embedding data.`)) {
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
        if (!window.confirm(`⚠️ WARNING: Are you sure you want to delete ALL ${nonAdminStudents.length} students from the system? You will be able to add fresh students right after.`)) {
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
                (selectedFaceStatus === "needs_update" && s.face_status === "needs_update") ||
                (selectedFaceStatus === "not_registered" && !s.has_face && s.face_status !== "needs_update");

            return matchesSearch && matchesDept && matchesStatus;
        });
    }, [students, searchQuery, selectedDept, selectedFaceStatus]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-slate-400">
                <div className="inline-block animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mr-3" />
                <p>Loading student profiles...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-white tracking-tight">Students Directory</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {students.length} Total
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Register new students with face embeddings, manage profiles, or remove student details
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {students.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-3.5 py-2.5 text-xs font-bold transition-all"
                        >
                            <span>🗑️</span>
                            <span>Remove All Students</span>
                        </button>
                    )}

                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>+ Add New Student</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
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
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>

                {/* Department Filter */}
                <div>
                    <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                        <option value="ALL">All Departments ({departments.length})</option>
                        {departments.map((d) => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>

                {/* Face Status Filter */}
                <div>
                    <select
                        value={selectedFaceStatus}
                        onChange={(e) => setSelectedFaceStatus(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                        <option value="ALL">All Face Statuses</option>
                        <option value="registered">🟢 Face Registered</option>
                        <option value="needs_update">🟡 Needs Update</option>
                        <option value="not_registered">🔴 Not Registered</option>
                    </select>
                </div>
            </div>

            {/* Students Table */}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b1120] shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800">
                            <tr>
                                <th className="px-5 py-3.5 font-semibold">ID</th>
                                <th className="px-5 py-3.5 font-semibold">Student Name</th>
                                <th className="px-5 py-3.5 font-semibold">Department</th>
                                <th className="px-5 py-3.5 font-semibold">Face Biometric</th>
                                <th className="px-5 py-3.5 font-semibold">Attendance Rate</th>
                                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/80">
                            {filteredStudents.length > 0 ? (
                                filteredStudents.map((s) => {
                                    const isRegistered = s.has_face || s.face_status === "registered";
                                    const needsUpdate = s.face_status === "needs_update";
                                    const rate = s.attendance_rate || 0;

                                    return (
                                        <tr key={s.student_id} className="hover:bg-slate-800/40 transition-colors">
                                            {/* Student ID */}
                                            <td className="px-5 py-3.5 font-mono font-medium text-emerald-400">
                                                {s.student_id}
                                            </td>

                                            {/* Student Avatar + Name */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {s.photo_url ? (
                                                        <img
                                                            src={s.photo_url}
                                                            alt={s.name}
                                                            className="h-9 w-9 rounded-full object-cover border border-emerald-500/40 shadow-sm flex-shrink-0"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs flex-shrink-0">
                                                            {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-medium text-white block">{s.name}</span>
                                                        <span className="text-[11px] text-slate-500 font-mono">
                                                            {s.email || `${s.student_id.toLowerCase()}@institution.edu`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Department */}
                                            <td className="px-5 py-3.5 text-slate-400">
                                                {s.department || "General"}
                                            </td>

                                            {/* Face Registration Status */}
                                            <td className="px-5 py-3.5">
                                                {isRegistered ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                        Face Registered
                                                    </span>
                                                ) : needsUpdate ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                                        Needs Update
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                                        Not Registered
                                                    </span>
                                                )}
                                            </td>

                                            {/* Attendance Rate */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-20 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${
                                                                rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-red-500"
                                                            }`}
                                                            style={{ width: `${Math.max(rate, 5)}%` }}
                                                        />
                                                    </div>
                                                    <span className="font-mono text-xs font-bold text-slate-300">
                                                        {rate}%
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Direct Action Buttons */}
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => setSelectedStudentForProfile(s)}
                                                        className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"
                                                    >
                                                        Profile
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(s.student_id, s.name)}
                                                        disabled={deletingId === s.student_id}
                                                        className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg border border-red-500/30 font-semibold transition-colors disabled:opacity-50"
                                                    >
                                                        {deletingId === s.student_id ? "Deleting..." : "🗑️ Delete"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <p className="text-2xl mb-1">👥</p>
                                        <p className="font-medium text-slate-400">No students found</p>
                                        <p className="text-xs text-slate-600 mt-1">Click "+ Add New Student" above to register students</p>
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
            {selectedStudentForProfile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="w-full max-w-md rounded-2xl bg-[#0b1120] border border-slate-800 shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-base font-bold text-white">Student Profile</h3>
                            <button
                                onClick={() => setSelectedStudentForProfile(null)}
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="text-center space-y-2 py-2">
                            {selectedStudentForProfile.photo_url ? (
                                <img
                                    src={selectedStudentForProfile.photo_url}
                                    alt={selectedStudentForProfile.name}
                                    className="h-24 w-24 mx-auto rounded-2xl object-cover border-2 border-emerald-500 shadow-xl shadow-emerald-500/20"
                                />
                            ) : (
                                <div className="h-20 w-20 mx-auto rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center font-bold text-2xl text-emerald-400">
                                    {selectedStudentForProfile.name?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <h4 className="text-lg font-bold text-white">{selectedStudentForProfile.name}</h4>
                            <p className="text-xs font-mono text-emerald-400">{selectedStudentForProfile.student_id}</p>
                        </div>

                        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Department:</span>
                                <span className="text-slate-200 font-semibold">{selectedStudentForProfile.department || "Computer Science"}</span>
                            </div>
                            {selectedStudentForProfile.year && (
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Academic Year:</span>
                                    <span className="text-slate-200 font-semibold">{selectedStudentForProfile.year}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-slate-400">Student Email:</span>
                                <span className="text-slate-300 font-mono">{selectedStudentForProfile.email || `${selectedStudentForProfile.student_id.toLowerCase()}@institution.edu`}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Face Registration:</span>
                                <span className="text-emerald-400 font-semibold">
                                    {selectedStudentForProfile.has_face ? "🟢 Biometric Active" : "🔴 Not Registered"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Attendance Rate:</span>
                                <span className="text-teal-300 font-bold">{selectedStudentForProfile.attendance_rate || 0}%</span>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => {
                                    handleDelete(selectedStudentForProfile.student_id, selectedStudentForProfile.name);
                                    setSelectedStudentForProfile(null);
                                }}
                                className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 text-xs font-bold transition-all"
                            >
                                Delete Student
                            </button>
                            <button
                                onClick={() => setSelectedStudentForProfile(null)}
                                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-semibold transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
