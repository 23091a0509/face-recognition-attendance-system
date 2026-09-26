import { useState } from "react";

export default function SettingsPage() {
    const [faceThreshold, setFaceThreshold] = useState(0.7);
    const [minConfidence, setMinConfidence] = useState(85);
    const [duplicateProtection, setDuplicateProtection] = useState(true);
    const [duplicateWindowMinutes, setDuplicateWindowMinutes] = useState(5);
    const [lateAfterTime, setLateAfterTime] = useState("09:15");
    const [savedNotice, setSavedNotice] = useState(false);

    function handleSave() {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
    }

    return (
        <div className="space-y-6 max-w-4l">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Attendance Settings</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Configure AI face recognition parameters, cooldowns, and attendance policies
                    </p>
                </div>
                {savedNotice && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-medium">
                        ✓ Settings saved successfully!
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 shadow-xl space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ☙️
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">AI Recognition Settings</h2>
                        <p className="text-xs text-slate-400">Manage cosine similarity tolerance and liveness parameters</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-slate-200">
                                Recognition Threshold (Cosine Distance)
                            </label>
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-400">
                                {faceThreshold.toFixed(2)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.50"
                            max="0.95"
                            step="0.01"
                            value={faceThreshold}
                            onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1.5">
                                Minimum Match Confidence
                            </label>
                            <input
                                type="number"
                                min="50"
                                max="99"
                                value={minConfidence}
                                onChange={(e) => setMinConfidence(parseInt(e.target.value) || 80)}
                                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1.5">
                                Duplicate Attendance Window (minutes)
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={duplicateWindowMinutes}
                                onChange={(e) => setDuplicateWindowMinutes(parseInt(e.target.value) || 5)}
                                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <div>
                            <p className="text-sm font-medium text-slate-200">Duplicate Attendance Protection</p>
                            <p className="text-xs text-slate-400">Prevent duplicate logs within cooldown window</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={duplicateProtection}
                            onChange={(e) => setDuplicateProtection(e.target.checked)}
                            className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 shadow-xl space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                    <div className="p-2 rounded-mg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        📏
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">Institutional Attendance Rules</h2>
                        <p className="text-xs text-slate-400">Define schedule boundaries and late arrival thresholds</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-200 mb-1.5">
                            Late Arrival Cutoff Time
                        </label>
                        <input
                            type="time"
                            value={lateAfterTime}
                            onChange={(e) => setLateAfterTime(e.target.value)}
                            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                </div>
            </div>


            <div className="flex items-center justify-end gap-3 pt-4">
                <button
                    type="button"
                    onClick={handleSave}
                    className="px-6 py-2 text-sm font-semibold text-black bg-emerald-500 hover:bg-emerald-400 rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
                >
                    Save Changes
                </button>
            </div>
        </div>

    );
}