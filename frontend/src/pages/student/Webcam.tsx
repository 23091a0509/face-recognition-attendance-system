import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getMe } from "../../services/auth.service";
import {
    recognizeFrame,
    getCurrentSession,
    sendSessionHeartbeat,
    type FrameRecognitionResult,
    type AttendanceSession,
    type SessionStudentStatus,
} from "../../services/attendance.service";
import { updateStudentFace } from "../../services/students";
import AttendanceDetailsModal, {
    type AttendanceDetailData,
} from "../../components/AttendanceDetailsModal";

export default function WebcamPage() {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const isProcessingRef = useRef<boolean>(false);
    const lastHeartbeatTimeRef = useRef<number>(0);

    const [loading, setLoading] = useState(false);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [studentInfo, setStudentInfo] = useState<{ student_id: string; name?: string } | null>(null);

    // Session State & Countdown
    const [session, setSession] = useState<AttendanceSession | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
    const [sessionEnded, setSessionEnded] = useState<boolean>(false);
    const [studentSessionStatus, setStudentSessionStatus] = useState<SessionStudentStatus | null>(null);

    // AI Telemetry State
    const [faceDetected, setFaceDetected] = useState(false);
    const [confidence, setConfidence] = useState<number>(0);
    const [recognizedName, setRecognizedName] = useState<string>("");
    const [recognizedId, setRecognizedId] = useState<string>("");
    const [qualityWarning, setQualityWarning] = useState<string>("");
    const [notEnrolled, setNotEnrolled] = useState<boolean>(false);
    const [enrolling, setEnrolling] = useState<boolean>(false);
    const [enrollSuccess, setEnrollSuccess] = useState<string>("");

    // Attendance Verification Status
    const [attendancePresent, setAttendancePresent] = useState<boolean>(false);
    const [recordedTime, setRecordedTime] = useState<string>("");
    const [selectedRecord, setSelectedRecord] = useState<AttendanceDetailData | null>(null);

    const [attendanceResult, setAttendanceResult] = useState<{
        status: "marked" | "already_marked" | "error" | "mismatch";
        message: string;
        time?: string;
        confidence?: number;
    } | null>(null);

    // Format countdown helper: HH:MM:SS remaining
    function formatCountdown(totalSecs: number) {
        if (totalSecs <= 0) return "00:00:00 remaining";
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        const ss = String(s).padStart(2, "0");
        return `${hh}:${mm}:${ss} remaining`;
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

    // 1. Initial Load: Student Profile & Current Session
    const fetchSessionData = useCallback(async () => {
        try {
            const res = await getCurrentSession();
            setSession(res.session);
            setSecondsRemaining(res.session.seconds_remaining);

            if (res.student_status) {
                setStudentSessionStatus(res.student_status);
                if (res.student_status.status === "Full Day" || res.student_status.status === "Half Day" || res.student_status.minutes_attended > 0) {
                    setAttendancePresent(true);
                }
            }

            if (res.session.is_ended || res.session.seconds_remaining <= 0) {
                setSessionEnded(true);
            }
        } catch (err) {
            console.error("Failed to load current session", err);
        }
    }, []);

    useEffect(() => {
        async function init() {
            try {
                const me = await getMe();
                setStudentInfo(me);
                await fetchSessionData();

                if (me?.student_id) {
                    try {
                        const todayRes = await api.get(`/attendance/student/${me.student_id}/today`);
                        if (todayRes.data.already_marked) {
                            setAttendancePresent(true);
                            setRecordedTime(formatTime12h(todayRes.data.time));
                        }
                    } catch {}
                }
            } catch (err) {
                console.error("Init failed", err);
            }
        }
        init();
    }, [fetchSessionData]);

    // 2. Ticking Countdown Timer (1 second interval)
    useEffect(() => {
        if (sessionEnded) return;

        const timer = setInterval(() => {
            setSecondsRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setSessionEnded(true);
                    // Stop camera stream immediately
                    if (streamRef.current) {
                        streamRef.current.getTracks().forEach((t) => t.stop());
                        streamRef.current = null;
                    }
                    setCameraActive(false);
                    // Final fetch to get evaluated attendance status
                    fetchSessionData();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [sessionEnded, fetchSessionData]);

    // 3. Periodic Session Sync with Backend (every 20 seconds)
    useEffect(() => {
        if (sessionEnded) return;
        const syncInterval = setInterval(() => {
            fetchSessionData();
        }, 20000);
        return () => clearInterval(syncInterval);
    }, [sessionEnded, fetchSessionData]);

    // 4. Camera Stream Management
    useEffect(() => {
        if (sessionEnded) {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            setCameraActive(false);
            return;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
        }

        async function startCamera() {
            try {
                const constraints: MediaStreamConstraints = {
                    video: {
                        facingMode: { ideal: facingMode },
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    },
                    audio: false,
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setCameraActive(true);
                setCameraError("");
            } catch (err) {
                console.error("Camera error:", err);
                setCameraError("Camera access denied or webcam not available. Check browser permissions.");
                setCameraActive(false);
                setFaceDetected(false);
            }
        }

        startCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, [facingMode, sessionEnded]);

    // 5. Base64 Frame Capture
    const captureFrameBase64 = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return null;

        const targetW = 480;
        const targetH = Math.round(targetW * ((video.videoHeight || 480) / (video.videoWidth || 640)));
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, targetW, targetH);
        return canvas.toDataURL("image/jpeg", 0.80);
    }, []);

    // 6. Process Frame & Send Heartbeat to Session
    const processFrame = useCallback(async (isManualTrigger = false) => {
        if (isProcessingRef.current) return;
        if (!cameraActive || sessionEnded) return;

        const base64Image = captureFrameBase64();
        if (!base64Image) return;

        isProcessingRef.current = true;
        if (isManualTrigger) setLoading(true);

        try {
            const res: FrameRecognitionResult = await recognizeFrame(base64Image, 0.65);

            setFaceDetected(res.face_detected);
            setQualityWarning(res.quality_warning || "");

            if (res.face_detected) {
                setConfidence(res.confidence || 0);
                setRecognizedName(res.name || "");
                setRecognizedId(res.student_id || "");
            } else {
                setConfidence(0);
                setRecognizedName("");
                setRecognizedId("");
            }

            if (res.enrolled === false) {
                setNotEnrolled(true);
                return;
            } else {
                setNotEnrolled(false);
            }

            // If student verified
            if (res.recognized && res.student_id) {
                const formattedT = formatTime12h(res.marked_time);
                setAttendancePresent(true);
                setRecordedTime(formattedT);

                // Periodic heartbeat logging to active session (every 15s)
                const nowMs = Date.now();
                if (session && nowMs - lastHeartbeatTimeRef.current >= 15000) {
                    lastHeartbeatTimeRef.current = nowMs;
                    try {
                        const hbRes = await sendSessionHeartbeat(session.id, res.confidence || 98.0, true);
                        if (hbRes?.live_evaluation) {
                            setStudentSessionStatus(hbRes.live_evaluation);
                        }
                    } catch (hbErr) {
                        console.warn("Heartbeat update failed", hbErr);
                    }
                }

                setAttendanceResult({
                    status: "marked",
                    message: `Verified & Present! (${res.name || res.student_id})`,
                    time: formattedT,
                    confidence: res.confidence,
                });
            } else if (res.mismatch) {
                setAttendanceResult({
                    status: "mismatch",
                    message: res.message || "Face does not match your registered account!",
                    confidence: res.confidence,
                });
            } else if (isManualTrigger) {
                if (!res.face_detected) {
                    setAttendanceResult({
                        status: "error",
                        message: res.quality_warning || "No face detected. Please face the camera.",
                    });
                } else {
                    setAttendanceResult({
                        status: "error",
                        message: res.message || "Face detected but does not match enrolled profile.",
                        confidence: res.confidence,
                    });
                }
            }
        } catch (err: any) {
            console.error("Frame recognition error:", err);
            if (isManualTrigger) {
                setAttendanceResult({
                    status: "error",
                    message: err.response?.data?.detail || "Recognition request failed.",
                });
            }
        } finally {
            isProcessingRef.current = false;
            if (isManualTrigger) setLoading(false);
        }
    }, [cameraActive, sessionEnded, captureFrameBase64, session]);

    // Live continuous recognition loop (every 500ms)
    useEffect(() => {
        if (!cameraActive || sessionEnded) return;

        const interval = setInterval(() => {
            processFrame(false);
        }, 500);

        return () => clearInterval(interval);
    }, [cameraActive, sessionEnded, processFrame]);

    // Enroll face function
    const handleEnrollMyFace = useCallback(async () => {
        if (!studentInfo?.student_id) return;
        try {
            setEnrolling(true);
            setEnrollSuccess("");

            const blobs: Blob[] = [];
            for (let i = 0; i < 3; i++) {
                const b64 = captureFrameBase64();
                if (b64) {
                    const r = await fetch(b64);
                    const b = await r.blob();
                    blobs.push(b);
                }
                await new Promise((resolve) => setTimeout(resolve, 350));
            }

            if (blobs.length === 0) {
                alert("Please ensure your camera is active and your face is visible.");
                return;
            }

            const formData = new FormData();
            blobs.forEach((b, idx) => {
                formData.append("images", new File([b], `sample_${idx + 1}.jpg`, { type: "image/jpeg" }));
            });

            await updateStudentFace(studentInfo.student_id, formData);
            setNotEnrolled(false);
            setEnrollSuccess("Face enrolled successfully! Look at camera to verify attendance.");
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to enroll face. Please ensure good lighting.");
        } finally {
            setEnrolling(false);
        }
    }, [studentInfo, captureFrameBase64]);

    const handleLogoutNow = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    const currentStudentId = studentInfo?.student_id || "CS001";
    const currentStudentName = studentInfo?.name || "Student";

    // Evaluated Final Status
    const finalStatus = studentSessionStatus?.final_recorded_status || studentSessionStatus?.status || (attendancePresent ? "Half Day" : "Absent");
    const finalReason = studentSessionStatus?.reason || "Attendance session completed";

    // =========================================================================
    // 🌟 VIEW A: SESSION ENDED (Requested User Screen)
    // =========================================================================
    if (sessionEnded) {
        return (
            <div className="min-h-[75vh] flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-3xl bg-slate-900/95 border border-slate-800 p-8 shadow-2xl backdrop-blur-xl text-center space-y-6 animate-fade-in">
                    {/* Icon */}
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl text-amber-400 shadow-inner">
                        ⏰
                    </div>

                    {/* Big Header */}
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black text-white tracking-widest uppercase">
                            SESSION ENDED
                        </h1>
                        <p className="text-xs text-slate-400">
                            The attendance session ({session?.start_time || "09:00 AM"} – {session?.end_time || "01:00 PM"}) has concluded.
                        </p>
                    </div>

                    {/* Attendance Evaluation Card */}
                    <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3.5 text-left font-mono">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                            <span className="text-xs text-slate-400 uppercase tracking-wider font-sans font-bold">Attendance:</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-md ${
                                finalStatus === "Full Day"
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                    : finalStatus === "Half Day"
                                    ? "bg-gradient-to-r from-emerald-500/25 via-amber-500/20 to-rose-500/25 text-amber-300 border-amber-500/50 shadow-amber-500/10"
                                    : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                            }`}>
                                {finalStatus === "Half Day" ? "🟢🔴 HALF DAY" : finalStatus === "Full Day" ? "🟢 FULL DAY" : "🔴 ABSENT"}
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-slate-400 font-sans">Reason:</span>
                                <span className="text-slate-200 font-semibold text-right">
                                    {finalReason}
                                </span>
                            </div>

                            {studentSessionStatus && (
                                <>
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="font-sans">Time Attended:</span>
                                        <span className="text-emerald-400 font-bold">
                                            {studentSessionStatus.minutes_attended} mins / {studentSessionStatus.total_minutes} mins ({studentSessionStatus.attendance_percentage}%)
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="font-sans">Session Halves:</span>
                                        <span className="text-slate-300">
                                            {studentSessionStatus.halves_attended?.first_half ? "✓ First Half" : "✗ First Half"} • {studentSessionStatus.halves_attended?.second_half ? "✓ Second Half" : "✗ Second Half"}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-900">
                                <span className="font-sans">Student ID:</span>
                                <span className="text-slate-300 font-bold">{currentStudentId} ({currentStudentName})</span>
                            </div>
                        </div>
                    </div>

                    {/* You have been logged out notice */}
                    <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                        <p className="text-xs text-rose-400 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
                            <span>🔒</span> You have been logged out.
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Attendance record has been finalized and updated on your calendar.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2.5 pt-1">
                        <button
                            onClick={handleLogoutNow}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-emerald-500/20"
                        >
                            Sign In Again / Return to Login
                        </button>
                        <Link
                            to="/student/attendance"
                            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition border border-slate-700 block text-center"
                        >
                            📅 View Attendance Calendar
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // 🌟 VIEW B: LIVE ATTENDANCE (Active Session with Countdown & Camera)
    // =========================================================================
    return (
        <div className="space-y-6 max-w-xl mx-auto animate-fade-in pb-12">
            {/* Header: Exact User Request Specification */}
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-black text-white tracking-widest uppercase">
                    LIVE ATTENDANCE
                </h1>

                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold tracking-wide shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    Session Active
                </div>

                <div className="text-2xl font-mono font-black text-emerald-400 tracking-wider">
                    {formatCountdown(secondsRemaining)}
                </div>

                <p className="text-xs text-slate-400 font-mono">
                    Session: {session?.start_time || "09:00 AM"} – {session?.end_time || "01:00 PM"}
                </p>
            </div>

            {/* Unenrolled Warning Banner */}
            {notEnrolled && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 shadow-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <h3 className="text-sm font-bold text-amber-300">
                                No Face Enrolled For Your Account ({currentStudentId})
                            </h3>
                            <p className="text-xs text-slate-300">
                                Look directly at camera and tap below to register your biometric face profile.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleEnrollMyFace}
                        disabled={enrolling || !cameraActive}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                    >
                        {enrolling ? (
                            <>
                                <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                <span>Capturing Biometric Profile Samples...</span>
                            </>
                        ) : (
                            <>
                                <span>📸</span>
                                <span>Enroll My Face Now</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {enrollSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <span>✅</span>
                    <span>{enrollSuccess}</span>
                </div>
            )}

            {/* Camera View Box */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center group">
                {cameraActive ? (
                    <div className="relative w-full h-full">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${facingMode === "user" ? "mirror" : ""}`}
                        />

                        {/* Face Detection Bounding Overlay */}
                        <div className="absolute inset-0 pointer-events-none">
                            {faceDetected ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div
                                        className={`relative w-48 sm:w-56 h-56 sm:h-64 border-2 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                                            recognizedId
                                                ? "border-emerald-400 shadow-emerald-400/30"
                                                : "border-amber-400 shadow-amber-400/20"
                                        }`}
                                    >
                                        <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-inherit" />
                                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-inherit" />
                                        <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-inherit" />
                                        <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-inherit" />

                                        <div className="absolute -bottom-3.5 px-3 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shadow-md flex items-center gap-1.5 bg-slate-900 border border-inherit text-white font-mono">
                                            <span className={`h-2 w-2 rounded-full ${recognizedId ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
                                            {recognizedId ? `${recognizedId} (${confidence}%)` : "Identifying Face..."}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-60">
                                    <div className="w-48 sm:w-56 h-56 sm:h-64 border-2 border-dashed border-slate-600 rounded-2xl flex items-center justify-center">
                                        <span className="text-xs text-slate-400 font-mono">Position Face Inside</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top HUD */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
                            <span className="px-2.5 py-1 rounded bg-black/75 backdrop-blur-md text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                AI SCANNER ACTIVE
                            </span>
                            <div className="flex items-center gap-2">
                                {qualityWarning && (
                                    <span className="px-2 py-0.5 rounded bg-amber-500/80 text-black font-bold text-[10px]">
                                        {qualityWarning}
                                    </span>
                                )}
                                <span className="px-2 py-1 rounded bg-black/70 backdrop-blur-md text-slate-300 border border-slate-700">
                                    {facingMode === "user" ? "FRONT CAMERA" : "REAR CAMERA"}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-8 text-slate-400 space-y-3">
                        <span className="text-4xl">📷</span>
                        <p className="text-sm font-medium">{cameraError || "Initializing Camera Feed..."}</p>
                    </div>
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Exact Required Status Indicators: ● Face detected & ✓ Attendance Present */}
            <div className="grid grid-cols-2 gap-3">
                {/* 1. ● Face detected indicator */}
                <div className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3 ${
                    faceDetected
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-slate-900/80 border-slate-800 text-slate-400"
                }`}>
                    <span className={`h-3.5 w-3.5 rounded-full flex-shrink-0 ${
                        faceDetected ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/80" : "bg-slate-600"
                    }`} />
                    <div>
                        <div className="text-xs font-bold font-mono tracking-wide">
                            ● Face detected
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {faceDetected ? (recognizedId ? `${recognizedId} ${recognizedName ? `(${recognizedName})` : `(${confidence}%)`}` : "Face aligned") : "Looking for face..."}
                        </div>
                    </div>
                </div>

                {/* 2. ✓ Attendance Present indicator */}
                <div className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3 ${
                    attendancePresent
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-slate-900/80 border-slate-800 text-slate-400"
                }`}>
                    <span className={`text-base font-bold flex-shrink-0 ${
                        attendancePresent ? "text-emerald-400" : "text-slate-600"
                    }`}>
                        ✓
                    </span>
                    <div>
                        <div className="text-xs font-bold font-mono tracking-wide">
                            Attendance Present
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {attendancePresent ? `Logged ${studentSessionStatus?.minutes_attended || 1}m in session${recordedTime ? ` (${recordedTime})` : ""}` : "Waiting for match..."}
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Live Status Card */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4 shadow-xl backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                        <span className="text-xs font-bold text-white uppercase tracking-wider block">
                            Attendance Evaluation Rule
                        </span>
                        <span className="text-[11px] text-slate-400">
                            Presence duration evaluated across both session halves
                        </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {studentSessionStatus?.status || "Active Tracking"}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                        <span className="text-slate-500 uppercase text-[10px] block">Student Account</span>
                        <span className="text-white font-bold block">{currentStudentId}</span>
                        <span className="text-slate-400 text-[11px] block">{currentStudentName}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 uppercase text-[10px] block">Attended Minutes</span>
                        <span className="text-emerald-400 font-bold block text-sm">
                            {studentSessionStatus?.minutes_attended || 0} mins
                        </span>
                        <span className="text-slate-400 text-[11px] block">
                            {studentSessionStatus?.attendance_percentage || 0}% of session
                        </span>
                    </div>
                </div>

                {/* Scan Button & Camera Toggle */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={() => processFrame(true)}
                        disabled={loading || !cameraActive}
                        className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {loading ? (
                            <>
                                <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                <span>Verifying Face Biometrics...</span>
                            </>
                        ) : (
                            <>
                                <span>📸</span>
                                <span>Manual Verify & Log</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                        className="px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center justify-center cursor-pointer"
                        title="Switch Camera"
                    >
                        🔄
                    </button>
                </div>

                {/* Feedback Banner */}
                {attendanceResult && (
                    <div
                        className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-fade-in ${
                            attendanceResult.status === "marked" || attendanceResult.status === "already_marked"
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                : "bg-red-500/15 border-red-500/30 text-red-300"
                        }`}
                    >
                        <div className="flex items-center gap-2 font-bold">
                            <span>{attendanceResult.status === "error" || attendanceResult.status === "mismatch" ? "❌" : "✅"}</span>
                            <span>{attendanceResult.message}</span>
                        </div>
                    </div>
                )}
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
