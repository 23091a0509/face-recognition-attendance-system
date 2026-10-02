import { useState, useRef, useEffect } from "react";
import { registerStudent } from "../../services/students";

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddStudentModal({ onClose, onSuccess }: Props) {
    const [studentId, setStudentId] = useState("");
    const [name, setName] = useState("");
    const [department, setDepartment] = useState("Computer Science");
    const [year, setYear] = useState("4th Year");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    
    // Single perfect face capture
    const [capturedImage, setCapturedImage] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    
    const [loading, setLoading] = useState(false);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [formError, setFormError] = useState("");

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Auto generate email if studentId changes
    function handleStudentIdChange(val: string) {
        setStudentId(val);
        if (!email || email.includes("@institution.edu")) {
            setEmail(val ? `${val.toLowerCase()}@institution.edu` : "");
        }
    }

    // Start camera with HD support
    useEffect(() => {
        if (!capturedImage) {
            startCamera();
        }

        return () => {
            stopCamera();
        };
    }, [facingMode, capturedImage]);

    // Synchronize video element srcObject when camera becomes active
    useEffect(() => {
        if (cameraActive && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(console.warn);
        }
    }, [cameraActive]);

    async function startCamera() {
        stopCamera();
        setCameraError("");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const isSecure = window.isSecureContext !== false;
            setCameraError(
                !isSecure
                    ? "Camera access requires HTTPS or localhost."
                    : "Camera capture is not supported by your current browser."
            );
            return;
        }

        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 },
                },
                audio: false,
            });
        } catch (err: any) {
            console.warn("Primary constraints failed, falling back...", err);
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
            } catch (fallbackErr: any) {
                console.error("Camera access error:", fallbackErr);
                const name = fallbackErr.name || "";
                if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                    setCameraError("Camera permission denied. Please allow camera permissions in your browser.");
                } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
                    setCameraError("No webcam found on this device.");
                } else if (name === "NotReadableError" || name === "TrackStartError") {
                    setCameraError("Camera is currently in use by another app.");
                } else {
                    setCameraError(fallbackErr.message || "Camera unavailable.");
                }
                setCameraActive(false);
                return;
            }
        }

        if (!stream) return;
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
            video.srcObject = stream;
            try {
                await video.play();
            } catch (playErr) {
                console.warn("Video play error:", playErr);
            }
        }
        setCameraActive(true);
        setCameraError("");
    }

    function stopCamera() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    }

    function toggleFacingMode() {
        setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    }

    // Capture single perfect face frame from camera
    function captureFace() {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            // If user-facing, mirror horizontally to match view
            if (facingMode === "user") {
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const file = new File(
                            [blob],
                            `${studentId || "student"}_face.jpg`,
                            { type: "image/jpeg" }
                        );
                        setCapturedImage(file);
                        setPreviewUrl(canvas.toDataURL("image/jpeg", 0.95));
                        stopCamera();
                    }
                },
                "image/jpeg",
                0.95
            );
        }
    }

    function retakePhoto() {
        setCapturedImage(null);
        setPreviewUrl(null);
        setFormError("");
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!capturedImage) {
            alert("Please capture the student's face photo using the camera.");
            return;
        }

        const formData = new FormData();
        formData.append("student_id", studentId);
        formData.append("name", name);
        formData.append("department", department);
        formData.append("password", password || "password123");
        formData.append("year", year);
        formData.append("email", email || `${studentId.toLowerCase()}@institution.edu`);
        formData.append("image", capturedImage);

        try {
            setLoading(true);
            setFormError("");
            await registerStudent(formData);
            onSuccess();
            onClose();
        } catch (err: any) {
            const errorMsg =
                err.response?.data?.detail ||
                "Failed to register student. Please check if face is clearly visible and retake.";
            setFormError(errorMsg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col text-slate-800">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg">
                            👤
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Add New Student</h2>
                            <p className="text-xs text-slate-500">Live facial biometric registration (1 Perfect Capture)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 bg-white">
                    {/* Section 1: Student Information */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            1. Student Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Student ID *</label>
                                <input
                                    required
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium font-mono"
                                    placeholder="e.g. CS009"
                                    value={studentId}
                                    onChange={(e) => handleStudentIdChange(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                                <input
                                    required
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                    placeholder="e.g. Rahul Sharma"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                                <select
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                >
                                    <option value="Computer Science">Computer Science</option>
                                    <option value="Information Technology">Information Technology</option>
                                    <option value="Software Engineering">Software Engineering</option>
                                    <option value="Data Science">Data Science</option>
                                    <option value="Artificial Intelligence">Artificial Intelligence</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                                <select
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                >
                                    <option value="1st Year">1st Year</option>
                                    <option value="2nd Year">2nd Year</option>
                                    <option value="3rd Year">3rd Year</option>
                                    <option value="4th Year">4th Year</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                    placeholder="rahul@institution.edu"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Portal Password</label>
                                <input
                                    type="password"
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                                    placeholder="Default: password123"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-200" />

                    {/* Section 2: Single Perfect Face Capture */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                2. Face Biometric Capture
                            </h3>
                            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                📸 1 Perfect Photo
                            </span>
                        </div>

                        {/* Live Camera Feed or Captured Photo Preview */}
                        <div className="relative rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex flex-col items-center justify-center p-4 min-h-[240px]">
                            {previewUrl ? (
                                /* Photo Captured State */
                                <div className="flex flex-col items-center gap-3 w-full py-2">
                                    <div className="relative rounded-xl overflow-hidden border-2 border-blue-600 shadow-xl shadow-blue-500/10 max-w-xs">
                                        <img
                                            src={previewUrl}
                                            alt="Captured student face"
                                            className="w-full h-48 object-cover"
                                        />
                                        <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                                            ✓ Captured
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-blue-700 font-semibold flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
                                            Face ready for AI recognition embedding
                                        </span>
                                        <button
                                            type="button"
                                            onClick={retakePhoto}
                                            className="ml-2 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                                        >
                                            🔄 Retake
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Live Camera State */
                                <>
                                    <div className="relative w-full max-w-xs rounded-xl overflow-hidden border border-slate-300 shadow-md bg-black flex items-center justify-center min-h-[192px]">
                                        {/* Video is ALWAYS mounted so videoRef is ready on first mount */}
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`w-full h-48 object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""} ${cameraActive ? "block" : "hidden"}`}
                                        />

                                        {cameraActive && (
                                            <>
                                                {/* Biometric Framing Guide */}
                                                <div className="absolute inset-0 border-2 border-blue-400/60 rounded-full m-4 pointer-events-none" />
                                                <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
                                                    <span className="text-[10px] font-semibold bg-black/70 text-blue-200 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                                        Position face inside oval
                                                    </span>
                                                </div>
                                            </>
                                        )}

                                        {!cameraActive && (
                                            <div className="text-center p-6 text-slate-400 space-y-2">
                                                {cameraError ? (
                                                    <>
                                                        <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                            </svg>
                                                        </div>
                                                        <p className="text-xs font-semibold text-rose-300 max-w-xs">{cameraError}</p>
                                                        <button
                                                            type="button"
                                                            onClick={startCamera}
                                                            className="mt-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                                                        >
                                                            Retry Camera
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                                                        <p className="text-xs text-slate-300 font-medium">Starting camera...</p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={captureFace}
                                            disabled={!cameraActive}
                                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md shadow-blue-600/20 cursor-pointer flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span>Capture Face Photo</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={toggleFacingMode}
                                            className="p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs cursor-pointer transition-colors shadow-sm"
                                            title="Switch Camera (Front/Back)"
                                        >
                                            🔄 {facingMode === "user" ? "Front" : "Back"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Biometric Validation / Duplicate Face Alert Box */}
                    {formError && (
                        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-fade-in shadow-sm">
                            <span className="text-lg leading-none">⚠️</span>
                            <div className="space-y-0.5">
                                <span className="font-bold block text-rose-900">Biometric Registration Alert</span>
                                <span className="text-rose-700 text-xs leading-relaxed block">{formError}</span>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={loading || !capturedImage || !studentId || !name}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                        >
                            {loading ? (
                                <>
                                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Registering Biometrics...</span>
                                </>
                            ) : (
                                <span>Save & Register Student</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
