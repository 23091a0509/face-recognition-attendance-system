import { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMe } from "../services/auth.service";

export default function StudentLayout() {
    const { logout, studentId } = useAuth();
    const [profile, setProfile] = useState<{ name?: string; photo_url?: string; department?: string } | null>(null);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isPinned, setIsPinned] = useState(false);

    useEffect(() => {
        getMe().then((data) => {
            if (data) setProfile(data);
        }).catch(() => {});
    }, [studentId]);

    // Auto-sidebar: expands automatically on hover or when pinned on desktop
    const isExpanded = isPinned || isHovered;

    const navItems = [
        {
            name: "Dashboard",
            to: "/student",
            end: true,
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
        },
        {
            name: "Live Attendance",
            to: "/student/webcam",
            badge: "Live",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
        {
            name: "Attendance Records",
            to: "/student/attendance",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
            ),
        },
        {
            name: "Notifications",
            to: "/student/notifications",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
                    <div className={`flex items-center ${expanded ? "justify-between" : "justify-center"} px-2 py-3 mb-6 transition-all duration-200`}>
                        <div className="flex items-center gap-3">
                            <div className="relative group/logo">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-xl blur opacity-40 group-hover/logo:opacity-75 transition duration-300"></div>
                                <div className="relative h-10 w-10 rounded-xl bg-[#0e1726] border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xl flex-shrink-0 shadow-lg">
                                    ◉
                                </div>
                            </div>
                            {expanded && (
                                <div className="overflow-hidden transition-all duration-200">
                                    <h2 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5 truncate">
                                        FaceAttend
                                        <span className="text-[10px] font-mono text-emerald-400 font-normal px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                            Student
                                        </span>
                                    </h2>
                                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        Biometric Attendance
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Pin / Auto Mode Toggle (Desktop only) */}
                        {!isMobile ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsPinned(!isPinned);
                                }}
                                title={isPinned ? "Unpin sidebar (Automatic mode)" : "Pin sidebar permanently"}
                                className={`hidden md:flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                    isPinned
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border border-slate-700/60"
                                }`}
                            >
                                <svg
                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isPinned ? "rotate-45 text-emerald-400" : ""}`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path d="M10 2a1 1 0 00-1 1v1.323l-3.954 1.582A2 2 0 004 7.764V10a2 2 0 001.328 1.882L9 13.382V17a1 1 0 002 0v-3.618l3.672-1.5A2 2 0 0016 10V7.764a2 2 0 00-1.046-1.859L11 4.323V3a1 1 0 00-1-1z" />
                                </svg>
                                {expanded && (
                                    <span className="text-[10px] tracking-wide">
                                        {isPinned ? "Pinned" : "Auto"}
                                    </span>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => setMobileDrawerOpen(false)}
                                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white"
                                aria-label="Close sidebar"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Section Label */}
                    {expanded && (
                        <div className="flex items-center justify-between px-3 mb-2.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                NAVIGATION
                            </span>
                            {!isMobile && !isPinned && (
                                <span className="text-[9px] font-semibold text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 animate-pulse">
                                    Auto
                                </span>
                            )}
                        </div>
                    )}

                    {/* Navigation Items */}
                    <nav className="space-y-1.5">
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
                                    } rounded-xl text-sm font-medium transition-all duration-200 ${
                                        isActive
                                            ? "bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/5 text-emerald-300 border-l-4 border-l-emerald-400 border-y border-r border-emerald-500/30 shadow-lg shadow-emerald-500/10 font-semibold"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 border border-transparent"
                                    }`
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "text-slate-400 group-hover:text-slate-200"}`}>
                                            {item.icon}
                                        </span>

                                        {expanded && (
                                            <span className="truncate flex-1 tracking-tight">
                                                {item.name}
                                            </span>
                                        )}

                                        {expanded && item.badge && (
                                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm animate-pulse">
                                                {item.badge}
                                            </span>
                                        )}

                                        {/* Floating Tooltip in collapsed mode */}
                                        {!expanded && (
                                            <div className="fixed left-[78px] ml-2 hidden group-hover:flex items-center z-50 pointer-events-none">
                                                <div className="bg-[#0e1726] border border-slate-700/80 text-slate-100 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
                                                    <span>{item.name}</span>
                                                    {item.badge && (
                                                        <span className="text-[9px] font-bold px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
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

                {/* Profile & Controls Footer */}
                <div className="mt-auto pt-4 border-t border-slate-800/80 space-y-2.5">
                    {expanded ? (
                        <>
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0e1726]/80 border border-slate-800 shadow-inner">
                                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-xs font-black text-emerald-400 border border-emerald-500/40 flex-shrink-0 shadow-sm">
                                    {profile?.photo_url ? (
                                        <img
                                            src={profile.photo_url}
                                            alt={profile.name || studentId || "Student"}
                                            className="h-full w-full object-cover"
                                            onError={(e) => {
                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <span>{(profile?.name || studentId || "S").charAt(0).toUpperCase()}</span>
                                    )}
                                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0b1120] animate-pulse" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-200 truncate">
                                        {profile?.name || studentId || "Student"}
                                    </p>
                                    <p className="text-[10px] text-emerald-400 font-mono truncate flex items-center gap-1">
                                        <span>{profile?.department || "Verified Face ID"}</span>
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all shadow-sm"
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
                                title={`Logged in: ${profile?.name || studentId || "Student"}`}
                                className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden bg-emerald-500/20 text-xs font-black text-emerald-400 border border-emerald-500/30 cursor-pointer"
                            >
                                {profile?.photo_url ? (
                                    <img
                                        src={profile.photo_url}
                                        alt="Profile"
                                        className="h-full w-full object-cover"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLElement).style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <span>{(profile?.name || studentId || "S").charAt(0).toUpperCase()}</span>
                                )}
                                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0b1120]" />
                            </div>
                            <button
                                onClick={logout}
                                title="Sign Out"
                                className="p-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-all"
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
        <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans antialiased flex flex-col md:flex-row selection:bg-emerald-500 selection:text-black">
            {/* Desktop Automatic Sidebar:
                Expands smoothly on hover or when pinned.
            */}
            <aside
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`hidden md:flex flex-col ${
                    isExpanded ? "w-64" : "w-[72px]"
                } transition-all duration-300 ease-in-out flex-shrink-0 border-r border-slate-800/80 bg-[#0b1120]/95 backdrop-blur-xl p-3.5 sticky top-0 h-screen overflow-y-auto overflow-x-hidden shadow-2xl z-30`}
            >
                {renderNav(false)}
            </aside>

            {/* Mobile Top Header */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0b1120]/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 shadow-lg">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-black text-sm shadow-md shadow-emerald-500/20">
                        ◉
                    </div>
                    <div>
                        <span className="font-extrabold text-sm text-white block leading-tight">Student Portal</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Face Biometrics</span>
                    </div>
                </div>

                <button
                    onClick={() => setMobileDrawerOpen(true)}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white transition-colors"
                    aria-label="Toggle navigation menu"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </header>

            {/* Mobile Floating Edge Sidebar Tab (One-touch instant sidebar handle) */}
            <button
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-30 flex items-center bg-[#0e1726]/90 hover:bg-slate-800 text-emerald-400 border-y border-r border-emerald-500/40 rounded-r-xl px-1.5 py-3 shadow-2xl backdrop-blur-md transition-all active:scale-95 group"
                aria-label="Open sidebar drawer"
                title="Open Sidebar"
            >
                <div className="flex flex-col items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </button>

            {/* Mobile Animated Slide-out Sidebar Drawer with smooth CSS translate */}
            <div className={`fixed inset-0 z-50 md:hidden flex transition-opacity duration-300 ${mobileDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={() => setMobileDrawerOpen(false)}
                />
                <div className={`relative w-72 max-w-[85vw] bg-[#0b1120]/98 backdrop-blur-2xl border-r border-slate-700/60 p-5 h-full flex flex-col z-50 shadow-2xl rounded-r-3xl transform transition-transform duration-300 ease-out ${mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
                    {renderNav(true)}
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-x-hidden pb-28 md:pb-8">
                <Outlet />
            </main>

            {/* Mobile Floating Bottom Bar (Modern iOS style pill dock) */}
            <div className="md:hidden fixed bottom-3 left-4 right-4 z-40 max-w-md mx-auto">
                <div className="bg-[#0e1726]/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl px-3 py-2 flex items-center justify-around shadow-2xl shadow-black/90">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                `flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold transition-all duration-200 ${
                                    isActive
                                        ? "text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shadow-md shadow-emerald-500/10 scale-105"
                                        : "text-slate-400 hover:text-slate-200"
                                }`
                            }
                        >
                            {item.icon}
                            <span className="truncate">{item.name.replace("Attendance ", "")}</span>
                        </NavLink>
                    ))}
                    <button
                        onClick={() => setMobileDrawerOpen(true)}
                        className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <span>Menu</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
