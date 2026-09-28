import sqlite3
import pickle
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("DATABASE_PATH") or os.path.join(BASE_DIR, 'database', 'attendance.db')

def get_connection():
    # Ensure the parent directory of database exists
    db_dir = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

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
        embedding BLOB,
        photo_url TEXT,
        year TEXT,
        email TEXT
    )              
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
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
    if "status" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'Present'")
    if "session_id" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN session_id INTEGER")
    if "minutes_attended" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN minutes_attended INTEGER DEFAULT 0")
    if "reason" not in existing_cols:
        cursor.execute("ALTER TABLE attendance ADD COLUMN reason TEXT")

    # Attendance Sessions & Activity Tracking Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        full_day_threshold REAL DEFAULT 75.0,
        half_day_threshold REAL DEFAULT 40.0,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance_session_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        student_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time TEXT NOT NULL,
        confidence REAL DEFAULT 95.0,
        liveness_passed INTEGER DEFAULT 1,
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_session_logs_student ON attendance_session_logs(session_id, student_id)")

    # Migrate students table if photo_url, year, or email columns are missing
    cursor.execute("PRAGMA table_info(students)")
    existing_student_cols = [c[1] for c in cursor.fetchall()]
    if "photo_url" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN photo_url TEXT")
    if "year" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN year TEXT")
    if "email" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN email TEXT")

    # Clean up any duplicate attendance entries before applying UNIQUE constraint
    cursor.execute("""
        DELETE FROM attendance 
        WHERE id NOT IN (
            SELECT MIN(id) FROM attendance GROUP BY student_id, date
        )
    """)

    # Enforce database-level uniqueness on (student_id, date) to prevent duplicate check-ins
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_date ON attendance(student_id, date)")

    # Phase 3: Multiple Embeddings Table per student
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS face_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        embedding BLOB NOT NULL,
        quality_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        capture_condition TEXT DEFAULT 'enrolled',
        FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_face_embeddings_sid ON face_embeddings(student_id)")

    # System configuration & versioned cache tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

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
    
    # ── Database Migration: Migrate legacy students.embedding into face_embeddings ──
    cursor.execute("SELECT COUNT(*) FROM face_embeddings")
    if cursor.fetchone()[0] == 0:
        from datetime import datetime
        now_iso = datetime.now().isoformat()
        cursor.execute("SELECT student_id, embedding FROM students WHERE embedding IS NOT NULL AND student_id != 'admin'")
        legacy_students = cursor.fetchall()
        for sid, emb_blob in legacy_students:
            if not emb_blob:
                continue
            try:
                raw_emb = pickle.loads(emb_blob)
                # Handle single or multi-array stored in legacy blob
                if hasattr(raw_emb, "__len__") and len(raw_emb) > 0:
                    for single_emb in raw_emb:
                        single_blob = pickle.dumps(single_emb)
                        cursor.execute(
                            "INSERT INTO face_embeddings (student_id, embedding, quality_score, created_at, capture_condition) VALUES (?, ?, ?, ?, ?)",
                            (sid, single_blob, 1.0, now_iso, "legacy_migrated")
                        )
                else:
                    cursor.execute(
                        "INSERT INTO face_embeddings (student_id, embedding, quality_score, created_at, capture_condition) VALUES (?, ?, ?, ?, ?)",
                        (sid, emb_blob, 1.0, now_iso, "legacy_migrated")
                    )
            except Exception as e:
                print(f"[WARN/MIGRATION] Could not migrate legacy embedding for {sid}: {e}")

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

    # Seed default attendance session if attendance_sessions table is empty
    cursor.execute("SELECT COUNT(*) FROM attendance_sessions")
    if cursor.fetchone()[0] == 0:
        from datetime import datetime
        now = datetime.now()
        today_date = now.strftime("%Y-%m-%d")
        cursor.execute(
            """INSERT INTO attendance_sessions (title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("Daily Academic Session", today_date, "09:00:00", "13:00:00", 75.0, 40.0, "active", now.isoformat())
        )
        conn.commit()

    conn.close()