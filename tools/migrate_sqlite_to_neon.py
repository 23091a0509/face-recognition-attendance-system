"""
Migrate all data from local SQLite database to Neon PostgreSQL database.
"""

import os
import sys
import sqlite3
import psycopg2
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQLITE_PATH = os.path.join(BASE_DIR, "database", "attendance.db")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("[ERROR] DATABASE_URL is not set in environment or .env file.")
    sys.exit(1)

def migrate():
    print(f"[1/4] Connecting to SQLite: {SQLITE_PATH}")
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()

    print("[2/4] Connecting to Neon PostgreSQL...")
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_cur = pg_conn.cursor()

    print("[3/4] Migrating data...")

    # 1. system_config
    sqlite_cur.execute("SELECT key, value, updated_at FROM system_config")
    configs = sqlite_cur.fetchall()
    for key, val, upd in configs:
        pg_cur.execute("""
            INSERT INTO system_config (key, value, updated_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        """, (key, val, upd))
    print(f"  -> Migrated {len(configs)} system_config rows")

    # 2. students
    sqlite_cur.execute("SELECT student_id, name, department, password, embedding, photo_url, year, email FROM students")
    students = sqlite_cur.fetchall()
    for sid, name, dept, pwd, emb, photo, year, email in students:
        emb_bin = psycopg2.Binary(emb) if emb else None
        pg_cur.execute("""
            INSERT INTO students (student_id, name, department, password, embedding, photo_url, year, email)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (student_id) DO UPDATE SET
                name = EXCLUDED.name,
                department = EXCLUDED.department,
                password = EXCLUDED.password,
                embedding = EXCLUDED.embedding,
                photo_url = EXCLUDED.photo_url,
                year = EXCLUDED.year,
                email = EXCLUDED.email
        """, (sid, name, dept, pwd, emb_bin, photo, year, email))
    print(f"  -> Migrated {len(students)} students")

    # 3. attendance_sessions
    sqlite_cur.execute("SELECT id, title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at FROM attendance_sessions")
    sessions = sqlite_cur.fetchall()
    for row in sessions:
        pg_cur.execute("""
            INSERT INTO attendance_sessions (id, title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, row)
    print(f"  -> Migrated {len(sessions)} attendance sessions")

    # 4. attendance
    sqlite_cur.execute("""
        SELECT student_id, date, time, method, confidence, liveness_passed, status, session_id, minutes_attended, reason
        FROM attendance
    """)
    attendance_rows = sqlite_cur.fetchall()
    for row in attendance_rows:
        pg_cur.execute("""
            INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status, session_id, minutes_attended, reason)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (student_id, date) DO UPDATE SET
                time = EXCLUDED.time,
                method = EXCLUDED.method,
                confidence = EXCLUDED.confidence,
                liveness_passed = EXCLUDED.liveness_passed,
                status = EXCLUDED.status,
                session_id = EXCLUDED.session_id,
                minutes_attended = EXCLUDED.minutes_attended,
                reason = EXCLUDED.reason
        """, row)
    print(f"  -> Migrated {len(attendance_rows)} attendance records")

    # 5. face_embeddings
    sqlite_cur.execute("SELECT student_id, embedding, quality_score, created_at, capture_condition FROM face_embeddings")
    embeddings = sqlite_cur.fetchall()
    for sid, emb, q_score, cr_at, cond in embeddings:
        emb_bin = psycopg2.Binary(emb) if emb else None
        pg_cur.execute("""
            INSERT INTO face_embeddings (student_id, embedding, quality_score, created_at, capture_condition)
            VALUES (%s, %s, %s, %s, %s)
        """, (sid, emb_bin, q_score, cr_at, cond))
    print(f"  -> Migrated {len(embeddings)} face embedding samples")

    # 6. notifications
    sqlite_cur.execute("SELECT student_id, title, message, type, severity, is_read, created_at, action_url, metadata FROM notifications")
    notifs = sqlite_cur.fetchall()
    for row in notifs:
        pg_cur.execute("""
            INSERT INTO notifications (student_id, title, message, type, severity, is_read, created_at, action_url, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, row)
    print(f"  -> Migrated {len(notifs)} notifications")

    # Reset sequences for all SERIAL tables so future INSERTs don't collide
    for t in ['students', 'attendance', 'attendance_sessions', 'attendance_session_logs', 'face_embeddings', 'notifications']:
        try:
            pg_cur.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), COALESCE((SELECT MAX(id) FROM {t}), 1), true);")
        except Exception:
            pass

    pg_conn.commit()
    sqlite_conn.close()
    pg_conn.close()

    print("[4/4] Migration complete! All data and sequences successfully transferred to Neon.")

if __name__ == "__main__":
    migrate()
