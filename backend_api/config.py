import os
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

# Environment & Server Config
ENV = os.getenv("ENV", "development").lower()
PORT = int(os.getenv("PORT", "8000"))

# Timezone Policy: Indian Standard Time (IST) = UTC+05:30
TIMEZONE_NAME = os.getenv("TIMEZONE", "Asia/Kolkata")
IST = timezone(timedelta(hours=5, minutes=30))
LOCAL_TZ = IST

# Attendance Policies
ATTENDANCE_LATE_AFTER = os.getenv("ATTENDANCE_LATE_AFTER", "09:15")

# Biometric & Recognition Thresholds (Calibrated)
FACE_RECOGNITION_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.75"))
MIN_MATCH_MARGIN = float(os.getenv("MIN_MATCH_MARGIN", "0.08"))
REQUIRED_CONSISTENT_FRAMES = int(os.getenv("REQUIRED_CONSISTENT_FRAMES", "3"))

# Security Configuration
_raw_jwt = os.getenv("JWT_SECRET_KEY")
if not _raw_jwt and ENV == "production":
    raise RuntimeError("[FATAL/SECURITY] JWT_SECRET_KEY must be set in production environment!")
JWT_SECRET_KEY = _raw_jwt or "dev-insecure-jwt-key-local-only-32chars"

_raw_service_key = os.getenv("SERVICE_API_KEY")
if not _raw_service_key and ENV == "production":
    raise RuntimeError("[FATAL/SECURITY] SERVICE_API_KEY must be set in production environment!")
SERVICE_API_KEY = _raw_service_key or "dev-service-api-key"

# CORS Configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [
    origin.strip() 
    for origin in os.getenv(
        "ALLOWED_ORIGINS", 
        f"{FRONTEND_URL},http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    ).split(",") 
    if origin.strip()
]

def get_now() -> datetime:
    """Returns the current timezone-aware datetime for the configured institution timezone."""
    return datetime.now(LOCAL_TZ)

def get_today_date_str() -> str:
    """Returns today's date formatted as YYYY-MM-DD in institution timezone."""
    return get_now().strftime("%Y-%m-%d")

def get_time_str() -> str:
    """Returns current time formatted as HH:MM:SS in institution timezone."""
    return get_now().strftime("%H:%M:%S")

def is_attendance_late(time_str: str, late_after: str = None) -> bool:
    """Determines if a given time HH:MM:SS is considered Late based on late_after or ATTENDANCE_LATE_AFTER."""
    if not time_str or time_str == "--:--":
        return False
    try:
        parts = time_str.split(":")
        h = int(parts[0])
        m = int(parts[1])
        
        cutoff = late_after or ATTENDANCE_LATE_AFTER
        cutoff_parts = cutoff.split(":")
        cutoff_h = int(cutoff_parts[0])
        cutoff_m = int(cutoff_parts[1])
        
        return (h > cutoff_h) or (h == cutoff_h and m > cutoff_m)
    except Exception:
        return False
