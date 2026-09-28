import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ScanFace,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  LogOut,
} from "lucide-react";
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
  const [studentInfo, setStudentInfo] = useState<{
    student_id: string;
    name?: string;
  } | null>(null);

  // Session State & Countdown
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);
  const [studentSessionStatus, setStudentSessionStatus] =
    useState<SessionStudentStatus | null>(null);

  // AI Telemetry & Verification States
  const [verificationStage, setVerificationStage] = useState<
    "idle" | "detecting" | "verifying" | "verified" | "marked"
  >("idle");
  const [faceDetected, setFaceDetected] = useState(false);
  const [confidence, setConfidence] = useState<number>(0);
  const [recognizedName, setRecognizedName] = useState<string>("");
  const [notEnrolled, setNotEnrolled] = useState<boolean>(false);
  const [enrolling, setEnrolling] = useState<boolean>(false);
  const [enrollSuccess, setEnrollSuccess] = useState<string>("");

  // Attendance Status
  const [attendancePresent, setAttendancePresent] = useState<boolean>(false);
  const [recordedTime, setRecordedTime] = useState<string>("");
  const [selectedRecord] = useState<AttendanceDetailData | null>(null);

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
        if (
          res.student_status.status === "Full Day" ||
          res.student_status.status === "Half Day" ||
          res.student_status.minutes_attended > 0
        ) {
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
            const todayRes = await api.get(
              `/attendance/student/${me.student_id}/today`
            );
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

  // 2. Ticking Countdown Timer
  useEffect(() => {
    if (sessionEnded) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setSessionEnded(true);
          fetchSessionData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionEnded, fetchSessionData]);

  // 3. Camera lifecycle
  const startCamera = async (mode: "user" | "environment" = facingMode) => {
    setCameraError("");
    setLoading(true);
    setVerificationStage("detecting");

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError(
        "Camera permission denied or camera not found. Please enable camera access in your browser."
      );
      setCameraActive(false);
      setVerificationStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFaceDetected(false);
    setVerificationStage("idle");
  };

  // Switch Camera
  const switchCamera = () => {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    if (cameraActive) {
      startCamera(nextMode);
    }
  };

  // 4. Capture & Biometric Inference Loop
  useEffect(() => {
    if (!cameraActive || sessionEnded) return;

    const interval = setInterval(async () => {
      if (isProcessingRef.current || !videoRef.current || !canvasRef.current) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.readyState !== 4) return;

      isProcessingRef.current = true;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        isProcessingRef.current = false;
        return;
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64Data = canvas.toDataURL("image/jpeg", 0.85);

      try {
        setVerificationStage("verifying");
        const result: FrameRecognitionResult = await recognizeFrame(base64Data);

        if (result.face_detected) {
          setFaceDetected(true);
          setConfidence(result.confidence || 0);

          if (result.student_id) {
            setRecognizedName(result.name || "Student");
            setNotEnrolled(false);
            setVerificationStage("verified");

            if (result.recognized || result.already_marked) {
              setAttendancePresent(true);
              setVerificationStage("marked");
              if (!recordedTime) {
                setRecordedTime(formatTime12h(result.marked_time));
              }

              // Send heartbeat to keep attendance duration ticking
              const now = Date.now();
              if (now - lastHeartbeatTimeRef.current > 30000 && session?.id) {
                lastHeartbeatTimeRef.current = now;
                sendSessionHeartbeat(session.id, 98.0, true).catch(() => {});
              }
            }
          } else {
            setRecognizedName("");
            setNotEnrolled(true);
            setVerificationStage("detecting");
          }
        } else {
          setFaceDetected(false);
          setVerificationStage("detecting");
        }
      } catch (err) {
        // Continue detection loop smoothly
      } finally {
        isProcessingRef.current = false;
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [cameraActive, sessionEnded, recordedTime, session?.id]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Quick enroll student face
  const handleQuickEnroll = async () => {
    if (!videoRef.current || !canvasRef.current || !studentInfo?.student_id)
      return;
    setEnrolling(true);
    setEnrollSuccess("");

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.95);
        const byteString = atob(base64.split(",")[1]);
        const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const formData = new FormData();
        formData.append("file", blob, "face.jpg");
        await updateStudentFace(studentInfo.student_id, formData);
        setEnrollSuccess(
          "Face biometric vector registered successfully! You will now be verified."
        );
        setNotEnrolled(false);
      }
    } catch (e: any) {
      alert("Registration failed: " + (e.message || "Please try again"));
    } finally {
      setEnrolling(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login?expired=true", { replace: true });
  };

  // Computed scanning message for AI HUD
  const getScanningStatusText = () => {
    if (sessionEnded) return "Session Concluded";
    if (!cameraActive) return "Camera Inactive — Click Start Camera";
    if (verificationStage === "marked" || attendancePresent)
      return "Attendance marked successfully ✓";
    if (verificationStage === "verified") return "Identity verified ✓";
    if (verificationStage === "verifying") return "Verifying identity...";
    if (faceDetected) return "Face detected — Aligning...";
    return "Detecting face...";
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ========================================================================= */}
      {/* 1. Header                                                                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E7EB]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-semibold mb-2 border border-[#4F46E5]/15">
            <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Sub-Second Facial Biometrics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            Live Face Recognition
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Real-time biometric attendance verification and presence auditing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {cameraActive && (
            <button
              onClick={switchCamera}
              className="px-3 py-2 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[#111827] text-xs font-semibold rounded-xl shadow-2xs transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Flip Camera</span>
            </button>
          )}

          {!cameraActive ? (
            <button
              onClick={() => startCamera()}
              disabled={loading || sessionEnded}
              className="px-4 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:opacity-60 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{loading ? "Starting..." : "Start Camera"}</span>
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2.5 bg-[#DC2626] hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Stop Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Controlled Attendance Session Status Banner                             */}
      {/* ========================================================================= */}
      {sessionEnded ? (
        /* SESSION ENDED FINAL SCREEN */
        <div className="bg-white rounded-2xl border-2 border-red-200 shadow-md p-6 sm:p-8 text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-[#DC2626] flex items-center justify-center mb-4 border border-red-200">
            <Clock className="w-7 h-7" />
          </div>

          <span className="text-xs font-bold uppercase tracking-widest text-[#DC2626] bg-red-50 px-3 py-1 rounded-full border border-red-200">
            SESSION ENDED
          </span>

          <h2 className="text-2xl font-black text-[#111827] mt-3 mb-1">
            Attendance Session Concluded
          </h2>
          <p className="text-sm text-[#64748B] max-w-md mx-auto mb-6">
            The configured verification window has concluded. Final attendance
            status evaluated by the backend verification engine:
          </p>

          {/* Evaluated Result Card */}
          <div className="max-w-md mx-auto bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-5 mb-6 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <span className="text-xs text-[#64748B]">Attendance Status</span>
              <span
                className={`text-sm font-extrabold px-3 py-1 rounded-full ${
                  studentSessionStatus?.status === "Full Day"
                    ? "bg-emerald-100 text-[#16A34A] border border-emerald-300"
                    : studentSessionStatus?.status === "Half Day"
                    ? "bg-gradient-to-r from-emerald-100 to-amber-100 text-amber-800 border border-amber-300"
                    : "bg-red-100 text-[#DC2626] border border-red-300"
                }`}
              >
                {studentSessionStatus?.status ||
                  (attendancePresent ? "Full Day" : "Absent")}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs border-b border-[#E5E7EB]">
              <span className="text-[#64748B]">Reason</span>
              <span className="font-medium text-[#111827]">
                {studentSessionStatus?.reason ||
                  "Attendance session completed and audited"}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs border-b border-[#E5E7EB]">
              <span className="text-[#64748B]">Verified Duration</span>
              <span className="font-mono font-bold text-[#111827]">
                {studentSessionStatus?.minutes_attended ??
                  (attendancePresent ? 180 : 0)}{" "}
                minutes
              </span>
            </div>

            <div className="pt-2.5 flex items-center justify-between text-xs">
              <span className="text-[#64748B]">Session Threshold Satisfied</span>
              <span className="font-semibold text-[#16A34A]">
                {studentSessionStatus?.status === "Full Day"
                  ? "≥ 75% Full Day Threshold"
                  : studentSessionStatus?.status === "Half Day"
                  ? "≥ 40% Half Day Threshold"
                  : "< 40% (Threshold Not Met)"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/student/attendance"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-xs"
            >
              View Attendance Records
            </Link>
            <button
              onClick={handleLogout}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[#DC2626] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>You have been logged out — Exit</span>
            </button>
          </div>
        </div>
      ) : (
        /* LIVE ATTENDANCE SESSION ACTIVE CARD */
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest bg-emerald-50 text-[#16A34A] border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                LIVE ATTENDANCE
              </span>
              <span className="text-xs font-medium text-[#64748B]">
                Session Active
              </span>
            </div>
            <h3 className="text-base font-bold text-[#111827]">
              {session?.title || "Daily Academic Attendance Session"}
            </h3>
            <p className="text-xs text-[#64748B]">
              Scheduled: {formatTime12h(session?.start_time)} &ndash;{" "}
              {formatTime12h(session?.end_time)} &bull; Required: 75% for Full
              Day
            </p>
          </div>

          {/* Countdown Clock Display */}
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs text-[#64748B] mb-0.5">Remaining Window</span>
            <div className="text-2xl font-black font-mono text-[#4F46E5] tracking-tight bg-[#EEF2FF] px-3.5 py-1 rounded-xl border border-[#4F46E5]/20">
              {formatCountdown(secondsRemaining)}
            </div>
          </div>
        </div>
      )}

      {/* Camera Error Message */}
      {cameraError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Camera Inaccessible</span>
            {cameraError}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AI Camera Feed with Minimal Verification HUD                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Camera Viewport (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-4 overflow-hidden">
          <div className="relative aspect-video w-full rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center border border-slate-800">
            {/* Live Video Element */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                cameraActive ? "opacity-100" : "opacity-0"
              }`}
            />

            {/* Offline / Placeholder Screen */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300 bg-slate-950/90">
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-3 backdrop-blur-xs border border-white/15">
                  <ScanFace className="w-8 h-8 text-[#4F46E5]" />
                </div>
                <h4 className="text-base font-bold text-white mb-1">
                  Camera Standby
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  Click &ldquo;Start Camera&rdquo; to launch facial biometric
                  detection and record your attendance.
                </p>
                <button
                  onClick={() => startCamera()}
                  disabled={loading || sessionEnded}
                  className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
                >
                  Start Camera
                </button>
              </div>
            )}

            {/* AI HUD Overlay (When Camera is Active) */}
            {cameraActive && (
              <>
                {/* Precision Corner Reticles */}
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#4F46E5] rounded-tl-lg pointer-events-none" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#4F46E5] rounded-tr-lg pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#4F46E5] rounded-bl-lg pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#4F46E5] rounded-br-lg pointer-events-none" />

                {/* Subtle Scanning Beam */}
                <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-[#4F46E5] to-transparent animate-scan-beam pointer-events-none opacity-80" />

                {/* Center Face Target Ellipse */}
                <div
                  className={`absolute inset-0 m-auto w-48 h-60 rounded-[45%] border-2 transition-colors duration-300 pointer-events-none ${
                    attendancePresent
                      ? "border-[#16A34A] shadow-[0_0_20px_rgba(22,163,74,0.3)]"
                      : faceDetected
                      ? "border-[#4F46E5] shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                      : "border-white/30 border-dashed"
                  }`}
                />

                {/* Top Floating Telemetry Pill */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/10 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? "bg-[#16A34A] animate-pulse" : "bg-amber-400"
                      }`}
                    />
                    <span>{getScanningStatusText()}</span>
                  </div>

                  {confidence > 0 && (
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/10">
                      Match: {(confidence * 100).toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Bottom Verification Banner */}
                {attendancePresent && (
                  <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-emerald-200 text-[#111827] shadow-lg flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#16A34A] flex items-center justify-center border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#111827]">
                          Identity Verified &bull; {recognizedName || studentInfo?.name}
                        </p>
                        <p className="text-[11px] text-[#64748B]">
                          Attendance marked successfully at {recordedTime || "now"}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#16A34A] bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      RECORDED
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Real-time Presence Indicators & Enrollment (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Live Status Indicators Card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-4">
              Real-time Verification Status
            </h3>

            <div className="space-y-3.5">
              {/* Indicator 1: Face Detected */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                <span className="text-xs font-medium text-[#111827] flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      faceDetected
                        ? "bg-[#16A34A] animate-pulse"
                        : "bg-slate-300"
                    }`}
                  />
                  <span>Face detected</span>
                </span>
                <span
                  className={`text-xs font-bold ${
                    faceDetected ? "text-[#16A34A]" : "text-[#64748B]"
                  }`}
                >
                  {faceDetected ? "● Active" : "Inactive"}
                </span>
              </div>

              {/* Indicator 2: Attendance Present */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                <span className="text-xs font-medium text-[#111827] flex items-center gap-2">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      attendancePresent ? "text-[#16A34A]" : "text-slate-300"
                    }`}
                  />
                  <span>Attendance Present</span>
                </span>
                <span
                  className={`text-xs font-bold ${
                    attendancePresent ? "text-[#16A34A]" : "text-[#64748B]"
                  }`}
                >
                  {attendancePresent ? "✓ Verified" : "Pending"}
                </span>
              </div>

              {/* Indicator 3: Session Duration Heartbeat */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                <span className="text-xs font-medium text-[#111827] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#4F46E5]" />
                  <span>Session Presence</span>
                </span>
                <span className="text-xs font-bold text-[#4F46E5]">
                  Active Auditing
                </span>
              </div>
            </div>
          </div>

          {/* Student Profile Snapshot */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
              Enrolled Identity
            </h4>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center font-bold text-base border border-[#E5E7EB]">
                {(studentInfo?.name || "S").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold text-[#111827]">
                  {studentInfo?.name || "Student"}
                </p>
                <p className="text-xs font-mono text-[#4F46E5]">
                  {studentInfo?.student_id || "CS001"}
                </p>
              </div>
            </div>

            {/* Quick Re-enroll face if not recognized */}
            {notEnrolled && cameraActive && (
              <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mb-2">
                  Face detected but not found in student database. Register your
                  current face vector?
                </p>
                <button
                  onClick={handleQuickEnroll}
                  disabled={enrolling}
                  className="w-full py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {enrolling ? "Registering Vector..." : "Register My Face"}
                  </span>
                </button>
              </div>
            )}

            {enrollSuccess && (
              <p className="mt-3 text-xs text-[#16A34A] bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                {enrollSuccess}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedRecord && (
        <AttendanceDetailsModal
          record={selectedRecord}
          onClose={() => {}}
        />
      )}
    </div>
  );
}
