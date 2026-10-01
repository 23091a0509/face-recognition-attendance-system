import { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMe } from "../services/auth.service";
import { resolveImageUrl } from "../services/api";

export default function StudentLayout() {
    const { logout, studentId } = useAuth();
    const [profile, setProfile] = useState<{ name?: string; photo_url?: string; department?: string } | null>(null);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    
    // Explicit Sidebar Expansion state (persisted to prevent layout shift)
    const [isExpanded, setIsExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem("attendvision_student_sidebar_expanded");
            return saved !== null ? saved === "true" : true;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem("attendvision_student_sidebar_expanded", String(isExpanded));
        } catch {
            // ignore
        }
    }, [isExpanded]);

    useEffect(() => {
        getMe().then((data) => {
            if (data) setProfile(data);
        }).catch(() => {});

        const handlePhotoUpdate = (e: any) => {
            if (e.detail?.photo_url) {
                setProfile(prev => prev ? { ...prev, photo_url: e.detail.photo_url } : null);
            }
        };
        window.addEventListener("profilePhotoUpdated", handlePhotoUpdate);
        return () => window.removeEventListener("profilePhotoUpdated", handlePhotoUpdate);
    }, [studentId]);

    const navItems = [
        {
            name: "Dashboard",
            to: "/student",
            end: true,
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
        },
        {
            name: "Live Attendance",
            to: "/student/webcam",
            badge: "Live",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
        {
            name: "Attendance Records",
            to: "/student/attendance",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
            ),
        },
        {
            name: "Notifications",
            to: "/student/notifications",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            ),
        },
    ];

    const renderNav = (isMobile: boolean = false) => {
        const expanded = isMobile || isExpanded;
        return (
            <div className="flex flex-col justify-between h-full select-none">
                <div>
                    {/* Brand Header */}
                    <div className={`flex items-center ${expanded ? "justify-between" : "justify-center"} px-2 py-3 mb-5 transition-all duration-200`}>
                        <div className="flex items-center gap-3">
                            <div className="relative group/logo">
                                <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold text-lg flex-shrink-0 shadow-xs">
                                    <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                        <circle cx="12" cy="12" r="9" />
                                        <circle cx="12" cy="12" r="3" fill="currentColor" />
                                    </svg>
                                </div>
                            </div>
                            {expanded && (
                                <div className="overflow-hidden transition-all duration-200">
                                    <h1 className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5 truncate">
                                        AttendVision
                                        <span className="text-[10px] font-mono text-emerald-700 font-semibold px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                                            Student
                                        </span>
                                    </h1>
                                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                                        Biometric Attendance
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Desktop Pin / Toggle */}
                        {!isMobile && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                </svg>
                            </button>
                        )}

                        {/* Mobile Close Button */}
                        {isMobile && (
                            <button
                                onClick={() => setMobileDrawerOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                aria-label="Close navigation"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Navigation Items */}
                    <div className="mb-6">
                        {expanded && (
                            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                PORTAL
                            </div>
                        )}
                        <nav className="space-y-1">
                            {navItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    onClick={() => setMobileDrawerOpen(false)}
                                    title={!expanded ? item.name : undefined}
                                    className={({ isActive }) =>
                                        `group relative flex items-center ${
                                            expanded ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
                                        } rounded-xl text-sm font-medium transition-all duration-150 ${
                                            isActive
                                                ? "bg-emerald-50 text-emerald-800 border-l-4 border-l-emerald-600 border-y border-r border-emerald-200 shadow-xs font-semibold"
                                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <span className={`transition-transform duration-200 group-hover:scale-105 ${isActive ? "text-emerald-600" : "text-slate-500 group-hover:text-slate-800"}`}>
                                                {item.icon}
                                            </span>

                                            {expanded && (
                                                <span className="truncate tracking-tight flex-1">
                                                    {item.name}
                                                </span>
                                            )}

                                            {expanded && item.badge && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                                                    {item.badge}
                                                </span>
                                            )}

                                            {!expanded && (
                                                <div className="fixed left-[84px] ml-1.5 hidden group-hover:flex items-center z-50 pointer-events-none animate-fade-in">
                                                    <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap">
                                                        <span>{item.name}</span>
                                                        {item.badge && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-400 text-slate-900">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Profile & Controls Footer */}
                <div className="mt-auto pt-4 border-t border-slate-200 space-y-2.5">
                    {expanded ? (
                        <>
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
                                <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800 border border-emerald-200 flex-shrink-0 shadow-xs overflow-hidden">
                                    {profile?.photo_url ? (
                                        <img src={resolveImageUrl(profile.photo_url)} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        profile?.name ? profile.name.charAt(0).toUpperCase() : (studentId ? studentId.charAt(0).toUpperCase() : "S")
                                    )}
                                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                        {profile?.name || studentId}
                                    </p>
                                    <p className="text-[10px] text-emerald-700 font-mono truncate font-medium">
                                        {profile?.department || "Student Portal"}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-xs"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div
                                title={`Logged in: ${profile?.name || studentId}`}
                                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800 border border-emerald-200 shadow-xs overflow-hidden"
                            >
                                {profile?.photo_url ? (
                                    <img src={resolveImageUrl(profile.photo_url)} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    profile?.name ? profile.name.charAt(0).toUpperCase() : (studentId ? studentId.charAt(0).toUpperCase() : "S")
                                )}
                                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                            </div>
                            <button
                                onClick={logout}
                                title="Sign Out"
                                className="p-2.5 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900 flex flex-col md:flex-row">
            {/* Desktop Fixed Width Sidebar (No layout-shifting auto-hover) */}
            <aside
                className={`hidden md:flex flex-col ${
                    isExpanded ? "w-64" : "w-[72px]"
                } transition-all duration-200 ease-out flex-shrink-0 bg-white border-r border-slate-200 p-3.5 sticky top-0 h-screen overflow-y-auto overflow-x-hidden shadow-xs z-30`}
            >
                {renderNav(false)}
            </aside>

            {/* Mobile Clean Top App Bar */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="12" r="3" fill="currentColor" />
                        </svg>
                    </div>
                    <div>
                        <span className="font-extrabold text-sm text-slate-900 block leading-tight">AttendVision</span>
                        <span className="text-[10px] text-emerald-700 font-semibold">Student Portal</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <NavLink
                        to="/student/notifications"
                        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative"
                        title="Notifications"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </NavLink>
                    <button
                        onClick={() => setMobileDrawerOpen(true)}
                        className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                        aria-label="Toggle navigation drawer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Mobile Animated Slide-out Sidebar Drawer */}
            <div className={`fixed inset-0 z-50 md:hidden flex transition-opacity duration-250 ${mobileDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
                    onClick={() => setMobileDrawerOpen(false)}
                />
                <div className={`relative w-72 max-w-[85vw] bg-white border-r border-slate-200 p-5 h-full flex flex-col z-50 shadow-2xl rounded-r-3xl transform transition-transform duration-250 ease-out ${mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
                    {renderNav(true)}
                </div>
            </div>

            {/* Main Content Area with Safe-Area Mobile Padding */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-x-hidden pb-28 md:pb-8">
                <Outlet />
            </main>

            {/* Mobile Ergonomic Floating Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-3 left-4 right-4 z-40 max-w-md mx-auto">
                <nav className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl px-2 py-1.5 flex items-center justify-around shadow-lg">
                    <NavLink
                        to="/student"
                        end
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold transition-all duration-150 ${
                                isActive
                                    ? "text-emerald-800 bg-emerald-50 border border-emerald-200 font-bold shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                            }`
                        }
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        <span>Dashboard</span>
                    </NavLink>

                    <NavLink
                        to="/student/webcam"
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold transition-all duration-150 ${
                                isActive
                                    ? "text-emerald-800 bg-emerald-50 border border-emerald-200 font-bold shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                            }`
                        }
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Check-In</span>
                    </NavLink>

                    <NavLink
                        to="/student/attendance"
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold transition-all duration-150 ${
                                isActive
                                    ? "text-emerald-800 bg-emerald-50 border border-emerald-200 font-bold shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                            }`
                        }
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span>Records</span>
                    </NavLink>

                    <NavLink
                        to="/student/notifications"
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold transition-all duration-150 ${
                                isActive
                                    ? "text-emerald-800 bg-emerald-50 border border-emerald-200 font-bold shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                            }`
                        }
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <span>Alerts</span>
                    </NavLink>

                    <button
                        onClick={() => setMobileDrawerOpen(true)}
                        className="flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        aria-label="Open full menu"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <span>Menu</span>
                    </button>
                </nav>
            </div>
        </div>
    );
}
