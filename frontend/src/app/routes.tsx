import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import ProtectedRoute from "../routes/ProtectedRoute";
import { AuthProvider } from "./providers";

import AdminLayout from "../layouts/AdminLayout";
import StudentLayout from "../layouts/StudentLayout";

import AdminDashboard from "../pages/admin/Dashboard";
import AdminStudents from "../pages/admin/Students";
import AdminAttendance from "../pages/admin/Attendance";
import AdminHistory from "../pages/admin/History";
import AdminReports from "../pages/admin/Reports";
import AdminSettings from "../pages/admin/Settings";
import AdminNotifications from "../pages/admin/Notifications";

import StudentDashboard from "../pages/student/Dashboard";
import StudentAttendance from "../pages/student/Attendance";
import StudentWebcam from "../pages/student/Webcam";
import StudentNotifications from "../pages/student/Notifications";
import StudentProfile from "../pages/student/Profile";
import StudentSettings from "../pages/student/Settings";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import RouteErrorBoundary from "../components/common/RouteErrorBoundary";

export const router = createBrowserRouter([
  {
    // Root wrapper: provides AuthContext to entire app
    element: <AuthProvider><Outlet /></AuthProvider>,
    errorElement: <RouteErrorBoundary />,
    children: [
  { 
    path: "/", 
    element: <Navigate to="/login" replace /> 
  },
  { 
    path: "/login", 
    element: <Login /> 
  },
  { 
    path: "/register", 
    element: <Register /> 
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
      { index: true, element: <AdminDashboard /> },
      { path: "students", element: <AdminStudents /> },
      { path: "attendance", element: <AdminAttendance /> },
      { path: "history", element: <AdminHistory /> },
      { path: "reports", element: <AdminReports /> },
      { path: "notifications", element: <AdminNotifications /> },
      { path: "settings", element: <AdminSettings /> },
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
      { index: true, element: <StudentDashboard /> },
      { path: "webcam", element: <StudentWebcam /> },
      { path: "attendance", element: <StudentAttendance /> },
      { path: "notifications", element: <StudentNotifications /> },
      { path: "profile", element: <StudentProfile /> },
      { path: "settings", element: <StudentSettings /> },
    ],
  },

  // FALLBACK
  { 
    path: "*", 
    element: <Navigate to="/login" replace /> 
  },
  ], // end AuthProvider children
  },   // end root wrapper
]);