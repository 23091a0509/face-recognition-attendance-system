from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend_api.routers.auth import router as auth_router
from backend_api.routers.students import router as students_router
from backend_api.routers.attendance import router as attendance_router
from backend_api.routers.notifications import router as notifications_router

from backend.database import create_tables

import os
from fastapi.staticfiles import StaticFiles

from backend_api.config import ALLOWED_ORIGINS, ENV, TIMEZONE_NAME

app = FastAPI(title="Face Attendance System API")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
PROFILES_DIR = os.path.join(UPLOADS_DIR, "profiles")
os.makedirs(PROFILES_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Hardened CORS Configuration (Phase 21)
if ENV == "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-KEY"],
    )
else:
    # Development mode: permit localhost, LAN IPs, and secure Cloudflare development tunnels
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|.*\.trycloudflare\.com|.*\.vercel\.app)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("startup")
def on_startup():
    print("[STARTUP] Starting FastAPI backend application...", flush=True)
    try:
        print("[STARTUP] Initializing SQLite database tables...", flush=True)
        create_tables()
        print("[STARTUP] Database tables initialized and seeded successfully.", flush=True)
    except Exception as e:
        print(f"[FATAL/STARTUP] Database initialization failed: {e}", flush=True)
        print("[FATAL/STARTUP] Continuing application startup so health check/diagnostics are reachable.", flush=True)

    print("[STARTUP] Registered API Routes:", flush=True)
    for route in app.routes:
        methods = getattr(route, "methods", None)
        methods_str = ",".join(methods) if methods else "GET"
        print(f"  {methods_str:10} {route.path}", flush=True)

app.include_router(auth_router)
app.include_router(students_router)
app.include_router(attendance_router)
app.include_router(notifications_router)


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