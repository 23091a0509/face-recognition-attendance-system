import { useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
} from "lucide-react";

export default function StudentSettings() {
  const [cameraPreference, setCameraPreference] = useState("user");
  const [notifyOnAttendance, setNotifyOnAttendance] = useState(true);
  const [notifyOnSessionEnd, setNotifyOnSessionEnd] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-[#64748B]">
          Configure your camera recognition preferences, notifications, and device security.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs divide-y divide-[#E5E7EB]">
        {/* Camera Preferences */}
        <div className="p-6">
          <h2 className="text-base font-semibold text-[#111827] flex items-center gap-2 mb-1">
            <Camera className="w-4 h-4 text-[#4F46E5]" />
            Biometric Camera Feed
          </h2>
          <p className="text-xs text-[#64748B] mb-4">
            Select the default camera capture mode for live attendance verification.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
            <label
              className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                cameraPreference === "user"
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]"
                  : "border-[#E5E7EB] bg-white text-[#111827]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="cam"
                  value="user"
                  checked={cameraPreference === "user"}
                  onChange={() => setCameraPreference("user")}
                  className="text-[#4F46E5]"
                />
                <span className="text-sm font-medium">Front Camera (Selfie)</span>
              </div>
            </label>

            <label
              className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                cameraPreference === "environment"
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]"
                  : "border-[#E5E7EB] bg-white text-[#111827]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="cam"
                  value="environment"
                  checked={cameraPreference === "environment"}
                  onChange={() => setCameraPreference("environment")}
                  className="text-[#4F46E5]"
                />
                <span className="text-sm font-medium">External / Environment</span>
              </div>
            </label>
          </div>
        </div>

        {/* Notifications */}
        <div className="p-6">
          <h2 className="text-base font-semibold text-[#111827] flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-[#4F46E5]" />
            Attendance Notifications
          </h2>
          <p className="text-xs text-[#64748B] mb-4">
            Control automated in-app alerts and verification updates.
          </p>
          <div className="space-y-3 max-w-lg">
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F8FAFC] cursor-pointer">
              <span className="text-sm text-[#111827]">Notify when attendance is verified</span>
              <input
                type="checkbox"
                checked={notifyOnAttendance}
                onChange={(e) => setNotifyOnAttendance(e.target.checked)}
                className="w-4 h-4 text-[#4F46E5] rounded-sm"
              />
            </label>
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F8FAFC] cursor-pointer">
              <span className="text-sm text-[#111827]">Notify when attendance session is ending</span>
              <input
                type="checkbox"
                checked={notifyOnSessionEnd}
                onChange={(e) => setNotifyOnSessionEnd(e.target.checked)}
                className="w-4 h-4 text-[#4F46E5] rounded-sm"
              />
            </label>
          </div>
        </div>

        {/* Save button */}
        <div className="p-6 flex items-center justify-between bg-[#F8FAFC] rounded-b-2xl">
          <div className="text-xs text-[#64748B]">
            {saved && (
              <span className="text-[#16A34A] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Preferences saved successfully
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-semibold rounded-xl transition-all shadow-xs"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
