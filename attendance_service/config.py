import os
from dotenv import load_dotenv

# Load env file from parent directory (repo root)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "dev-service-api-key")

CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
FACE_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.72"))
MIN_MATCH_MARGIN = float(os.getenv("MIN_MATCH_MARGIN", "0.06"))
FRAME_SKIP = int(os.getenv("FRAME_SKIP", "1"))

# Decoupled processing intervals (Instructions 7 & 8)
DETECTION_INTERVAL = int(os.getenv("DETECTION_INTERVAL", "6"))      # Run MTCNN every N frames or when track lost
RECOGNITION_INTERVAL = int(os.getenv("RECOGNITION_INTERVAL", "3"))  # Run FaceNet every N frames
LIVENESS_INTERVAL = int(os.getenv("LIVENESS_INTERVAL", "2"))        # Run blink detection every N frames

# Liveness and timeouts
LIVENESS_TIMEOUT_SECONDS = float(os.getenv("LIVENESS_TIMEOUT_SECONDS", "10.0"))
CACHE_RELOAD_INTERVAL = float(os.getenv("CACHE_RELOAD_INTERVAL", "15.0"))

# Quality thresholds (Instructions 14 & 15)
MIN_FACE_SIZE = int(os.getenv("MIN_FACE_SIZE", "60"))
MIN_BLUR_VAR = float(os.getenv("MIN_BLUR_VAR", "20.0"))
MIN_BRIGHTNESS = float(os.getenv("MIN_BRIGHTNESS", "30.0"))
MAX_BRIGHTNESS = float(os.getenv("MAX_BRIGHTNESS", "240.0"))

# Tracking and caching
TRACKER_IOU_THRESHOLD = float(os.getenv("TRACKER_IOU_THRESHOLD", "0.40"))
IDENTITY_CACHE_SECONDS = float(os.getenv("IDENTITY_CACHE_SECONDS", "1.5"))

# Performance logging (Instruction 34)
PERFORMANCE_MODE = os.getenv("PERFORMANCE_MODE", "true").lower() in ("true", "1", "yes")

def get_auth_headers():
    """Generates an authorization header with the shared Service API Key."""
    return {"X-API-KEY": SERVICE_API_KEY}
