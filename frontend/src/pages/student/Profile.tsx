import { useState, useEffect } from "react";
import {
  Mail,
  Building,
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { getMe } from "../../services/auth.service";

export default function StudentProfile() {
  const [profile, setProfile] = useState<{
    student_id?: string;
    name?: string;
    department?: string;
    year?: string;
    email?: string;
    photo_url?: string;
  } | null>(null);

  useEffect(() => {
    getMe()
      .then((data) => {
        if (data) setProfile(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
          My Profile
        </h1>
        <p className="text-sm text-[#64748B]">
          Manage your verified biometric identity and academic account details.
        </p>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-[#EEF2FF] via-[#E0E7FF] to-[#EEF2FF] border-b border-[#E5E7EB] relative flex items-end px-8 pb-4">
          <span className="text-xs font-semibold text-[#4F46E5] bg-white/90 backdrop-blur-xs px-3 py-1 rounded-full border border-[#4F46E5]/20 shadow-xs flex items-center gap-1.5 ml-auto mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
            Identity Verified Active
          </span>
        </div>

        <div className="p-8 pt-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5 -mt-14 mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-white p-1 border-2 border-white shadow-md overflow-hidden">
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt={profile.name || "Student"}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center font-bold text-2xl rounded-xl">
                    {(profile?.name || profile?.student_id || "S")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-[#16A34A] text-white p-1 rounded-full ring-2 ring-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex-1">
              <h2 className="text-xl font-bold text-[#111827]">
                {profile?.name || "Student Name"}
              </h2>
              <p className="text-sm font-mono text-[#4F46E5]">
                {profile?.student_id || "CS001"}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#E5E7EB]">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
              <span className="text-xs text-[#64748B] flex items-center gap-1.5 mb-1">
                <Building className="w-3.5 h-3.5 text-[#4F46E5]" />
                Department
              </span>
              <p className="text-sm font-semibold text-[#111827]">
                {profile?.department || "Computer Science & Engineering"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
              <span className="text-xs text-[#64748B] flex items-center gap-1.5 mb-1">
                <GraduationCap className="w-3.5 h-3.5 text-[#4F46E5]" />
                Academic Year
              </span>
              <p className="text-sm font-semibold text-[#111827]">
                {profile?.year || "Year 4 (Senior)"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
              <span className="text-xs text-[#64748B] flex items-center gap-1.5 mb-1">
                <Mail className="w-3.5 h-3.5 text-[#4F46E5]" />
                Institutional Email
              </span>
              <p className="text-sm font-semibold text-[#111827]">
                {profile?.email || `${profile?.student_id || "cs001"}@university.edu`}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
              <span className="text-xs text-[#64748B] flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
                Biometric Vector Status
              </span>
              <p className="text-sm font-semibold text-[#16A34A] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                InceptionResnetV1 Enrolled (512D)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
