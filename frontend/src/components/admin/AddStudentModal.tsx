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

    function startCamera() {
        stopCamera();

        navigator.mediaDevices?.getUserMedia({
            video: {
                facingMode: facingMode,
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
            },
            audio: false,
        })
            .then((stream) => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setCameraActive(true);
                setCameraError("");
            })
            .catch((err) => {
                console.warn("Camera access error:", err);
                setCameraError("Camera unavailable. Please verify browser camera permissions.");
                setCameraActive(false);
            });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="w-full max-w-2xl rounded-2xl bg-[#0b1120] border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-lg">
                            👤
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Add New Student</h2>
                            <p className="text-xs text-slate-400">Live facial biometric registration (1 Perfect Capture)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Section 1: Student Information */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            1. Student Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Student ID *</label>
                                <input
                                    required
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                                    placeholder="e.g. CS009"
                                    value={studentId}
                                    onChange={(e) => handleStudentIdChange(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                                <input
                                    required
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                    placeholder="e.g. Rahul Sharma"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                                <select
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                >
                                    <option value="Computer Science">Computer Science</option>
                                    <option value="Information Technology">Information Technology</option>
                                    <option value="Software Engineering">Software Engineering</option>
                                    <option value="Data Science">Data Science</option>
                                    <option value="Artificial Intelligence">Artificial Intelligence</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Year</label>
                                <select
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                >
                                    <option value="1st Year">1st Year</option>
                                    <option value="2nd Year">2nd Year</option>
                                    <option value="3rd Year">3rd Year</option>
                                    <option value="4th Year">4th Year</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                    placeholder="rahul@institution.edu"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Portal Password</label>
                                <input
                                    type="password"
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                    placeholder="Default: password123"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-800/80" />

                    {/* Section 2: Single Perfect Face Capture */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                2. Face Biometric Capture
                            </h3>
                            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                📸 1 Perfect Photo
                            </span>
                        </div>

                        {/* Live Camera Feed or Captured Photo Preview */}
                        <div className="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col items-center justify-center p-4 min-h-[240px]">
                            {previewUrl ? (
                                /* Photo Captured State */
                                <div className="flex flex-col items-center gap-3 w-full py-2">
                                    <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xl shadow-emerald-500/20 max-w-xs">
                                        <img
                                            src={previewUrl}
                                            alt="Captured student face"
                                            className="w-full h-48 object-cover"
                                        />
                                        <div className="absolute top-2 right-2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                                            ✓ Captured
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            Face ready for AI recognition embedding
                                        </span>
                                        <button
                                            type="button"
                                            onClick={retakePhoto}
                                            className="ml-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                                        >
                                            🔄 Retake
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Live Camera State */
                                <>
                                    {cameraActive ? (
                                        <div className="relative w-full max-w-xs rounded-xl overflow-hidden border border-slate-700 shadow-lg">
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className={`w-full h-48 object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
                                            />
                                            {/* Biometric Framing Guide */}
                                            <div className="absolute inset-0 border-2 border-emerald-400/50 rounded-full m-4 pointer-events-none" />
                                            <div className="absolute bottom-2 inset-x-0 text-center">
                                                <span className="text-[10px] font-semibold bg-black/70 text-emerald-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                                    Position face inside oval
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-6 text-slate-400">
                                            <div className="h-10 w-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                            <p className="text-xs font-medium">{cameraError || "Initializing camera..."}</p>
                                        </div>
                                    )}

                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={captureFace}
                                            disabled={!cameraActive}
                                            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-2"
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
                                            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs cursor-pointer transition-colors"
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
                        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-fade-in shadow-lg">
                            <span className="text-lg leading-none">⚠️</span>
                            <div className="space-y-0.5">
                                <span className="font-bold block text-rose-200">Biometric Registration Alert</span>
                                <span className="text-slate-200 text-xs leading-relaxed block">{formError}</span>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={loading || !capturedImage || !studentId || !name}
                            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                        >
                            {loading ? (
                                <>
                                    <div className="h-3.5 w-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
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
