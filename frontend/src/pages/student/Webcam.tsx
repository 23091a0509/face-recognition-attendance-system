import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
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

    // Verification Progress & Network Status
    const [verifyingStreak, setVerifyingStreak] = useState<number>(0);
    const [ipBlocked, setIpBlocked] = useState<{ blocked: boolean; message: string } | null>(null);

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

            if (res.session.status === "ended" || res.session.seconds_remaining <= 0) {
                setSessionEnded(true);
            }
        } catch (err: any) {
            console.warn("Session check failed", err);
        }
    }, []);

    useEffect(() => {
        getMe().then((me) => {
            if (me) setStudentInfo({ student_id: me.student_id, name: me.name });
        }).catch(() => {});

        fetchSessionData();
    }, [fetchSessionData]);

    // 2. Countdown Timer Loop
    useEffect(() => {
        if (sessionEnded) return;

        const timer = setInterval(() => {
            setSecondsRemaining((prev) => {
                if (prev <= 1) {
                    setSessionEnded(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [sessionEnded]);

    // 3. Periodic Background Sync (every 20s)
    useEffect(() => {
        if (sessionEnded) return;

        const syncInterval = setInterval(() => {
            fetchSessionData();
        }, 20000);

        return () => clearInterval(syncInterval);
    }, [sessionEnded, fetchSessionData]);

    // 4. Initialize User Camera Feed (Target 640x480 at high quality)
    useEffect(() => {
        if (sessionEnded) {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            setCameraActive(false);
            return;
        }

        let isMounted = true;
        setCameraError("");

        const constraints: MediaStreamConstraints = {
            video: {
                facingMode,
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
            audio: false,
        };

        navigator.mediaDevices
            ?.getUserMedia(constraints)
            .then((stream) => {
                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play().catch(console.error);
                        setCameraActive(true);
                    };
                }
            })
            .catch((err) => {
                console.error("Camera access error:", err);
                if (isMounted) {
                    setCameraError("Camera permission denied or camera unavailable. Please allow camera permissions.");
                    setCameraActive(false);
                }
            });

        return () => {
            isMounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, [facingMode, sessionEnded]);

    // 5. Base64 Frame Capture at calibrated 640x480 with high quality (0.90)
    const captureFrameBase64 = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return null;

        const targetW = 640;
        const targetH = 480;
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, targetW, targetH);
        return canvas.toDataURL("image/jpeg", 0.90);
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
            const res: FrameRecognitionResult = await recognizeFrame(base64Image);

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
                setVerifyingStreak(0);
            }

            if (res.enrolled === false) {
                setNotEnrolled(true);
                return;
            } else {
                setNotEnrolled(false);
            }

            // Check if verifying (multi-frame temporal consistency in progress)
            if (res.verifying) {
                setIpBlocked(null);
                setVerifyingStreak(res.consecutive_frames || 1);
                setQualityWarning(`Verifying face... (${res.consecutive_frames}/3) Hold steady`);
                return;
            } else {
                setVerifyingStreak(0);
            }

            // If student verified
            if (res.recognized && res.student_id) {
                setIpBlocked(null);
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
                setIpBlocked(null);
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
            // Handle 403 network restriction gracefully
            if (err.response?.status === 403) {
                const detailMsg = err.response?.data?.detail || "Authorized campus Wi-Fi network required.";
                setIpBlocked({
                    blocked: true,
                    message: detailMsg
                });
            } else {
                setIpBlocked(null);
            }

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
    // 🌟 VIEW A: SESSION ENDED (White Theme)
    // =========================================================================
    if (sessionEnded) {
        return (
            <div className="min-h-[75vh] flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 p-8 shadow-xl text-center space-y-6 animate-fade-in text-slate-800">
                    {/* Icon */}
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>

                    {/* Big Header */}
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black text-slate-900 tracking-wider uppercase">
                            SESSION ENDED
                        </h1>
                        <p className="text-xs text-slate-500">
                            The attendance session ({session?.start_time || "09:00 AM"} – {session?.end_time || "01:00 PM"}) has ended.
                        </p>
                    </div>

                    {/* Attendance Evaluation Card */}
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5 text-left font-mono">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                            <span className="text-xs text-slate-500 uppercase tracking-wider font-sans font-bold">Attendance:</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-sm flex items-center gap-1.5 ${
                                finalStatus === "Full Day"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : finalStatus === "Half Day"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${
                                    finalStatus === "Full Day" ? "bg-emerald-500" : finalStatus === "Half Day" ? "bg-amber-500" : "bg-rose-500"
                                }`} />
                                {finalStatus === "Half Day" ? "HALF DAY" : finalStatus === "Full Day" ? "FULL DAY" : "ABSENT"}
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-slate-500 font-sans">Reason:</span>
                                <span className="text-slate-800 font-semibold text-right">
                                    {finalReason}
                                </span>
                            </div>

                            {studentSessionStatus && (
                                <>
                                    <div className="flex justify-between items-center text-slate-500">
                                        <span className="font-sans">Time Attended:</span>
                                        <span className="text-emerald-700 font-bold">
                                            {studentSessionStatus.minutes_attended} mins / {studentSessionStatus.total_minutes} mins ({studentSessionStatus.attendance_percentage}%)
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-500">
                                        <span className="font-sans">Session Halves:</span>
                                        <span className="text-slate-700">
                                            {studentSessionStatus.halves_attended?.first_half ? "✓ First Half" : "✗ First Half"} • {studentSessionStatus.halves_attended?.second_half ? "✓ Second Half" : "✗ Second Half"}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="flex justify-between items-center text-slate-500 pt-1 border-t border-slate-200">
                                <span className="font-sans">Student ID:</span>
                                <span className="text-slate-800 font-bold">{currentStudentId} ({currentStudentName})</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2.5 pt-1">
                        <Link
                            to="/student/attendance"
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-md flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>View Attendance Calendar</span>
                        </Link>
                        <button
                            onClick={handleLogoutNow}
                            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition border border-slate-200 cursor-pointer"
                        >
                            Return to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // 🌟 VIEW B: LIVE ATTENDANCE (White Theme Kiosk)
    // =========================================================================
    return (
        <div className="space-y-6 max-w-xl mx-auto animate-fade-in pb-12 text-slate-800">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-wider uppercase">
                    FACE ATTENDANCE
                </h1>

                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold tracking-wide shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-600 animate-ping" />
                    Class In Session
                </div>

                <div className="text-2xl font-mono font-black text-emerald-600 tracking-wider">
                    {formatCountdown(secondsRemaining)}
                </div>

                <p className="text-xs text-slate-500 font-mono">
                    Session: {session?.start_time || "09:00 AM"} – {session?.end_time || "01:00 PM"}
                </p>
            </div>

            {/* Campus Wi-Fi Required Rejection Card */}
            {ipBlocked && ipBlocked.blocked && (
                <div className="rounded-2xl bg-amber-50 border border-amber-300 p-5 shadow-sm space-y-3 animate-fade-in text-left">
                    <div className="flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className="text-sm font-bold text-amber-900">
                                Campus Wi-Fi Required
                            </h3>
                            <p className="text-xs text-amber-700 leading-relaxed">
                                {ipBlocked.message}
                            </p>
                            <div className="pt-2 flex items-center gap-2 text-[11px] font-medium text-amber-900/80">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
                                <span>Please connect to the campus Wi-Fi network and try again.</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Unenrolled Warning Banner */}
            {notEnrolled && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 shadow-sm space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-amber-900">
                                No Face Registered ({currentStudentId})
                            </h3>
                            <p className="text-xs text-amber-700">
                                Look directly at the camera and tap below to register your face.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleEnrollMyFace}
                        disabled={enrolling || !cameraActive}
                        className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
                    >
                        {enrolling ? (
                            <>
                                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Registering Your Face...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Register My Face</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {enrollSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{enrollSuccess}</span>
                </div>
            )}

            {/* Camera View Box */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-inner flex items-center justify-center group">
                    {cameraActive ? (
                        <div className="relative w-full h-full">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-cover ${facingMode === "user" ? "mirror" : ""}`}
                            />

                            {/* High-Tech Scan Reticle */}
                            <div className="absolute inset-0 pointer-events-none">
                                {faceDetected ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <div
                                            className={`relative w-48 sm:w-56 h-56 sm:h-64 border-2 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                                                recognizedId
                                                    ? "border-emerald-400 shadow-emerald-400/30"
                                                    : verifyingStreak > 0
                                                    ? "border-blue-400 shadow-blue-400/30"
                                                    : "border-amber-400 shadow-amber-400/20"
                                            }`}
                                        >
                                            <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-inherit" />
                                            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-inherit" />
                                            <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-inherit" />
                                            <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-inherit" />

                                            <div className="absolute -bottom-3.5 px-3 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shadow-md flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-300 text-slate-800 font-mono">
                                                <span className={`h-2 w-2 rounded-full ${recognizedId ? "bg-emerald-500" : verifyingStreak > 0 ? "bg-blue-500" : "bg-amber-500"} animate-pulse`} />
                                                {recognizedId
                                                    ? `${recognizedId} (${confidence}%)`
                                                    : verifyingStreak > 0
                                                    ? `Checking Face (${verifyingStreak}/3)...`
                                                    : "Detecting..."}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-60">
                                        <div className="w-48 sm:w-56 h-56 sm:h-64 border-2 border-dashed border-slate-400 rounded-2xl flex items-center justify-center">
                                            <span className="text-xs text-slate-300 font-mono">Center Face in Frame</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Top HUD */}
                            <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
                                <span className="px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-sm font-bold">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                                    CAMERA READY
                                </span>
                                <div className="flex items-center gap-2">
                                    {qualityWarning && (
                                        <span className="px-2.5 py-0.5 rounded bg-amber-500 text-slate-900 font-bold text-[10px] shadow-sm">
                                            {qualityWarning}
                                        </span>
                                    )}
                                    <span className="px-2 py-1 rounded-lg bg-white/95 backdrop-blur-md text-slate-700 border border-slate-200 font-bold text-[10px] shadow-sm">
                                        {facingMode === "user" ? "FRONT" : "REAR"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center p-8 text-slate-400 space-y-3 flex flex-col items-center justify-center">
                            <svg className="w-10 h-10 text-slate-300 stroke-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <p className="text-sm font-medium">{cameraError || "Initializing Camera Feed..."}</p>
                        </div>
                    )}
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Status Indicators: Face detected & Attendance Marked */}
            <div className="grid grid-cols-2 gap-3">
                {/* 1. ● Face detected indicator */}
                <div className={`p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                    faceDetected
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500"
                }`}>
                    <span className={`h-3.5 w-3.5 rounded-full flex-shrink-0 ${
                        faceDetected ? "bg-emerald-600 animate-pulse shadow-sm shadow-emerald-600/50" : "bg-slate-300"
                    }`} />
                    <div>
                        <div className="text-xs font-bold font-mono tracking-wide">
                            ● Face Detected
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                            {faceDetected
                                ? (recognizedId ? `${recognizedId} ${recognizedName ? `(${recognizedName})` : `(${confidence}%)`}` : (verifyingStreak > 0 ? `Verifying (${verifyingStreak}/3)` : "Face aligned"))
                                : "Looking for face..."}
                        </div>
                    </div>
                </div>

                {/* 2. ✓ Attendance Marked indicator */}
                <div className={`p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                    attendancePresent
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500"
                }`}>
                    <span className={`text-base font-bold flex-shrink-0 ${
                        attendancePresent ? "text-emerald-600" : "text-slate-300"
                    }`}>
                        ✓
                    </span>
                    <div>
                        <div className="text-xs font-bold font-mono tracking-wide">
                            Attendance Marked
                        </div>
                        <div className="text-[11px] text-slate-500">
                            {attendancePresent ? `Logged in session${recordedTime ? ` (${recordedTime})` : ""}` : "Waiting for match..."}
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Live Status Card */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                            Attendance Tracking
                        </span>
                        <span className="text-[11px] text-slate-500">
                            Your attendance is automatically tracked during class
                        </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {studentSessionStatus?.status || "Active Tracking"}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                        <span className="text-slate-500 uppercase text-[10px] block">Student Account</span>
                        <span className="text-slate-900 font-bold block">{currentStudentId}</span>
                        <span className="text-slate-600 text-[11px] block">{currentStudentName}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 uppercase text-[10px] block">Attended Minutes</span>
                        <span className="text-emerald-700 font-bold block text-sm">
                            {studentSessionStatus?.minutes_attended || 0} mins
                        </span>
                        <span className="text-slate-500 text-[11px] block">
                            {studentSessionStatus?.attendance_percentage || 0}% of session
                        </span>
                    </div>
                </div>

                {/* Scan Button & Camera Toggle */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={() => processFrame(true)}
                        disabled={loading || !cameraActive}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                        {loading ? (
                            <>
                                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Recognizing Face...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Mark Attendance Now</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                        className="px-4 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition flex items-center justify-center cursor-pointer shadow-sm active:scale-[0.98]"
                        title="Switch Camera"
                        aria-label="Switch Camera"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Feedback Banner */}
                {attendanceResult && (
                    <div
                        className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-fade-in ${
                            attendanceResult.status === "marked" || attendanceResult.status === "already_marked"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "bg-rose-50 border-rose-200 text-rose-700"
                        }`}
                    >
                        <div className="flex items-center gap-2 font-bold">
                            {attendanceResult.status === "error" || attendanceResult.status === "mismatch" ? (
                                <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
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
