import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ScanFace,
  ClipboardCheck,
  Bell,
  UserCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { getMe } from "../services/auth.service";
import VeridexLogo from "../components/common/VeridexLogo";

export default function StudentLayout() {
  const { logout, studentId } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{
    name?: string;
    photo_url?: string;
    department?: string;
  } | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => {
        if (data) setProfile(data);
      })
      .catch(() => {});
  }, [studentId]);

  const navItems = [
    {
      name: "Dashboard",
      to: "/student",
      end: true,
      icon: LayoutDashboard,
    },
    {
      name: "Live Attendance",
      to: "/student/webcam",
      badge: "Live",
      icon: ScanFace,
    },
    {
      name: "Attendance Record",
      to: "/student/attendance",
      icon: ClipboardCheck,
    },
    {
      name: "Notifications",
      to: "/student/notifications",
      icon: Bell,
    },
    {
      name: "My Profile",
      to: "/student/profile",
      icon: UserCircle,
    },
    {
      name: "Settings",
      to: "/student/settings",
      icon: Settings,
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const renderNavList = () => (
    <div className="flex flex-col justify-between h-full">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-6 border-b border-[#E5E7EB]">
          <VeridexLogo size="md" showTagline={true} />
        </div>

        {/* Section Label */}
        <div className="px-5 pt-6 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Platform Menu
          </span>
        </div>

        {/* Nav Links */}
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileDrawerOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#EEF2FF] text-[#4F46E5] font-semibold shadow-xs"
                      : "text-[#64748B] hover:text-[#111827] hover:bg-[#F8FAFC]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-5 h-5 transition-colors ${
                          isActive
                            ? "text-[#4F46E5]"
                            : "text-[#64748B] group-hover:text-[#111827]"
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>

                    {item.badge && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#EEF2FF] text-[#4F46E5] border border-[#4F46E5]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] animate-pulse" />
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-4 border-t border-[#E5E7EB] bg-[#F8FAFC]/50 space-y-3">
        {/* User Card */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E5E7EB] shadow-2xs">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[#EEF2FF] text-[#4F46E5] font-bold text-sm flex items-center justify-center border border-[#E5E7EB] flex-shrink-0">
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.name || studentId || "Student"}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span>
                {(profile?.name || studentId || "S").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#16A34A] ring-2 ring-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#111827] truncate">
              {profile?.name || studentId || "Student"}
            </p>
            <p className="text-[11px] text-[#64748B] truncate flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#16A34A]" />
              <span>{profile?.department || "Verified Biometric"}</span>
            </p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#DC2626] hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-200 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex flex-col md:flex-row antialiased selection:bg-[#EEF2FF] selection:text-[#4F46E5]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#E5E7EB] sticky top-0 h-screen overflow-y-auto flex-shrink-0 z-30 shadow-xs">
        {renderNavList()}
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-xs">
        <VeridexLogo size="sm" showTagline={false} />
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="p-2 rounded-xl border border-[#E5E7EB] text-[#64748B] hover:text-[#111827] hover:bg-[#F8FAFC]"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Slide Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white border-r border-[#E5E7EB] h-full flex flex-col z-50 shadow-2xl">
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F8FAFC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavList()}
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
