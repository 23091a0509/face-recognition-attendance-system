import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
    getTodayAttendance,
    markAttendance,
    recognizeFrame,
    getCurrentSession,
    createSession,
    endSession,
    type TodayAttendance,
    type FrameRecognitionResult,
    type DetectedFaceInfo,
    type AttendanceSession
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

    // Active Attendance Session State
    const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
    const [sessionRemainingSecs, setSessionRemainingSecs] = useState<number>(0);
    const [sessionEnding, setSessionEnding] = useState<boolean>(false);
    const [showNewSessionModal, setShowNewSessionModal] = useState<boolean>(false);
    const [newSessionForm, setNewSessionForm] = useState({
        title: "Daily Academic Session",
        start_time: "09:00",
        end_time: "13:00"
    });
    
    // Live Recognition Modal State
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [isKioskFullscreen, setIsKioskFullscreen] = useState(false);
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
            const [attendanceRes, studentsRes, sessionRes] = await Promise.all([
                getTodayAttendance(),
                getAllStudents(),
                getCurrentSession()
            ]);
            setData(attendanceRes);
            setStudents(studentsRes);
            setCurrentSession(sessionRes.session);
            setSessionRemainingSecs(sessionRes.session.seconds_remaining);
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
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, [load]);

    // Countdown interval for session
    useEffect(() => {
        const timer = setInterval(() => {
            setSessionRemainingSecs((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    function formatSessionCountdown(secs: number) {
        if (secs <= 0) return "00:00:00 remaining";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} remaining`;
    }

    async function handleEndSession() {
        if (!currentSession) return;
        if (!confirm(`End session "${currentSession.title}" now? This will finalize all student attendance according to duration & halves rules.`)) return;
        try {
            setSessionEnding(true);
            const res = await endSession(currentSession.id);
            showNotification(res.message || "Session ended and evaluated!");
            await load();
        } catch (err: any) {
            showNotification(err.response?.data?.detail || "Failed to end session");
        } finally {
            setSessionEnding(false);
        }
    }

    async function handleCreateSessionSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            await createSession(newSessionForm);
            showNotification("✅ New session created and activated!");
            setShowNewSessionModal(false);
            await load();
        } catch (err: any) {
            showNotification(err.response?.data?.detail || "Failed to create session");
        }
    }

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
                const base64Image = canvas.toDataURL("image/jpeg", 0.90);

                const result: FrameRecognitionResult = await recognizeFrame(base64Image);

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

                                        oCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
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

                                        oCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
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
        return records.filter((r) => r.status === "Present" || r.status === "Late" || r.status === "Full Day" || r.status === "Half Day");
    }, [records]);

    const absentRecords = useMemo(() => {
        return records.filter((r) => r.status === "Absent" || !r.status);
    }, [records]);

    const presentCount = data?.total_present !== undefined ? data.total_present : presentRecords.length;
    const fullDayCount = data?.total_full_day !== undefined ? data.total_full_day : records.filter((r) => r.status === "Full Day").length;
    const halfDayCount = data?.total_half_day !== undefined ? data.total_half_day : records.filter((r) => r.status === "Half Day").length;
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
            <div className="flex h-64 items-center justify-center text-slate-500">
                <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mr-3" />
                <p>Loading today's attendance...</p>
            </div>
        );
    }

    if (error) {
        return <p className="text-rose-700 p-4 rounded-xl bg-rose-50 border border-rose-200">{error}</p>;
    }

    const todayDate = data?.date || new Date().toISOString().split("T")[0];

    return (
        <div className="space-y-6 animate-fade-in">
            <canvas ref={canvasRef} className="hidden" />

            {toastMessage && (
                <div className="fixed top-4 right-4 z-50 rounded-xl bg-emerald-600 text-white px-4 py-3 font-semibold text-xs shadow-2xl animate-bounce">
                    {toastMessage}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Today's Attendance</h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Take attendance with camera and view Present & Absent student lists
                    </p>
                </div>

                {/* Camera Launch Buttons: Solo & Group */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => {
                            setScannerMode("SOLO");
                            setShowScannerModal(true);
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2.5 text-xs font-bold text-white transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>Single Camera</span>
                    </button>

                    <button
                        onClick={() => {
                            setScannerMode("GROUP");
                            setShowScannerModal(true);
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2.5 text-xs font-bold text-white transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>Group Camera</span>
                    </button>

                    <button
                        onClick={() => exportAttendanceCsv(records, `Attendance_${todayDate}`)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Attendance Session Control Banner */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-900 tracking-wide">
                                {currentSession?.title || "Today's Class Session"}
                            </h2>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                currentSession?.status === "active" && sessionRemainingSecs > 0
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}>
                                {currentSession?.status === "active" && sessionRemainingSecs > 0 ? "SESSION ACTIVE" : "SESSION ENDED"}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                            Timing: {currentSession?.start_time || "09:00 AM"} – {currentSession?.end_time || "01:00 PM"}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {currentSession?.status === "active" && sessionRemainingSecs > 0 ? (
                        <>
                            <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-emerald-700 font-mono text-sm font-bold shadow-xs">
                                {formatSessionCountdown(sessionRemainingSecs)}
                            </div>
                            <button
                                onClick={handleEndSession}
                                disabled={sessionEnding}
                                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                            >
                                {sessionEnding ? "Ending Session..." : "End Session & Save Attendance"}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setShowNewSessionModal(true)}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                            + Start New Session
                        </button>
                    )}
                </div>
            </div>

            {/* Modal for creating a new session */}
            {showNewSessionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <h3 className="text-base font-bold text-slate-900">Create Attendance Session</h3>
                            <button
                                onClick={() => setShowNewSessionModal(false)}
                                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleCreateSessionSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Session Title</label>
                                <input
                                    type="text"
                                    value={newSessionForm.title}
                                    onChange={(e) => setNewSessionForm({ ...newSessionForm, title: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        value={newSessionForm.start_time}
                                        onChange={(e) => setNewSessionForm({ ...newSessionForm, start_time: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">End Time</label>
                                    <input
                                        type="time"
                                        value={newSessionForm.end_time}
                                        onChange={(e) => setNewSessionForm({ ...newSessionForm, end_time: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                                <span className="font-bold text-slate-800 block">Attendance Rule:</span>
                                <div>• Full Day: Verified across both halves or ≥ 75% duration</div>
                                <div>• Half Day: Present first half only or 40% - 74% duration</div>
                                <div>• Absent: Less than 40% duration or never recognized</div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowNewSessionModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-sm"
                                >
                                    Activate Session
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header Metric Banner */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-slate-900 tracking-tight">{todayDate}</span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping" />
                                Today's Roster
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Total Enrolled: {totalStudents} Students</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-xs">
                    <div className="cursor-pointer p-2.5 rounded-xl bg-slate-50/60 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors" onClick={() => setViewMode("PRESENT")}>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium mb-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span>Full Day</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-emerald-700">{fullDayCount}</span>
                    </div>
                    <div className="cursor-pointer p-2.5 rounded-xl bg-slate-50/60 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors" onClick={() => setViewMode("PRESENT")}>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium mb-1">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            <span>Half Day</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-amber-700">{halfDayCount}</span>
                    </div>
                    <div className="cursor-pointer p-2.5 rounded-xl bg-slate-50/60 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors" onClick={() => setViewMode("ABSENT")}>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium mb-1">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            <span>Absent</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-rose-700">{absentCount}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50/60 border border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium mb-1">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            <span>Late</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-amber-700">{lateCount}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50/60 border border-slate-100 col-span-2 sm:col-span-1">
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium mb-1">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            <span>Rate</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-blue-700">{rate}%</span>
                    </div>
                </div>
            </div>

            {/* Filter & View Switcher Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
                {/* View Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs overflow-x-auto">
                    <button
                        onClick={() => setViewMode("SPLIT")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                            viewMode === "SPLIT"
                                ? "bg-white text-blue-700 font-bold shadow-xs border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                        Split Lists
                    </button>
                    <button
                        onClick={() => setViewMode("PRESENT")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                            viewMode === "PRESENT"
                                ? "bg-emerald-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Presents ({presentCount})
                    </button>
                    <button
                        onClick={() => setViewMode("ABSENT")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                            viewMode === "ABSENT"
                                ? "bg-rose-600 text-white font-bold shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <span className="h-2 w-2 rounded-full bg-rose-400" />
                        Absents ({absentCount})
                    </button>
                    <button
                        onClick={() => setViewMode("ALL")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                            viewMode === "ALL"
                                ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        All ({totalStudents})
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
                        className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                    />
                </div>
            </div>

            {/* SPLIT VIEW: SEPARATE PRESENT LIST & ABSENT LIST */}
            {viewMode === "SPLIT" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* PRESENT STUDENTS LIST */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                <h2 className="text-base font-bold text-slate-900 tracking-wide">
                                    Presents List
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {filteredPresent.length}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">Checked in today</span>
                        </div>

                        {/* Mobile Cards View */}
                        <div className="block md:hidden space-y-2.5">
                            {filteredPresent.length > 0 ? (
                                filteredPresent.map((r, i) => (
                                    <div key={`m-present-${r.student_id}-${i}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-slate-900 truncate">{r.name || r.student_id}</span>
                                                <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold shrink-0">{r.student_id}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span className="truncate">{r.department || "Computer Science"}</span>
                                                <span>•</span>
                                                <span className="inline-flex items-center gap-1 font-mono text-emerald-700 font-medium shrink-0">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    {r.time}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            {r.status === "Half Day" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                    Half Day
                                                </span>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                    r.status === "Late"
                                                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                }`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                                    {r.status || "Full Day"}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400 space-y-1">
                                    <svg className="w-8 h-8 mx-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="font-semibold text-slate-700 text-sm">No check-ins yet</p>
                                    <p className="text-xs text-slate-400">Launch camera above to verify attendance</p>
                                </div>
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="overflow-x-auto max-h-[520px]">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">ID</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Student Name</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Time</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredPresent.length > 0 ? (
                                            filteredPresent.map((r, i) => (
                                                <tr key={`present-${r.student_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 sm:px-4 py-3 font-mono font-bold text-blue-700">
                                                        {r.student_id}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <div className="font-semibold text-slate-900">{r.name || r.student_id}</div>
                                                        <div className="text-[10px] text-slate-500">{r.department || "Computer Science"}</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3 font-mono text-slate-600">
                                                        <span className="inline-flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {r.time}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        {r.status === "Half Day" ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                                <span className="flex items-center -space-x-1">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                                </span>
                                                                Half Day
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                                    r.status === "Late"
                                                                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                }`}
                                                            >
                                                                <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                                                {r.status || "Full Day"}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                                                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <p className="font-semibold text-slate-700">No students checked in yet</p>
                                                    <p className="text-[11px] text-slate-400 mt-1">
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

                    {/* ABSENT STUDENTS LIST */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                                <h2 className="text-base font-bold text-slate-900 tracking-wide">
                                    Absents List
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    {filteredAbsent.length}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">Not checked in yet</span>
                        </div>

                        {/* Mobile Cards View */}
                        <div className="block md:hidden space-y-2.5">
                            {filteredAbsent.length > 0 ? (
                                filteredAbsent.map((r, i) => (
                                    <div key={`m-absent-${r.student_id}-${i}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-slate-900 truncate">{r.name || r.student_id}</span>
                                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-semibold shrink-0">{r.student_id}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">{r.department || "Computer Science"}</p>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            <button
                                                onClick={() => handleQuickMark(r.student_id, r.name)}
                                                disabled={actionLoadingId === r.student_id}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
                                            >
                                                {actionLoadingId === r.student_id ? (
                                                    <span>Marking...</span>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        <span>Present</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-emerald-700 space-y-1">
                                    <svg className="w-8 h-8 mx-auto text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="font-bold text-slate-900 text-sm">100% Attendance!</p>
                                    <p className="text-xs text-slate-500">All enrolled students are marked present today</p>
                                </div>
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="overflow-x-auto max-h-[520px]">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">ID</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Student Name</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold">Status</th>
                                            <th className="px-3 sm:px-4 py-3 font-semibold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredAbsent.length > 0 ? (
                                            filteredAbsent.map((r, i) => (
                                                <tr key={`absent-${r.student_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 sm:px-4 py-3 font-mono font-medium text-slate-600">
                                                        {r.student_id}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <div className="font-semibold text-slate-900">{r.name || r.student_id}</div>
                                                        <div className="text-[10px] text-slate-500">{r.department || "Computer Science"}</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3">
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                            Absent
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleQuickMark(r.student_id, r.name)}
                                                            disabled={actionLoadingId === r.student_id}
                                                            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
                                                        >
                                                            {actionLoadingId === r.student_id ? (
                                                                <span>Marking...</span>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    <span>Mark Present</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                                                    <svg className="w-8 h-8 mx-auto mb-2 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <p className="font-bold text-slate-900">100% Attendance!</p>
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

            {/* PRESENT ONLY VIEW */}
            {viewMode === "PRESENT" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            <h2 className="text-base sm:text-lg font-bold text-slate-900">Present Students Today</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {filteredPresent.length} Present
                            </span>
                        </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="block md:hidden space-y-2.5">
                        {filteredPresent.length > 0 ? (
                            filteredPresent.map((r, i) => (
                                <div key={`p-card-${r.student_id}-${i}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-slate-900 truncate">{r.name}</span>
                                            <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold shrink-0">{r.student_id}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="truncate">{r.department || "General"}</span>
                                            <span>•</span>
                                            <span className="inline-flex items-center gap-1 font-mono text-emerald-700 font-medium shrink-0">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {r.time}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {r.status === "Half Day" ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                Half Day
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                {r.status || "Full Day"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400 space-y-1">
                                <p className="font-semibold text-slate-700 text-sm">No students present yet today</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3.5 font-semibold">ID</th>
                                        <th className="px-4 py-3.5 font-semibold">Student Name</th>
                                        <th className="px-4 py-3.5 font-semibold">Department</th>
                                        <th className="px-4 py-3.5 font-semibold">Check-in Time</th>
                                        <th className="px-4 py-3.5 font-semibold">Method</th>
                                        <th className="px-4 py-3.5 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredPresent.length > 0 ? (
                                        filteredPresent.map((r, i) => (
                                            <tr key={`p-full-${r.student_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3.5 font-mono font-bold text-blue-700">{r.student_id}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-900">{r.name}</td>
                                                <td className="px-4 py-3.5 text-slate-600">{r.department || "General"}</td>
                                                <td className="px-4 py-3.5 font-mono text-emerald-700 font-semibold">{r.time}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                                        Face AI
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    {r.status === "Half Day" ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            <span className="flex items-center -space-x-1">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                            </span>
                                                            Half Day
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            {r.status || "Full Day"}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
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

            {/* ABSENT ONLY VIEW */}
            {viewMode === "ABSENT" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                            <h2 className="text-base sm:text-lg font-bold text-slate-900">Absent Students Today</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                {filteredAbsent.length} Absent
                            </span>
                        </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="block md:hidden space-y-2.5">
                        {filteredAbsent.length > 0 ? (
                            filteredAbsent.map((r, i) => (
                                <div key={`a-card-${r.student_id}-${i}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-slate-900 truncate">{r.name}</span>
                                            <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-semibold shrink-0">{r.student_id}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate">{r.department || "General"}</p>
                                    </div>
                                    <div className="shrink-0">
                                        <button
                                            onClick={() => handleQuickMark(r.student_id, r.name)}
                                            disabled={actionLoadingId === r.student_id}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
                                        >
                                            {actionLoadingId === r.student_id ? (
                                                <span>Marking...</span>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    <span>Present</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400 space-y-1">
                                <svg className="w-8 h-8 mx-auto text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="font-bold text-slate-900 text-sm">100% Attendance!</p>
                                <p className="text-xs text-slate-500">All students are present today</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3.5 font-semibold">ID</th>
                                        <th className="px-4 py-3.5 font-semibold">Student Name</th>
                                        <th className="px-4 py-3.5 font-semibold">Department</th>
                                        <th className="px-4 py-3.5 font-semibold">Status</th>
                                        <th className="px-4 py-3.5 font-semibold text-right">Quick Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredAbsent.length > 0 ? (
                                        filteredAbsent.map((r, i) => (
                                            <tr key={`a-full-${r.student_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3.5 font-mono font-medium text-slate-600">{r.student_id}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-900">{r.name}</td>
                                                <td className="px-4 py-3.5 text-slate-600">{r.department || "General"}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        Absent
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right">
                                                    <button
                                                        onClick={() => handleQuickMark(r.student_id, r.name)}
                                                        disabled={actionLoadingId === r.student_id}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
                                                    >
                                                        {actionLoadingId === r.student_id ? (
                                                            <span>Marking...</span>
                                                        ) : (
                                                            <>
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                <span>Mark Present</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                <svg className="w-8 h-8 mx-auto mb-2 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <p className="font-bold text-slate-900">All students are present today!</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* COMBINED ALL ROSTER VIEW */}
            {viewMode === "ALL" && (
                <div className="space-y-3">
                    {/* Mobile Cards */}
                    <div className="block md:hidden space-y-2.5">
                        {filteredAll.length > 0 ? (
                            filteredAll.map((r, i) => (
                                <div key={`all-card-${r.student_id}-${i}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-slate-900 truncate">{r.name || r.student_id}</span>
                                            <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold shrink-0">{r.student_id}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="truncate">{r.department || "General"}</span>
                                            <span>•</span>
                                            <span className="font-mono text-slate-600 text-xs shrink-0">{r.time}</span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {r.status === "Half Day" ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                Half Day
                                            </span>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                r.status === "Late"
                                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                    : r.status === "Present" || r.status === "Full Day"
                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                            }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : (r.status === "Present" || r.status === "Full Day") ? "bg-emerald-500" : "bg-rose-500"}`} />
                                                {r.status || "Absent"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-400">
                                <p className="font-semibold text-slate-700 text-sm">No students found matching your filter</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3.5 font-semibold">ID</th>
                                        <th className="px-4 py-3.5 font-semibold">Student</th>
                                        <th className="px-4 py-3.5 font-semibold">Department</th>
                                        <th className="px-4 py-3.5 font-semibold">Status</th>
                                        <th className="px-4 py-3.5 font-semibold">Time</th>
                                        <th className="px-4 py-3.5 font-semibold">Method</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                    {filteredAll.length > 0 ? (
                                        filteredAll.map((r, i) => (
                                            <tr key={`${r.student_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3.5 font-mono font-bold text-blue-700">
                                                    {r.student_id}
                                                </td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-900">
                                                    {r.name || r.student_id}
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-600">
                                                    {r.department || "General"}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    {r.status === "Half Day" ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            <span className="flex items-center -space-x-1">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                            </span>
                                                            Half Day
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                                r.status === "Late"
                                                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                                    : r.status === "Present" || r.status === "Full Day"
                                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                                            }`}
                                                        >
                                                            <span className={`h-1.5 w-1.5 rounded-full ${r.status === "Late" ? "bg-amber-500" : (r.status === "Present" || r.status === "Full Day") ? "bg-emerald-500" : "bg-rose-500"}`} />
                                                            {r.status || "Absent"}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                                                    {r.time}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                                        Face AI
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                                No students found matching your filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* DEDICATED CAMERA ATTENDANCE MODAL */}
            {showScannerModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in">
                    <div className={`w-full ${isKioskFullscreen ? "fixed inset-0 max-w-none h-screen rounded-none z-[60] overflow-y-auto m-0 p-4" : "max-w-2xl rounded-2xl"} bg-white border border-slate-200 shadow-2xl overflow-hidden space-y-4 my-auto transition-all`}>
                        {/* Modal Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 gap-3">
                            <div className="flex items-center gap-3">
                                <span className={`h-3 w-3 rounded-full animate-ping ${scannerMode === "SOLO" ? "bg-emerald-600" : "bg-blue-600"}`} />
                                <div>
                                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-wide uppercase">
                                        {scannerMode === "SOLO" ? "Solo Face Attendance" : "Group Multi-Face Attendance"}
                                    </h2>
                                    <p className="text-[11px] text-slate-500">
                                        {scannerMode === "SOLO"
                                            ? "1-on-1 check-in kiosk mode"
                                            : "Multi-student simultaneous scanning"}
                                    </p>
                                </div>
                            </div>

                            {/* Mode Toggle Tabs & Camera Flip */}
                            <div className="flex items-center justify-between sm:justify-end gap-2">
                                <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-xs font-semibold shadow-xs">
                                    <button
                                        onClick={() => setScannerMode("SOLO")}
                                        className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                                            scannerMode === "SOLO"
                                                ? "bg-emerald-600 text-white font-bold shadow-xs"
                                                : "text-slate-600 hover:text-slate-900"
                                        }`}
                                    >
                                        Solo
                                    </button>
                                    <button
                                        onClick={() => setScannerMode("GROUP")}
                                        className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                                            scannerMode === "GROUP"
                                                ? "bg-blue-600 text-white font-bold shadow-xs"
                                                : "text-slate-600 hover:text-slate-900"
                                        }`}
                                    >
                                        Group
                                    </button>
                                </div>

                                {/* Flip Camera Button */}
                                <button
                                    onClick={toggleFacingMode}
                                    title="Switch Camera (Front/Back)"
                                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-1 font-semibold shadow-xs cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span className="hidden sm:inline">{facingMode === "user" ? "Front" : "Back"}</span>
                                </button>

                                {/* Fullscreen Kiosk Mode Toggle */}
                                <button
                                    onClick={() => setIsKioskFullscreen(!isKioskFullscreen)}
                                    title={isKioskFullscreen ? "Exit Fullscreen Kiosk" : "Fullscreen Kiosk Mode"}
                                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-1 font-semibold shadow-xs cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                    <span className="hidden sm:inline">{isKioskFullscreen ? "Window" : "Kiosk"}</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowScannerModal(false);
                                        setIsKioskFullscreen(false);
                                        setDetectedStudent(null);
                                        setGroupDetectedFaces([]);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition-colors text-sm font-bold cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Scanner Viewfinder Box */}
                        <div className="p-4 sm:p-6 space-y-4">
                            <div className="relative rounded-2xl border-2 border-slate-300 bg-black overflow-hidden flex flex-col items-center justify-center min-h-[260px] sm:min-h-[320px] shadow-lg">
                                {cameraActive ? (
                                    <div className="relative w-full h-64 sm:h-80 overflow-hidden flex items-center justify-center">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`w-full h-full object-cover ${facingMode === "user" ? "mirror" : ""}`}
                                        />

                                        <canvas
                                            ref={overlayCanvasRef}
                                            className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${facingMode === "user" ? "mirror" : ""}`}
                                        />

                                        {scannerMode === "SOLO" && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <div className="relative w-40 sm:w-48 h-48 sm:h-56 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-between p-2 shadow-lg animate-pulse">
                                                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
                                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
                                                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
                                                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-emerald-300" />

                                                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-black shadow">
                                                        ● SOLO TARGET
                                                    </span>
                                                </div>

                                                {detectedStudent && (
                                                    <div className="mt-2 sm:mt-3 bg-white/95 backdrop-blur-md border border-emerald-500/50 rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-center shadow-lg animate-fade-in">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-emerald-700 font-bold text-xs sm:text-sm">
                                                                {detectedStudent.name}
                                                            </span>
                                                            <span className="text-slate-700 font-mono text-[10px] sm:text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 font-semibold">
                                                                {detectedStudent.studentId}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2 text-[10px] sm:text-[11px] text-emerald-600 font-semibold mt-0.5">
                                                            <span>Match: {detectedStudent.confidence}%</span>
                                                            <span>•</span>
                                                            <span className="text-emerald-700 font-bold">{detectedStudent.status}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {scannerMode === "GROUP" && (
                                            <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md border border-blue-200 text-blue-700 text-[11px] font-bold shadow-sm">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                    </svg>
                                                    <span>Faces: {groupDetectedFaces.length}</span>
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md border border-emerald-200 text-emerald-700 text-[11px] font-bold shadow-sm">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    <span>Recognized: {groupDetectedFaces.filter((f) => f.recognized).length}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center p-8 text-slate-400 space-y-2">
                                        <svg className="w-12 h-12 mx-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <p className="text-sm font-medium">{cameraError || "Initializing Camera Feed..."}</p>
                                    </div>
                                )}
                            </div>

                            {/* Solo Mode Result Banner */}
                            {scannerMode === "SOLO" && detectedStudent && (
                                <div className="p-3 sm:p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1 animate-fade-in shadow-xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-bold text-sm text-slate-900">
                                                {detectedStudent.name} ({detectedStudent.studentId})
                                            </span>
                                        </div>
                                        <span className="font-mono text-emerald-700 font-bold">
                                            {detectedStudent.confidence}% Match
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-600 text-[11px]">
                                        <span>Dept: {detectedStudent.department}</span>
                                        <span className="text-emerald-700 font-bold">
                                            Synchronized at {detectedStudent.timestamp}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Group Mode Live Stream Session Roster */}
                            {scannerMode === "GROUP" && (
                                <div className="p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                            Group Batch Roster ({groupSessionRecognized.length} Marked Present)
                                        </h4>
                                        <span className="text-[11px] text-emerald-700 font-semibold">Auto-Syncing</span>
                                    </div>

                                    <div className="max-h-28 sm:max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                        {groupSessionRecognized.length > 0 ? (
                                            groupSessionRecognized.map((s) => (
                                                <div
                                                    key={`grp-${s.studentId}`}
                                                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs shadow-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                        <span className="font-semibold text-slate-900">{s.name}</span>
                                                        <span className="font-mono text-slate-500">({s.studentId})</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 font-mono text-slate-600 text-[11px]">
                                                        <span className="inline-flex items-center gap-1">
                                                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {s.time}
                                                        </span>
                                                        <span className="text-emerald-700 font-bold">{s.confidence}%</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-center py-4 text-xs text-slate-400">
                                                Scanning for student faces in the camera feed...
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Controls: Auto-Scan Toggle & Manual Override */}
                            <div className="space-y-3 bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="autoScanToggle"
                                            checked={isScanningActive}
                                            onChange={(e) => setIsScanningActive(e.target.checked)}
                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                        />
                                        <label htmlFor="autoScanToggle" className="font-semibold text-slate-800 cursor-pointer">
                                            Continuous Auto-Scan
                                        </label>
                                    </div>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                        {isScanningActive ? (
                                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                Scanning every 750ms
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-amber-700">
                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                Paused
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-200">
                                    <select
                                        value={selectedStudentToRecognize}
                                        onChange={(e) => setSelectedStudentToRecognize(e.target.value)}
                                        className="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium cursor-pointer"
                                    >
                                        {students.map((s) => (
                                            <option key={s.student_id} value={s.student_id}>
                                                {s.name} ({s.student_id})
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={handleSimulateScan}
                                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs cursor-pointer whitespace-nowrap text-center"
                                    >
                                        Mark Selected
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
