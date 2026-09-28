import { useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Lock,
  User,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import api from "../../services/api";
import VeridexLogo from "../../components/common/VeridexLogo";

interface ValidationErrors {
  username?: string;
  password?: string;
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get("expired") === "true";

  const validateField = (
    name: "username" | "password",
    value: string
  ): string => {
    if (name === "username") {
      if (!value.trim()) return "Student ID or username is required";
      if (value.length < 2) return "Must be at least 2 characters";
    }

    if (name === "password") {
      if (!value) return "Password is required";
      if (value.length < 2) return "Password must be at least 2 characters";
    }

    return "";
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    setError("");

    if (errors.username !== undefined) {
      setErrors((prev) => ({
        ...prev,
        username: validateField("username", value),
      }));
    }
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setError("");

    if (errors.password !== undefined) {
      setErrors((prev) => ({
        ...prev,
        password: validateField("password", value),
      }));
    }
  };

  const handleUsernameBlur = () => {
    setErrors((prev) => ({
      ...prev,
      username: validateField("username", username),
    }));
  };

  const handlePasswordBlur = () => {
    setErrors((prev) => ({
      ...prev,
      password: validateField("password", password),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {
      username: validateField("username", username),
      password: validateField("password", password),
    };

    setErrors(newErrors);
    return !newErrors.username && !newErrors.password;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  async function handleLogin() {
    setError("");

    if (!validateForm()) return;

    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("username", username);
      body.append("password", password);

      const res = await api.post("/auth/login", body, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      localStorage.setItem("token", res.data.access_token);

      if (username === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/student", { replace: true });
      }
    } catch (err: any) {
      console.error("Login request failed:", err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.message === "Network Error" || !err.response) {
        setError(
          "Cannot reach backend server. Please verify your device connection."
        );
      } else {
        setError("Invalid credentials. Please verify your ID and password.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Pre-fill helper for quick testing during HR / demo presentations
  const fillCredentials = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError("");
    setErrors({});
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col lg:grid lg:grid-cols-12 selection:bg-[#EEF2FF] selection:text-[#4F46E5]">
      {/* ========================================================================= */}
      {/* LEFT SECTION: Brand Identity & Subtle Futuristic AI Visualization       */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#F8FAFC] via-[#EEF2FF]/40 to-[#F8FAFC] lg:col-span-7 flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-[#E5E7EB]">
        {/* Subtle background ambient mesh and grid */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#CBD5E1 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />

        {/* Soft Indigo Glow in Center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#4F46E5]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header / Logo */}
        <div className="relative z-10">
          <VeridexLogo size="lg" showTagline={false} />
        </div>

        {/* Center Content: Brand Manifesto & AI Visualization */}
        <div className="relative z-10 my-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] shadow-xs text-xs font-semibold text-[#4F46E5] mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Enterprise AI Biometric Infrastructure</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#111827] tracking-tight leading-[1.15] mb-4">
            Intelligent Presence. <br />
            <span className="text-[#4F46E5]">Verified.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#64748B] font-normal leading-relaxed mb-8">
            AI-powered facial recognition attendance platform delivering
            sub-second identity verification, real-time presence auditing, and
            tamper-proof compliance.
          </p>

          {/* Minimal Futuristic Face-Recognition Visualization */}
          <div className="relative w-full max-w-md h-64 mx-auto sm:mx-0 rounded-2xl bg-white/70 backdrop-blur-md border border-[#E5E7EB] shadow-xs p-6 flex items-center justify-center overflow-hidden">
            {/* Subtle Scanning Radar Circle */}
            <svg
              className="w-56 h-56 text-[#4F46E5]/20"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer thin ring */}
              <circle
                cx="100"
                cy="100"
                r="88"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 4"
              />

              {/* Mid ring */}
              <circle
                cx="100"
                cy="100"
                r="64"
                stroke="#4F46E5"
                strokeWidth="1.2"
                strokeOpacity="0.4"
              />

              {/* Inner focal ring */}
              <circle
                cx="100"
                cy="100"
                r="36"
                stroke="#4F46E5"
                strokeWidth="1"
                strokeOpacity="0.3"
              />

              {/* Face Contour Geometric Wireframe */}
              <path
                d="M72 70 C72 50, 128 50, 128 70 C128 100, 118 126, 100 138 C82 126, 72 100, 72 70 Z"
                stroke="#4F46E5"
                strokeWidth="1.4"
                strokeDasharray="2 2"
                strokeOpacity="0.7"
              />

              {/* Eye line / T-Zone */}
              <line
                x1="82"
                y1="82"
                x2="118"
                y2="82"
                stroke="#4F46E5"
                strokeWidth="1"
                strokeOpacity="0.5"
              />

              {/* Subtle Neural Network Lines */}
              <line
                x1="86"
                y1="80"
                x2="100"
                y2="98"
                stroke="#4F46E5"
                strokeWidth="0.8"
                strokeOpacity="0.4"
              />
              <line
                x1="114"
                y1="80"
                x2="100"
                y2="98"
                stroke="#4F46E5"
                strokeWidth="0.8"
                strokeOpacity="0.4"
              />
              <line
                x1="100"
                y1="98"
                x2="100"
                y2="124"
                stroke="#4F46E5"
                strokeWidth="0.8"
                strokeOpacity="0.4"
              />
              <line
                x1="76"
                y1="98"
                x2="100"
                y2="98"
                stroke="#4F46E5"
                strokeWidth="0.8"
                strokeOpacity="0.3"
              />
              <line
                x1="124"
                y1="98"
                x2="100"
                y2="98"
                stroke="#4F46E5"
                strokeWidth="0.8"
                strokeOpacity="0.3"
              />

              {/* Verification Nodes */}
              <circle cx="86" cy="80" r="3" fill="#4F46E5" />
              <circle cx="114" cy="80" r="3" fill="#4F46E5" />
              <circle cx="100" cy="98" r="2.5" fill="#4F46E5" />
              <circle cx="94" cy="116" r="2" fill="#4F46E5" />
              <circle cx="106" cy="116" r="2" fill="#4F46E5" />
              <circle cx="100" cy="128" r="2.5" fill="#16A34A" />

              {/* Subtle corner reticles */}
              <path
                d="M60 55 H50 V65"
                stroke="#4F46E5"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M140 55 H150 V65"
                stroke="#4F46E5"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M60 145 H50 V135"
                stroke="#4F46E5"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M140 145 H150 V135"
                stroke="#4F46E5"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>

            {/* Moving Soft Scan Beam */}
            <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-[#4F46E5] to-transparent animate-scan-beam shadow-[0_0_12px_rgba(79,70,229,0.6)] pointer-events-none" />

            {/* Dynamic Status Tag */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-[#64748B]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                BIOMETRIC SENSOR :: READY
              </span>
              <span className="text-[#4F46E5] font-semibold">512D VECTOR</span>
            </div>
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 pt-6 border-t border-[#E5E7EB]/80 grid grid-cols-3 gap-4 text-left">
          <div>
            <p className="text-sm font-bold text-[#111827]">99.8%</p>
            <p className="text-xs text-[#64748B]">Verification Accuracy</p>
          </div>
          <div>
            <p className="text-sm font-bold text-[#111827]">&lt; 350ms</p>
            <p className="text-xs text-[#64748B]">Sub-second Match</p>
          </div>
          <div>
            <p className="text-sm font-bold text-[#111827]">Zero-Proxy</p>
            <p className="text-xs text-[#64748B]">Active Liveness Guard</p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* RIGHT SECTION: Clean White Authentication Card                            */}
      {/* ========================================================================= */}
      <section className="lg:col-span-5 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md">
          {/* Main Card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] p-8 sm:p-10 transition-all">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#111827] tracking-tight mb-1.5 flex items-center gap-2">
                Welcome Back <span>👋</span>
              </h2>
              <p className="text-sm text-[#64748B]">
                Sign in to access your attendance dashboard.
              </p>
            </div>

            {/* Session Expired Notice */}
            {isExpired && (
              <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Session Expired</span>
                  Your active attendance session ended or your token expired.
                  Please sign in again.
                </div>
              </div>
            )}

            {/* Error Notification */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0 mt-0.5" />
                <div className="leading-snug">{error}</div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Username / Student ID Field */}
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1.5">
                  Student ID / Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    onBlur={handleUsernameBlur}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    placeholder="e.g. CS001 or admin"
                    className={`w-full pl-10 pr-4 py-2.5 bg-white border ${
                      errors.username
                        ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/10"
                        : "border-[#E5E7EB] focus:border-[#4F46E5] focus:ring-[#4F46E5]/15"
                    } rounded-xl text-sm text-[#111827] placeholder:text-slate-400 focus:outline-none focus:ring-3 transition-all`}
                  />
                </div>
                {errors.username && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {errors.username}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#111827]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      alert(
                        "For credential recovery, please reach out to your faculty administrator or use demo defaults (Admin: admin / admin123, Student: CS001 / password123)."
                      )
                    }
                    className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={handlePasswordBlur}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    placeholder="Enter your password"
                    className={`w-full pl-10 pr-10 py-2.5 bg-white border ${
                      errors.password
                        ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/10"
                        : "border-[#E5E7EB] focus:border-[#4F46E5] focus:ring-[#4F46E5]/15"
                    } rounded-xl text-sm text-[#111827] placeholder:text-slate-400 focus:outline-none focus:ring-3 transition-all`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#64748B] hover:text-[#111827]"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-xs transition-all duration-150 cursor-pointer focus:outline-none focus:ring-3 focus:ring-[#4F46E5]/20"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Security Indicator */}
              <div className="pt-3 pb-1 flex items-center justify-center gap-1.5 text-xs text-[#64748B]">
                <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                <span className="font-medium">
                  Secure AI-powered authentication
                </span>
              </div>
            </div>

            {/* Quick-fill chips for HR / Demo Presentations */}
            <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2 text-center">
                Demo Accounts (One-Click)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillCredentials("admin", "admin123")}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#EEF2FF] hover:border-[#4F46E5]/40 text-[11px] text-[#111827] font-medium transition-all text-left flex items-center justify-between"
                >
                  <span>Admin Portal</span>
                  <span className="text-[10px] text-[#4F46E5] font-mono">
                    admin
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials("CS001", "password123")}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#EEF2FF] hover:border-[#4F46E5]/40 text-[11px] text-[#111827] font-medium transition-all text-left flex items-center justify-between"
                >
                  <span>Student Portal</span>
                  <span className="text-[10px] text-[#4F46E5] font-mono">
                    CS001
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-[#64748B] mt-6">
            VERIDEX Attendance Platform &copy; {new Date().getFullYear()} &bull;
            All Rights Reserved
          </p>
        </div>
      </section>
    </div>
  );
}
