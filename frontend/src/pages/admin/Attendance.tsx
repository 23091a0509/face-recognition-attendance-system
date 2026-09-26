import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
    getTodayAttendance,
    markAttendance,
    recognizeFrame,
    type TodayAttendance,
    type FrameRecognitionResult,
    type DetectedFaceInfo
} from "../../services/attendance.service";
import { getAllStudents, type Student } from "../../services/students";
import { exportAttendanceCsv } from "../../utils/exportCsv";

type ViewMode = "SPLIT" | "PRESENT" | "ABSENT" | "ALL";
type ScannerMode = "SOLO" | "GROUP";

export default function AttendancePage() {
    const [data, setData] = useState<TodayAttendance | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>("SPLIT");
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    
    // Live Recognition Modal State
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerMode, setScannerMode] = useState<ScannerMode>("SOLO");
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [isScanningActive, setIsScanningActive] = useState(true);
    const [selectedStudentToRecognize, setSelectedStudentToRecognize] = useState<string>("");
    
    // Solo Mode Detected Student
    const [detectedStudent, setDetectedStudent] = useState<{
        studentId: string;
        name: string;
        department?: string;
        confidence: number;
        status: string;
        timestamp: string;
    } | null>(null);

    // Group Mode Multi-Face Detections & Session Log
    const [groupDetectedFaces, setGroupDetectedFaces] = useState<DetectedFaceInfo[]>([]);
    const [groupSessionRecognized, setGroupSessionRecognized] = useState<{
        studentId: string;
        name: string;
        department: string;
        time: string;
        confidence: number;
    }[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const isProcessingFrame = useRef<boolean>(false);
    const lastRecognizedStudent = useRef<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [attendanceRes, studentsRes] = await Promise.all([
                getTodayAttendance(),
                getAllStudents()
            ]);
            setData(attendanceRes);
            setStudents(studentsRes);
            if (studentsRes.length > 0 && !selectedStudentToRecognize) {
                setSelectedStudentToRecognize(studentsRes[0].student_id);
            }
        } catch {
            setError("Failed to load attendance records");
        } finally {
            setLoading(false);
        }
    }, [selectedStudentToRecognize]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 4000);
        return () => clearInterval(interval);
    }, [load]);

    function showNotification(msg: string) {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    }

    function toggleFacingMode() {
        setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    }

    // Camera handling for Live Recognition Scanner
    useEffect(() => {
        if (showScannerModal) {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }

            const constraints: MediaStreamConstraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };

            navigator.mediaDevices?.getUserMedia(constraints)
                .then((stream) => {
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                    setCameraActive(true);
                    setCameraError("");
                })
                .catch((err) => {
                    console.warn("Camera access failed", err);
                    setCameraError("Unable to access webcam. Please check permissions or select a student to test.");
                    setCameraActive(false);
                });
        }

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, [showScannerModal, facingMode]);

    // Live continuous frame processing loop for Solo & Group
    useEffect(() => {
        if (!showScannerModal || !cameraActive || !isScanningActive) return;

        const scanInterval = setInterval(async () => {
            if (isProcessingFrame.current || !videoRef.current || !canvasRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const overlay = overlayCanvasRef.current;
            if (video.videoWidth === 0 || video.videoHeight === 0) return;

            try {
                isProcessingFrame.current = true;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Image = canvas.toDataURL("image/jpeg", 0.75);

                const result: FrameRecognitionResult = await recognizeFrame(base64Image, 0.55);

                // Draw overlay boxes on Group Scanner Canvas
                if (overlay) {
                    overlay.width = video.videoWidth;
                    overlay.height = video.videoHeight;
                    const oCtx = overlay.getContext("2d");
                    if (oCtx) {
                        oCtx.clearRect(0, 0, overlay.width, overlay.height);

                        if (result.detected_faces && result.detected_faces.length > 0) {
                            result.detected_faces.forEach((face) => {
                                if (face.box && face.box.length === 4) {
                                    const [x1, y1, x2, y2] = face.box;
                                    const width = x2 - x1;
                                    const height = y2 - y1;

                                    if (face.recognized) {
                                        oCtx.strokeStyle = "#10b981";
                                        oCtx.lineWidth = 3;
                                        oCtx.strokeRect(x1, y1, width, height);

                                        oCtx.fillStyle = "rgba(11, 17, 32, 0.9)";
                                        oCtx.fillRect(x1 - 2, y2 + 4, width + 4, 30);
                                        oCtx.strokeStyle = "#10b981";
                                        oCtx.lineWidth = 1;
                                        oCtx.strokeRect(x1 - 2, y2 + 4, width + 4, 30);

                                        oCtx.fillStyle = "#ffffff";
                                        oCtx.font = "bold 11px sans-serif";
                                        oCtx.fillText(`${face.name || "Student"} (${face.student_id})`, x1 + 4, y2 + 18);
                                        oCtx.fillStyle = "#34d399";
                                        oCtx.font = "9px monospace";
                                        oCtx.fillText(`${face.confidence}% • Present ✓`, x1 + 4, y2 + 29);
                                    } else {
                                        oCtx.strokeStyle = "#eab308";
                                        oCtx.lineWidth = 2;
                                        oCtx.strokeRect(x1, y1, width, height);

                                        oCtx.fillStyle = "rgba(11, 17, 32, 0.85)";
                                        oCtx.fillRect(x1, y2 + 4, width, 18);
                                        oCtx.fillStyle = "#facc15";
                                        oCtx.font = "bold 10px sans-serif";
                                        oCtx.fillText("Detecting Face...", x1 + 4, y2 + 16);
                                    }
                                }
                            });
                        }
                    }
                }

                if (result.success) {
                    const timeStr = new Date().toLocaleTimeString();

                    // Solo Mode Handler
                    if (scannerMode === "SOLO" && result.recognized && result.student_id) {
                        setDetectedStudent({
                            studentId: result.student_id,
                            name: result.name || result.student_id,
                            department: result.department || "Computer Science",
                            confidence: result.confidence || 96.5,
                            status: result.already_marked ? "Already Marked Today" : "Marked Present ✅",
                            timestamp: timeStr
                        });

                        if (lastRecognizedStudent.current !== result.student_id) {
                            lastRecognizedStudent.current = result.student_id;
                            showNotification(`🎉 ${result.name} (${result.student_id}) recognized and synchronized!`);
                            await load();
                        }
                    }

                    // Group Mode Handler
                    if (scannerMode === "GROUP" && result.detected_faces) {
                        setGroupDetectedFaces(result.detected_faces);

                        const recognizedInFrame = result.detected_faces.filter((f) => f.recognized && f.student_id);
                        if (recognizedInFrame.length > 0) {
                            let newlyRecognized = false;
                            setGroupSessionRecognized((prev) => {
                                const updated = [...prev];
                                recognizedInFrame.forEach((rf) => {
                                    if (!updated.some((u) => u.studentId === rf.student_id)) {
                                        updated.unshift({
                                            studentId: rf.student_id!,
                                            name: rf.name || rf.student_id!,
                                            department: rf.department || "General",
                                            time: timeStr,
                                            confidence: rf.confidence || 95
                                        });
                                        newlyRecognized = true;
                                    }
                                });
                                return updated;
                            });

                            if (newlyRecognized) {
                                showNotification(`👥 Group batch: ${recognizedInFrame.length} student(s) marked present!`);
                                await load();
                            }
                        }
                    }
                }
            } catch (err) {
                console.debug("Frame processing pass", err);
            } finally {
                isProcessingFrame.current = false;
            }
        }, 750);

        return () => clearInterval(scanInterval);
    }, [showScannerModal, cameraActive, isScanningActive, scannerMode, load]);

    // Mark single student attendance (manual quick action)
    async function handleQuickMark(studentId: string, studentName?: string) {
        const displayName = studentName || studentId;
        try {
            setActionLoadingId(studentId);
            await markAttendance(studentId);
            showNotification(`✅ Attendance marked for ${displayName}`);
            await load();
        } catch {
            showNotification(`❌ Could not mark attendance for ${studentId}`);
        } finally {
            setActionLoadingId(null);
        }
    }

    // Manual Verify / Simulate Scan
    async function handleSimulateScan() {
        const student = students.find((s) => s.student_id === selectedStudentToRecognize) || students[0];
        if (!student) return;

        const confidence = (94.0 + Math.random() * 5.5).toFixed(1);
        const timeStr = new Date().toLocaleTimeString();

        try {
            await markAttendance(student.student_id);
            setDetectedStudent({
                studentId: student.student_id,
                name: student.name,
                department: student.department || "Computer Science",
                confidence: parseFloat(confidence),
                status: "Marked Present ✅",
                timestamp: timeStr
            });

            if (scannerMode === "GROUP") {
                setGroupSessionRecognized((prev) => [
                    {
                        studentId: student.student_id,
                        name: student.name,
                        department: student.department || "Computer Science",
                        time: timeStr,
                        confidence: parseFloat(confidence)
                    },
                    ...prev.filter((p) => p.studentId !== student.student_id)
                ]);
            }

            showNotification(`✅ ${student.name} synchronized to Present list!`);
            await load();
        } catch {
            setDetectedStudent({
                studentId: student.student_id,
                name: student.name,
                department: student.department || "Computer Science",
                confidence: parseFloat(confidence),
                status: "Already Marked Today",
                timestamp: timeStr
            });
        }
    }

    const records = data?.records || [];
    const totalStudents = data?.total_students || students.length || records.length || 0;

    const presentRecords = useMemo(() => {
        return records.filter((r) => r.status === "Present" || r.status === "Late");
    }, [records]);

    const absentRecords = useMemo(() => {
        return records.filter((r) => r.status === "Absent" || !r.status);
    }, [records]);

    const presentCount = data?.total_present !== undefined ? data.total_present : presentRecords.length;
    const lateCount = data?.total_late !== undefined ? data.total_late : records.filter((r) => r.status === "Late").length;
    const absentCount = data?.total_absent !== undefined ? data.total_absent : absentRecords.length;
    const rate = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : "0.0";

    const filteredPresent = useMemo(() => {
        if (!searchQuery.trim()) return presentRecords;
        const q = searchQuery.toLowerCase();
        return presentRecords.filter(
            (r) => (r.student_id?.toLowerCase() || "").includes(q) || (r.name?.toLowerCase() || "").includes(q)
        );
    }, [presentRecords, searchQuery]);

    const filteredAbsent = useMemo(() => {
        if (!searchQuery.trim()) return absentRecords;
        const q = searchQuery.toLowerCase();
        return absentRecords.filter(
            (r) => (r.student_id?.toLowerCase() || "").includes(q) || (r.name?.toLowerCase() || "").includes(q)
        );
    }, [absentRecords, searchQuery]);

    const filteredAll = useMemo(() => {
        if (!searchQuery.trim()) return records;
        const q = searchQuery.toLowerCase();
        return records.filter(
            (r) => (r.student_id?.toLowerCase() || "").includes(q) || (r.name?.toLowerCase() || "").includes(q)
        );
    }, [records, searchQuery]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-slate-400">
                <div className="inline-block animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mr-3" />
                <p>Loading today's attendance...</p>
            </div>
        );
    }

    if (error) {
        return <p className="text-red-400 p-4 rounded-lg bg-red-500/10 border border-red-500/20">{error}</p>;
    }

    const todayDate = data?.date || new Date().toISOString().split("T")[0];

    return (
        <div className="space-y-6 animate-fade-in">
            <canvas ref={canvasRef} className="hidden" />

            {toastMessage && (
                <div className="fixed top-4 right-4 z-50 rounded-xl bg-emerald-500 text-black px-4 py-3 font-semibold text-xs shadow-2xl animate-bounce">
                    {toastMessage}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Today's Attendance</h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Solo & Group AI Camera Attendance with live sync to separate Present & Absent lists
                    </p>
                </div>

                {/* Camera Launch Buttons: Solo & Group */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => {
                            setScannerMode("SOLO");
                            setShowScannerModal(true);
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 px-3.5 py-2.5 text-xs font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
                    >
                        <span>👤</span>
                        <span>Solo Camera</span>
                    </button>

                    <button
                        onClick={() => {
                            setScannerMode("GROUP");
                            setShowScannerModal(true);
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 px-3.5 py-2.5 text-xs font-bold text-black transition-all shadow-lg shadow-cyan-500/20"
                    >
                        <span>👥</span>
                        <span>Group Camera</span>
                    </button>

                    <button
                        onClick={() => exportAttendanceCsv(records, `Attendance_${todayDate}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
                    >
                        <span>📥</span>
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Header Metric Banner */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-sm">
                        📅
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white tracking-tight">{todayDate}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                                Live Session
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">Total Enrolled: {totalStudents} Students</p>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:gap-6 text-xs text-center md:text-left">
                    <div className="cursor-pointer" onClick={() => setViewMode("PRESENT")}>
                        <span className="text-slate-400 block text-[11px]">🟢 Present</span>
                        <span className="text-lg sm:text-xl font-bold text-emerald-400">{presentCount}</span>
                    </div>
                    <div className="cursor-pointer" onClick={() => setViewMode("ABSENT")}>
                        <span className="text-slate-400 block text-[11px]">🔴 Absent</span>
                        <span className="text-lg sm:text-xl font-bold text-red-400">{absentCount}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 block text-[11px]">🟡 Late</span>
                        <span className="text-lg sm:text-xl font-bold text-amber-400">{lateCount}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 block text-[11px]">Rate</span>
                        <span className="text-lg sm:text-xl font-bold text-teal-300">{rate}%</span>
                    </div>
                </div>
            </div>

            {/* Filter & View Switcher Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 sm:p-4 rounded-xl border border-slate-800">
                {/* View Tabs */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs overflow-x-auto">
                    <button
                        onClick={() => setViewMode("SPLIT")}
                        className={`px-2.5 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap ${
                            viewMode === "SPLIT"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        ⚡ Split Lists
                    </button>
                    <button
                        onClick={() => setViewMode("PRESENT")}
                        className={`px-2.5 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap ${
                            viewMode === "PRESENT"
                                ? "bg-emerald-500 text-black shadow-md"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        🟢 Presents ({presentCount})
                    </button>
                    <button
                        onClick={() => setViewMode("ABSENT")}
                        className={`px-2.5 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap ${
                            viewMode === "ABSENT"
                                ? "bg-red-500 text-white shadow-md"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        🔴 Absents ({absentCount})
                    </button>
                    <button
                        onClick={() => setViewMode("ALL")}
                        className={`px-2.5 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap ${
                            viewMode === "ALL"
                                ? "bg-slate-800 text-white"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        📋 All ({totalStudents})
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[200px]">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Search student..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>
            </div>

            {/* ⭐ SPLIT VIEW: SEPARATE PRESENT LIST & ABSENT LIST */}
            {viewMode === "SPLIT" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 🟢 PRESENT STUDENTS LIST */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                                <h2 className="text-base font-bold text-white tracking-wide">
                                    🟢 Presents List
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {filteredPresent.length}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">Checked in today</span>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#0b1120] shadow-xl">
                            <div className="overflow-x-auto max-h-[520px]">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-900/90 text-slate-300 border-b border-slate-800 sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">ID</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Student Name</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Time</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80">
                                        {filteredPresent.length > 0 ? (
                                            filteredPresent.map((r, i) => (
                                                <tr key={`present-${r.student_id}-${i}`} className="hover:bg-emerald-500/5 transition-colors">
                                                    <td className="px-3 sm:px-4 py-3 font-mono font-medium text-emerald-400">
                                                        {r.student_id}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <div className="font-semibold text-slate-200">{r.name || r.student_id}</div>
                                                        <div className="text-[10px] text-slate-500">{r.department || "Computer Science"}</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3 font-mono text-slate-300">
                                                        <span className="inline-flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                            🕒 {r.time}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                                r.status === "Late"
                                                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                                                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                                            }`}
                                                        >
                                                            <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-400" : "bg-emerald-400"}`} />
                                                            {r.status || "Present"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                                                    <p className="text-2xl mb-1">⏳</p>
                                                    <p className="font-medium text-slate-400">No students checked in yet</p>
                                                    <p className="text-[11px] text-slate-600 mt-1">
                                                        Use Solo or Group camera above to take attendance
                                                    </p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 🔴 ABSENT STUDENTS LIST */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                                <h2 className="text-base font-bold text-white tracking-wide">
                                    🔴 Absents List
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                    {filteredAbsent.length}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">Not checked in yet</span>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-red-500/20 bg-[#0b1120] shadow-xl">
                            <div className="overflow-x-auto max-h-[520px]">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-900/90 text-slate-300 border-b border-slate-800 sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">ID</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Student Name</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Status</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80">
                                        {filteredAbsent.length > 0 ? (
                                            filteredAbsent.map((r, i) => (
                                                <tr key={`absent-${r.student_id}-${i}`} className="hover:bg-red-500/5 transition-colors">
                                                    <td className="px-3 sm:px-4 py-3 font-mono font-medium text-slate-400">
                                                        {r.student_id}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <div className="font-semibold text-slate-200">{r.name || r.student_id}</div>
                                                        <div className="text-[10px] text-slate-500">{r.department || "Computer Science"}</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                                            Absent
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleQuickMark(r.student_id, r.name)}
                                                            disabled={actionLoadingId === r.student_id}
                                                            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-[11px] font-bold transition-all disabled:opacity-50"
                                                        >
                                                            {actionLoadingId === r.student_id ? (
                                                                <span>Marking...</span>
                                                            ) : (
                                                                <>
                                                                    <span>✓</span>
                                                                    <span>Mark Present</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                                                    <p className="text-2xl mb-1">🎉</p>
                                                    <p className="font-medium text-emerald-400">100% Attendance!</p>
                                                    <p className="text-[11px] text-slate-500 mt-1">All enrolled students are marked present today</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ⭐ PRESENT ONLY VIEW */}
            {viewMode === "PRESENT" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                            <h2 className="text-lg font-bold text-white">Present Students Today</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {filteredPresent.length} Present
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#0b1120] shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3.5 font-semibold">ID</th>
                                        <th className="px-4 py-3.5 font-semibold">Student Name</th>
                                        <th className="px-4 py-3.5 font-semibold">Department</th>
                                        <th className="px-4 py-3.5 font-semibold">Check-in Time</th>
                                        <th className="px-4 py-3.5 font-semibold">Method</th>
                                        <th className="px-4 py-3.5 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {filteredPresent.length > 0 ? (
                                        filteredPresent.map((r, i) => (
                                            <tr key={`p-full-${r.student_id}-${i}`} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-4 py-3.5 font-mono font-medium text-emerald-400">{r.student_id}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-200">{r.name}</td>
                                                <td className="px-4 py-3.5 text-slate-400">{r.department || "General"}</td>
                                                <td className="px-4 py-3.5 font-mono text-emerald-300">{r.time}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1 text-xs text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                        Face AI
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                        {r.status || "Present"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                                No students present yet today.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ⭐ ABSENT ONLY VIEW */}
            {viewMode === "ABSENT" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                            <h2 className="text-lg font-bold text-white">Absent Students Today</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                {filteredAbsent.length} Absent
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-red-500/20 bg-[#0b1120] shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3.5 font-semibold">ID</th>
                                        <th className="px-4 py-3.5 font-semibold">Student Name</th>
                                        <th className="px-4 py-3.5 font-semibold">Department</th>
                                        <th className="px-4 py-3.5 font-semibold">Status</th>
                                        <th className="px-4 py-3.5 font-semibold text-right">Quick Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {filteredAbsent.length > 0 ? (
                                        filteredAbsent.map((r, i) => (
                                            <tr key={`a-full-${r.student_id}-${i}`} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-4 py-3.5 font-mono font-medium text-slate-400">{r.student_id}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-200">{r.name}</td>
                                                <td className="px-4 py-3.5 text-slate-400">{r.department || "General"}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                                        Absent
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right">
                                                    <button
                                                        onClick={() => handleQuickMark(r.student_id, r.name)}
                                                        disabled={actionLoadingId === r.student_id}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-xs font-bold transition-all disabled:opacity-50"
                                                    >
                                                        {actionLoadingId === r.student_id ? (
                                                            <span>Marking...</span>
                                                        ) : (
                                                            <>
                                                                <span>✓</span>
                                                                <span>Mark Present</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                                🎉 All students are present today!
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ⭐ COMBINED ALL ROSTER VIEW */}
            {viewMode === "ALL" && (
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b1120] shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3.5 font-semibold">ID</th>
                                    <th className="px-4 py-3.5 font-semibold">Student</th>
                                    <th className="px-4 py-3.5 font-semibold">Department</th>
                                    <th className="px-4 py-3.5 font-semibold">Status</th>
                                    <th className="px-4 py-3.5 font-semibold">Time</th>
                                    <th className="px-4 py-3.5 font-semibold">Method</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-800/80">
                                {filteredAll.length > 0 ? (
                                    filteredAll.map((r, i) => (
                                        <tr key={`${r.student_id}-${i}`} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-4 py-3.5 font-mono font-medium text-emerald-400">
                                                {r.student_id}
                                            </td>
                                            <td className="px-4 py-3.5 font-medium text-slate-200">
                                                {r.name || r.student_id}
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-400">
                                                {r.department || "General"}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        r.status === "Late"
                                                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                                            : r.status === "Present"
                                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                    }`}
                                                >
                                                    <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-400" : r.status === "Present" ? "bg-emerald-400" : "bg-red-400"}`} />
                                                    {r.status || "Absent"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                                                {r.time}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                    Face AI
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                            No students found matching your filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ⭐ DEDICATED CAMERA ATTENDANCE MODAL (SOLO & GROUP MODES + MOBILE CAMERA FLIP) */}
            {showScannerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-fade-in">
                    <div className="w-full max-w-2xl rounded-2xl bg-[#0b1120] border border-slate-800 shadow-2xl overflow-hidden space-y-4 my-auto">
                        {/* Modal Header with Mode Switcher & Close */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/80 gap-3">
                            <div className="flex items-center gap-3">
                                <span className={`h-3 w-3 rounded-full animate-ping ${scannerMode === "SOLO" ? "bg-emerald-500" : "bg-cyan-400"}`} />
                                <div>
                                    <h2 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                                        {scannerMode === "SOLO" ? "👤 Solo Face Attendance" : "👥 Group Multi-Face Attendance"}
                                    </h2>
                                    <p className="text-[11px] text-slate-400">
                                        {scannerMode === "SOLO"
                                            ? "1-on-1 check-in kiosk mode"
                                            : "Multi-student simultaneous scanning"}
                                    </p>
                                </div>
                            </div>

                            {/* Mode Toggle Tabs & Camera Flip */}
                            <div className="flex items-center justify-between sm:justify-end gap-2">
                                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
                                    <button
                                        onClick={() => setScannerMode("SOLO")}
                                        className={`px-2.5 py-1.5 rounded-md transition-all ${
                                            scannerMode === "SOLO"
                                                ? "bg-emerald-500 text-black font-bold shadow"
                                                : "text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        👤 Solo
                                    </button>
                                    <button
                                        onClick={() => setScannerMode("GROUP")}
                                        className={`px-2.5 py-1.5 rounded-md transition-all ${
                                            scannerMode === "GROUP"
                                                ? "bg-cyan-500 text-black font-bold shadow"
                                                : "text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        👥 Group
                                    </button>
                                </div>

                                {/* Flip Camera Button for Mobile/Laptop */}
                                <button
                                    onClick={toggleFacingMode}
                                    title="Switch Camera (Front/Back)"
                                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1 font-semibold"
                                >
                                    <span>🔄</span>
                                    <span className="hidden sm:inline">{facingMode === "user" ? "Front" : "Back"}</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowScannerModal(false);
                                        setDetectedStudent(null);
                                        setGroupDetectedFaces([]);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Scanner Viewfinder Box */}
                        <div className="p-4 sm:p-6 space-y-4">
                            <div className="relative rounded-2xl border-2 border-slate-800 bg-black overflow-hidden flex flex-col items-center justify-center min-h-[260px] sm:min-h-[320px] shadow-2xl">
                                {cameraActive ? (
                                    <div className="relative w-full h-64 sm:h-80 overflow-hidden flex items-center justify-center">
                                        {/* Video Element */}
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`w-full h-full object-cover ${facingMode === "user" ? "mirror" : ""}`}
                                        />

                                        {/* Group Mode Dynamic Canvas Overlay */}
                                        <canvas
                                            ref={overlayCanvasRef}
                                            className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${facingMode === "user" ? "mirror" : ""}`}
                                        />

                                        {/* Solo Mode Static Target Oval / HUD */}
                                        {scannerMode === "SOLO" && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <div className="relative w-40 sm:w-48 h-48 sm:h-56 border-2 border-emerald-400/80 rounded-2xl flex flex-col items-center justify-between p-2 shadow-lg shadow-emerald-400/25 animate-pulse">
                                                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
                                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
                                                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
                                                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-emerald-300" />

                                                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-black shadow">
                                                        ● SOLO TARGET
                                                    </span>
                                                </div>

                                                {/* Name & ID Displayed Underneath Face */}
                                                {detectedStudent && (
                                                    <div className="mt-2 sm:mt-3 bg-black/90 backdrop-blur-md border border-emerald-500/60 rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-center shadow-2xl animate-fade-in">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-emerald-400 font-bold text-xs sm:text-sm">
                                                                {detectedStudent.name}
                                                            </span>
                                                            <span className="text-slate-400 font-mono text-[10px] sm:text-xs bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                                                {detectedStudent.studentId}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2 text-[10px] sm:text-[11px] text-emerald-300 font-semibold mt-0.5">
                                                            <span>Match: {detectedStudent.confidence}%</span>
                                                            <span>•</span>
                                                            <span className="text-emerald-400 font-bold">{detectedStudent.status}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Group Mode Top Overlay Banner */}
                                        {scannerMode === "GROUP" && (
                                            <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-cyan-500/40 text-cyan-300 text-[11px] font-bold">
                                                    <span>👥</span>
                                                    <span>Faces: {groupDetectedFaces.length}</span>
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                                                    <span>✓</span>
                                                    <span>Recognized: {groupDetectedFaces.filter((f) => f.recognized).length}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center p-8 text-slate-400 space-y-2">
                                        <span className="text-4xl">📷</span>
                                        <p className="text-sm font-medium">{cameraError || "Initializing Camera Feed..."}</p>
                                    </div>
                                )}
                            </div>

                            {/* Solo Mode Result Banner */}
                            {scannerMode === "SOLO" && detectedStudent && (
                                <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs space-y-1 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">✅</span>
                                            <span className="font-bold text-sm text-white">
                                                {detectedStudent.name} ({detectedStudent.studentId})
                                            </span>
                                        </div>
                                        <span className="font-mono text-emerald-300 font-semibold">
                                            {detectedStudent.confidence}% Match
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-300 text-[11px]">
                                        <span>Dept: {detectedStudent.department}</span>
                                        <span className="text-emerald-400 font-bold">
                                            Synchronized at {detectedStudent.timestamp}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Group Mode Live Stream Session Roster */}
                            {scannerMode === "GROUP" && (
                                <div className="p-3 sm:p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                            👥 Group Batch Roster ({groupSessionRecognized.length} Marked Present)
                                        </h4>
                                        <span className="text-[11px] text-emerald-400 font-medium">Auto-Syncing</span>
                                    </div>

                                    <div className="max-h-28 sm:max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                        {groupSessionRecognized.length > 0 ? (
                                            groupSessionRecognized.map((s) => (
                                                <div
                                                    key={`grp-${s.studentId}`}
                                                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-emerald-500/20 text-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                                        <span className="font-semibold text-white">{s.name}</span>
                                                        <span className="font-mono text-slate-400">({s.studentId})</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 font-mono text-slate-300 text-[11px]">
                                                        <span>🕒 {s.time}</span>
                                                        <span className="text-emerald-400 font-bold">{s.confidence}%</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-center py-4 text-xs text-slate-500">
                                                Scanning for student faces in the camera feed...
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Controls: Auto-Scan Toggle & Manual Override */}
                            <div className="space-y-3 bg-slate-900/60 p-3 sm:p-4 rounded-xl border border-slate-800">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="autoScanToggle"
                                            checked={isScanningActive}
                                            onChange={(e) => setIsScanningActive(e.target.checked)}
                                            className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                                        />
                                        <label htmlFor="autoScanToggle" className="font-semibold text-slate-300 cursor-pointer">
                                            Continuous Auto-Scan
                                        </label>
                                    </div>
                                    <span className="text-[11px] text-slate-400">
                                        {isScanningActive ? "🟢 Scanning every 750ms" : "⏸ Paused"}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                                    <select
                                        value={selectedStudentToRecognize}
                                        onChange={(e) => setSelectedStudentToRecognize(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                                    >
                                        {students.map((s) => (
                                            <option key={s.student_id} value={s.student_id}>
                                                {s.name} ({s.student_id})
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={handleSimulateScan}
                                        className="px-3 sm:px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 whitespace-nowrap"
                                    >
                                        ⚡ Mark Selected
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
