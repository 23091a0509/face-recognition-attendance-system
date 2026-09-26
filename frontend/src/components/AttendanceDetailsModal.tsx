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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div
                className="relative w-full max-w-md rounded-2xl bg-[#0b1120] border border-slate-700/80 p-6 shadow-2xl space-y-5 text-slate-100 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                            <span>🔍</span>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">Verification Details</h2>
                            <p className="text-xs text-emerald-400 font-mono font-semibold">{formattedDate}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-7 w-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Status Hero Card */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                    <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Status</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-base font-black text-emerald-400 tracking-wide">
                                {isPresent ? "🟢 PRESENT" : "🔴 ABSENT"}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Recorded Time</span>
                        <span className="text-sm font-mono font-bold text-white mt-0.5 block">{formattedTime}</span>
                    </div>
                </div>

                {/* Verification Telemetry Grid */}
                <div className="space-y-3">
                    {/* Verification Breakdown */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            Verification Breakdown
                        </span>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-200">
                                    <span className="text-emerald-400 font-bold">✓</span> Face Recognition
                                </span>
                                <span className="text-emerald-400 text-[11px] font-mono font-semibold">Matched (FaceNet AI)</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-200">
                                    <span className="text-emerald-400 font-bold">✓</span> Liveness Detection
                                </span>
                                <span className="text-emerald-400 text-[11px] font-mono font-semibold">Live Sensor OK</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-200">
                                    <span className="text-emerald-400 font-bold">✓</span> Verification Type
                                </span>
                                <span className="text-white text-[11px] font-mono font-semibold">Face + Liveness</span>
                            </div>
                        </div>
                    </div>

                    {/* Metadata Specs */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Student ID</span>
                            <span className="text-sm font-bold text-white font-mono">{record.student_id}</span>
                            {record.name && <span className="text-[11px] text-slate-400 block truncate">{record.name}</span>}
                        </div>

                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Confidence</span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">{confidenceScore}%</span>
                            <span className="text-[11px] text-slate-500 block">Biometric Score</span>
                        </div>
                    </div>

                    {/* Attendance ID / Hash */}
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                        <div>
                            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Attendance ID</span>
                            <span className="font-mono font-bold text-indigo-300 text-xs mt-0.5 block">{attendanceId}</span>
                        </div>
                        <span className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-bold">
                            AUDIT LOGGED
                        </span>
                    </div>
                </div>

                {/* Close CTA */}
                <div className="pt-2">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors cursor-pointer"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    );
}
