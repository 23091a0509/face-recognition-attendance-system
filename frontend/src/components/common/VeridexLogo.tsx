
interface VeridexLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  className?: string;
  theme?: "light" | "dark";
}

export default function VeridexLogo({
  size = "md",
  showTagline = false,
  className = "",
  theme = "light",
}: VeridexLogoProps) {
  const iconDimensions = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
    xl: "w-14 h-14",
  }[size];

  const titleSizes = {
    sm: "text-base tracking-wider",
    md: "text-xl tracking-wider",
    lg: "text-2xl tracking-wider",
    xl: "text-3xl tracking-wider",
  }[size];

  const isDark = theme === "dark";

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Minimal Geometric Verification & Face-Scan Symbol */}
      <div
        className={`relative flex items-center justify-center ${iconDimensions} rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#4338CA] text-white shadow-sm ring-1 ring-[#4F46E5]/20 flex-shrink-0`}
      >
        {/* Precision scan brackets */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3/5 h-3/5"
        >
          {/* Top-left bracket */}
          <path d="M4 8V5a1 1 0 0 1 1-1h3" />
          {/* Top-right bracket */}
          <path d="M16 4h3a1 1 0 0 1 1 1v3" />
          {/* Bottom-left bracket */}
          <path d="M4 16v3a1 1 0 0 0 1 1h3" />
          {/* Bottom-right bracket */}
          <path d="M16 20h3a1 1 0 0 0 1-1v-3" />
          {/* Center biometric identity node */}
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path d="M9 12h1m4 0h1" strokeWidth="1.8" />
        </svg>

        {/* Subtle corner indicator dot */}
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#16A34A] ring-2 ring-white" />
      </div>

      {/* Wordmark and optional Tagline */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span
            className={`font-extrabold ${titleSizes} ${
              isDark ? "text-white" : "text-[#111827]"
            } font-sans`}
            style={{ letterSpacing: "0.08em" }}
          >
            VERIDEX
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4F46E5]" />
        </div>

        {showTagline && (
          <span
            className={`text-[10px] font-medium tracking-tight mt-0.5 ${
              isDark ? "text-slate-400" : "text-[#64748B]"
            }`}
          >
            Intelligent Presence. Verified.
          </span>
        )}
      </div>
    </div>
  );
}
