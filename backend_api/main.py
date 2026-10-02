from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend_api.routers.auth import router as auth_router
from backend_api.routers.students import router as students_router
from backend_api.routers.attendance import router as attendance_router
from backend_api.routers.notifications import router as notifications_router
from backend_api.routers.admin import router as admin_router

from backend.database import create_tables

import os
from fastapi.staticfiles import StaticFiles

from backend_api.config import ALLOWED_ORIGINS, ENV, TIMEZONE_NAME

import logging
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backend_api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FastAPI backend application...")
    try:
        logger.info("Initializing SQLite database tables...")
        create_tables()
        logger.info("Database tables initialized and seeded successfully.")

        # Ensure IP restriction is disabled by default so internet attendance is never blocked
        from backend.database import set_system_config
        if os.getenv("ENFORCE_CAMPUS_IP", "").lower() not in ("true", "1"):
            set_system_config("ip_restriction_enabled", "false")
            logger.info("Campus IP geofencing initialized to DISABLED (Open Access).")
    except Exception as e:
        logger.error("Database initialization failed: %s", e)
        logger.warning("Continuing application startup so health check/diagnostics are reachable.")
    yield
    logger.info("Shutting down FastAPI backend application.")

app = FastAPI(title="Face Attendance System API", lifespan=lifespan)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
PROFILES_DIR = os.path.join(UPLOADS_DIR, "profiles")
os.makedirs(PROFILES_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Hardened CORS Configuration (Permits all Render cloud subdomains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(.*\.onrender\.com|localhost|127\.0\.0\.1|.*\.trycloudflare\.com|.*\.vercel\.app)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(students_router)
app.include_router(attendance_router)
app.include_router(notifications_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {"status": "API running"}

@app.get("/health")
def health_check():
    try:
        from backend.database import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "ok",
        "database": db_status,
        "timezone": TIMEZONE_NAME
    }