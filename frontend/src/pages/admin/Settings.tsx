import { useState, useEffect } from "react";
import { getAdminSettings, saveAdminSettings, type AdminSettingsData } from "../../services/attendance.service";

export default function SettingsPage() {
    const [ipRestrictionEnabled, setIpRestrictionEnabled] = useState(false);
    const [allowedIps, setAllowedIps] = useState("127.0.0.1, ::1, 192.168.0.0/16, 10.0.0.0/8");
    const [clientIp, setClientIp] = useState<string>("");
    const [faceThreshold, setFaceThreshold] = useState(0.75);
    const [minMargin, setMinMargin] = useState(0.08);
    const [duplicateProtection, setDuplicateProtection] = useState(true);
    const [duplicateWindowMinutes, setDuplicateWindowMinutes] = useState(5);
    const [lateAfterTime, setLateAfterTime] = useState("09:15");
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        let mounted = true;
        async function fetchSettings() {
            try {
                setLoading(true);
                const data: AdminSettingsData = await getAdminSettings();
                if (!mounted) return;
                setIpRestrictionEnabled(Boolean(data.ip_restriction_enabled));
                if (data.allowed_ips !== undefined) setAllowedIps(data.allowed_ips);
                if (data.client_ip) setClientIp(data.client_ip);
                if (data.face_threshold !== undefined) setFaceThreshold(Number(data.face_threshold));
                if (data.min_margin !== undefined) setMinMargin(Number(data.min_margin));
                if (data.duplicate_protection !== undefined) setDuplicateProtection(Boolean(data.duplicate_protection));
                if (data.duplicate_window_minutes !== undefined) setDuplicateWindowMinutes(Number(data.duplicate_window_minutes));
                if (data.late_after_time !== undefined) setLateAfterTime(data.late_after_time);
            } catch (err: any) {
                console.error("Failed to load settings:", err);
                if (mounted) setErrorMessage("Failed to load current settings from backend server.");
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchSettings();
        return () => { mounted = false; };
    }, []);

    function handleAddCurrentIp() {
        if (!clientIp) return;
        const currentList = allowedIps.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (currentList.includes(clientIp)) {
            alert(`IP ${clientIp} is already in the authorized list.`);
            return;
        }
        const updated = allowedIps ? `${allowedIps.trim()}\n${clientIp}` : clientIp;
        setAllowedIps(updated);
    }

    async function handleSave() {
        setSaving(true);
        setErrorMessage("");
        try {
            await saveAdminSettings({
                ip_restriction_enabled: ipRestrictionEnabled,
                allowed_ips: allowedIps,
                face_threshold: faceThreshold,
                min_margin: minMargin,
                duplicate_protection: duplicateProtection,
                duplicate_window_minutes: duplicateWindowMinutes,
                late_after_time: lateAfterTime,
            });
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 3500);
        } catch (err: any) {
            console.error("Failed to save settings:", err);
            setErrorMessage(err.response?.data?.detail || "Failed to save settings. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 max-w-4xl text-slate-800">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System & Attendance Settings</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Manage campus Wi-Fi rules, face recognition accuracy, and class timing
                    </p>
                </div>
                {savedNotice && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold shadow-xs animate-fade-in">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Settings saved successfully!</span>
                    </div>
                )}
            </div>

            {errorMessage && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
                    {errorMessage}
                </div>
            )}

            {/* 1. Campus Network & IP Protection */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-slate-900">Campus Wi-Fi & IP Protection</h2>
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                ipRestrictionEnabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                            }`}>
                                {ipRestrictionEnabled ? "Active & Enforced" : "Disabled (Open Access)"}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Allows students to mark attendance only when connected to official campus Wi-Fi</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Restrict Attendance to Campus Wi-Fi Only</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                When turned on, students cannot mark attendance from outside the campus.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={ipRestrictionEnabled}
                                onChange={(e) => setIpRestrictionEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {clientIp && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/70 border border-blue-200/60 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                                <span className="text-xs text-slate-600">Your Detected IP:</span>
                                <code className="font-mono text-xs font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                                    {clientIp}
                                </code>
                            </div>
                            <button
                                type="button"
                                onClick={handleAddCurrentIp}
                                className="text-xs font-semibold px-3 py-1 bg-white text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-300 rounded-lg shadow-sm transition-all"
                            >
                                + Add My Current IP
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Allowed IP Addresses & Wi-Fi Networks
                        </label>
                        <p className="text-xs text-slate-500 mb-2">
                            Enter campus IP addresses or Wi-Fi network ranges (e.g. <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">192.168.1.100</code> or <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">192.168.0.0/16</code>), separated by commas or new lines.
                        </p>
                        <textarea
                            rows={4}
                            value={allowedIps}
                            onChange={(e) => setAllowedIps(e.target.value)}
                            placeholder="127.0.0.1&#10;192.168.1.0/24&#10;10.0.0.0/8"
                            className="w-full font-mono text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors resize-y min-h-[96px] max-h-[200px]"
                        />
                    </div>
                </div>
            </div>

            {/* 2. Face Recognition Accuracy */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">Face Recognition Accuracy</h2>
                        <p className="text-xs text-slate-500">Adjust match sensitivity and prevent matching the wrong student</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                Match Accuracy Requirement
                            </label>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                                {faceThreshold.toFixed(2)} (Standard: ≥ 0.75)
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.60"
                            max="0.90"
                            step="0.01"
                            value={faceThreshold}
                            onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Set to 0.75 by default. Higher values prevent marking the wrong student.
                        </p>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                Difference Between Top Matches
                            </label>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                                {minMargin.toFixed(2)} (Standard: ≥ 0.08)
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.04"
                            max="0.15"
                            step="0.01"
                            value={minMargin}
                            onChange={(e) => setMinMargin(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Requires the best match to clearly beat the second closest match, preventing confusion between lookalikes.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Consecutive Face Checks
                            </label>
                            <input
                                type="text"
                                disabled
                                value="3 consecutive frames"
                                className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium cursor-not-allowed"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Checks 3 frames in a row to ensure a stable match</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Wait Time Between Re-scans (minutes)
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={duplicateWindowMinutes}
                                onChange={(e) => setDuplicateWindowMinutes(parseInt(e.target.value) || 5)}
                                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Prevents marking the same student twice within this time</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Class Schedule & Late Arrival Rules */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">Class Schedule & Late Arrival Rules</h2>
                        <p className="text-xs text-slate-500">Set class times and automatically mark students as Late</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="max-w-xs">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Late Arrival Time
                        </label>
                        <input
                            type="time"
                            value={lateAfterTime}
                            onChange={(e) => setLateAfterTime(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors font-medium"
                        />
                        <p className="text-xs text-slate-500 mt-1">Students marking attendance after this time will be marked as Late.</p>
                    </div>
                </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                    {saving ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving Settings...
                        </>
                    ) : (
                        "Save All Changes"
                    )}
                </button>
            </div>
        </div>
    );
}