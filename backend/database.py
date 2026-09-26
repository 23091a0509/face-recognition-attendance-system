import sqlite3
import pickle
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("DATABASE_PATH") or os.path.join(BASE_DIR, 'database', 'attendance.db')

def  get_connection():
    # Ensure the parent directory of database exists
    db_dir = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(db_dir, exist_ok=True)
    return sqlite3.connect(DB_PATH)

def create_tables():
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(""" 
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE,
        name TEXT,
        department TEXT,
        password TEXT,
        embedding BLOB
    )              
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT,
        date TEXT,
        time TEXT,
        method TEXT DEFAULT 'manual',
        confidence REAL DEFAULT 0.0,
        liveness_passed INTEGER DEFAULT 0
    )              
    """)

    # Migrate existing table if columns are missing
    cursor.execute("PRAGMA table_info(attendance)")
    existing_cols = [c[1] for c in cursor.fetchall()]
    if "method" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN method TEXT DEFAULT 'manual'")
    if "confidence" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN confidence REAL DEFAULT 0.0")
    if "liveness_passed" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN liveness_passed INTEGER DEFAULT 0")

    # Notifications Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        action_url TEXT,
        metadata TEXT
    )
    """)

    # Create indexes for fast lookup and integrity
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)")
    
    conn.commit()

    # Seed initial notifications if notifications table is empty
    cursor.execute("SELECT COUNT(*) FROM notifications")
    notif_count = cursor.fetchone()[0]
    if notif_count == 0:
        from datetime import datetime, timedelta
        now = datetime.now()
        t_now = now.strftime("%Y-%m-%d %H:%M:%S")
        t_yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
        t_2days = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")

        sample_notifications = [
            (
                "ALL",
                "Important: Midterm Attendance & Exam Policy ⭐",
                "Administrative Notice: 75% biometric attendance is required to be eligible for end-term examinations. Ensure face registration is completed before next Monday.",
                "announcement",
                "alert",
                0,
                t_now,
                "/student/attendance",
                '{"priority": "high", "sender": "Academic Dean"}'
            ),
            (
                "CS001",
                "Attendance Successfully Marked ✅",
                "Your biometric facial attendance was successfully recorded today at 09:15 AM with 98.4% match confidence.",
                "attendance_success",
                "success",
                0,
                t_now,
                "/student/attendance",
                '{"confidence": 98.4, "method": "face_recognition"}'
            ),
            (
                "CS001",
                "Low-Attendance Warning ⚠️",
                "Warning: Your attendance rate in Computer Science is currently 68.5% (below institutional minimum of 75%). Please ensure regular class attendance.",
                "low_attendance",
                "warning",
                0,
                t_yesterday,
                "/student/attendance",
                '{"current_rate": 68.5, "required_rate": 75.0}'
            ),
            (
                "CS001",
                "Attendance Record Corrected ✏️",
                "Your attendance record for yesterday was reviewed by administrator and updated from Absent to Present (Verified).",
                "correction",
                "info",
                1,
                t_2days,
                "/student/attendance",
                '{"updated_by": "admin", "status": "Present"}'
            )
        ]
        cursor.executemany(
            "INSERT INTO notifications (student_id, title, message, type, severity, is_read, created_at, action_url, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            sample_notifications
        )
        conn.commit()

    # Seed default credentials if database is empty (Task 6 & 7)
    cursor.execute("SELECT COUNT(*) FROM students")
    count = cursor.fetchone()[0]
    if count == 0:
        print("[INFO] Seeding default credentials...")
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        
        default_users = [
            ("admin", "Admin User", "Administration", pwd_context.hash("admin123")),
            ("CS001", "Test Student - Akif", "Computer Science", pwd_context.hash("password123")),
            ("CS008", "Ahmad", "Computer Science", pwd_context.hash("AhmadCS008")),
        ]
        cursor.executemany(
            "INSERT INTO students (student_id, name, department, password) VALUES (?, ?, ?, ?)",
            default_users
        )
        conn.commit()

    conn.close()