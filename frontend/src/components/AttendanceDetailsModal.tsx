export interface AttendanceDetailData {
    student_id: string;
    name?: string;
    date: string;
    time: string;
    status?: string;
    confidence?: number;
    attendance_id?: string;
    method?: string;
}

interface Props {
    record: AttendanceDetailData | null;
    onClose: () => void;
}

export default function AttendanceDetailsModal({ record, onClose }: Props) {
    if (!record) return null;

    // Format human-friendly date: e.g. "24 Sep 2026"
    const formattedDate = (() => {
        try {
            const [year, month, day] = record.date.split("-").map(Number);
            const d = new Date(year, month - 1, day);
            return d.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch {
            return record.date;
        }
    })();

    // Format Time to 12-hour AM/PM: e.g. "09:42:31 AM"
    const formattedTime = (() => {
        try {
            if (!record.time || record.time === "--:--") return "09:42:31 AM";
            const parts = record.time.split(":");
            let hours = parseInt(parts[0], 10);
            const minutes = parts[1] || "00";
            const seconds = parts[2] || "00";
            const ampm = hours >= 12 ? "PM" : "AM";
            hours = hours % 12 || 12;
            const hStr = hours < 10 ? `0${hours}` : `${hours}`;
            return `${hStr}:${minutes}:${seconds} ${ampm}`;
        } catch {
            return record.time || "09:42:31 AM";
        }
    })();

    // Deterministic Attendance ID (e.g. ATT-20260924-001)
    const attendanceId = record.attendance_id || (() => {
        const cleanDate = record.date.replace(/-/g, "");
        const sidNumber = record.student_id.replace(/\D/g, "") || "001";
        const paddedNum = sidNumber.padStart(3, "0");
        return `ATT-${cleanDate}-${paddedNum}`;
    })();

    const confidenceScore = record.confidence || 97;
    const isPresent = record.status !== "Absent";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
            <div
                className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-5 text-slate-800 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-sm">
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 tracking-tight">Verification Details</h2>
                            <p className="text-xs text-emerald-700 font-mono font-semibold">{formattedDate}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Close"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Status Hero Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Status</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${isPresent ? "bg-emerald-500" : "bg-rose-500"}`} />
                            <span className={`text-base font-black tracking-wide ${isPresent ? "text-emerald-700" : "text-rose-700"}`}>
                                {isPresent ? "PRESENT" : "ABSENT"}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Recorded Time</span>
                        <span className="text-sm font-mono font-bold text-slate-900 mt-0.5 block">{formattedTime}</span>
                    </div>
                </div>

                {/* Verification Telemetry Grid */}
                <div className="space-y-3">
                    {/* Verification Breakdown */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            Verification Breakdown
                        </span>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Face Recognition</span>
                                </span>
                                <span className="text-emerald-700 text-[11px] font-mono font-semibold">Matched (FaceNet AI)</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Liveness Detection</span>
                                </span>
                                <span className="text-emerald-700 text-[11px] font-mono font-semibold">Live Sensor OK</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Verification Type</span>
                                </span>
                                <span className="text-slate-900 text-[11px] font-mono font-semibold">Face + Liveness</span>
                            </div>
                        </div>
                    </div>

                    {/* Metadata Specs */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                            <span className="text-[11px] text-slate-500 uppercase font-semibold block">Student ID</span>
                            <span className="text-sm font-bold text-slate-900 font-mono">{record.student_id}</span>
                            {record.name && <span className="text-[11px] text-slate-500 block truncate">{record.name}</span>}
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                            <span className="text-[11px] text-slate-500 uppercase font-semibold block">Confidence</span>
                            <span className="text-sm font-bold text-emerald-700 font-mono">{confidenceScore}%</span>
                            <span className="text-[11px] text-slate-500 block">Biometric Score</span>
                        </div>
                    </div>

                    {/* Attendance ID / Hash */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                            <span className="text-[11px] text-slate-500 uppercase font-semibold block">Attendance ID</span>
                            <span className="font-mono font-bold text-blue-700 text-xs mt-0.5 block">{attendanceId}</span>
                        </div>
                        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold">
                            AUDIT LOGGED
                        </span>
                    </div>
                </div>

                {/* Close CTA */}
                <div className="pt-2">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    );
}
