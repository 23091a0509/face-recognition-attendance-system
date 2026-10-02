import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import ProtectedRoute from "../routes/ProtectedRoute";
import { AuthProvider } from "./providers";
import RouteErrorBoundary from "../components/common/RouteErrorBoundary";

import AdminLayout from "../layouts/AdminLayout";
import StudentLayout from "../layouts/StudentLayout";
import Login from "../pages/auth/Login";

// Lazy-loaded routes for production performance and minimal initial bundle size
const Register = lazy(() => import("../pages/auth/Register"));

const AdminDashboard = lazy(() => import("../pages/admin/Dashboard"));
const AdminStudents = lazy(() => import("../pages/admin/Students"));
const AdminAttendance = lazy(() => import("../pages/admin/Attendance"));
const AdminHistory = lazy(() => import("../pages/admin/History"));
const AdminReports = lazy(() => import("../pages/admin/Reports"));
const AdminNotifications = lazy(() => import("../pages/admin/Notifications"));
const AdminSettings = lazy(() => import("../pages/admin/Settings"));

const StudentDashboard = lazy(() => import("../pages/student/Dashboard"));
const StudentAttendance = lazy(() => import("../pages/student/Attendance"));
const StudentWebcam = lazy(() => import("../pages/student/Webcam"));
const StudentNotifications = lazy(() => import("../pages/student/Notifications"));

function SuspenseWrapper({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-8 animate-fade-in">
          <div className="w-8 h-8 rounded-full border-3 border-blue-600/30 border-t-blue-600 animate-spin" />
          <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider uppercase">Loading...</span>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    // Root wrapper: provides AuthContext to entire app
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        element: <Navigate to="/login" replace />,
      },
      {
        path: "/login",
        element: <Login />,
      },
      {
        path: "/register",
        element: (
          <SuspenseWrapper>
            <Register />
          </SuspenseWrapper>
        ),
      },

      // ADMIN ROUTES
      {
        path: "/admin",
        element: (
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <SuspenseWrapper><AdminDashboard /></SuspenseWrapper> },
          { path: "students", element: <SuspenseWrapper><AdminStudents /></SuspenseWrapper> },
          { path: "attendance", element: <SuspenseWrapper><AdminAttendance /></SuspenseWrapper> },
          { path: "history", element: <SuspenseWrapper><AdminHistory /></SuspenseWrapper> },
          { path: "reports", element: <SuspenseWrapper><AdminReports /></SuspenseWrapper> },
          { path: "notifications", element: <SuspenseWrapper><AdminNotifications /></SuspenseWrapper> },
          { path: "settings", element: <SuspenseWrapper><AdminSettings /></SuspenseWrapper> },
        ],
      },

      // STUDENT ROUTES
      {
        path: "/student",
        element: (
          <ProtectedRoute requiredRole="student">
            <StudentLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <SuspenseWrapper><StudentDashboard /></SuspenseWrapper> },
          { path: "webcam", element: <SuspenseWrapper><StudentWebcam /></SuspenseWrapper> },
          { path: "attendance", element: <SuspenseWrapper><StudentAttendance /></SuspenseWrapper> },
          { path: "notifications", element: <SuspenseWrapper><StudentNotifications /></SuspenseWrapper> },
        ],
      },

      // FALLBACK
      {
        path: "*",
        element: <Navigate to="/login" replace />,
      },
    ],
  },
]);