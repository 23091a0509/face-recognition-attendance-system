import os
import re
import sqlite3
import pickle
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("database")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("DATABASE_PATH") or os.path.join(BASE_DIR, 'database', 'attendance.db')
DATABASE_URL = os.getenv("DATABASE_URL")

try:
    import psycopg2
    import psycopg2.extras
    HAVE_PSYCOPG2 = True
except ImportError:
    HAVE_PSYCOPG2 = False


class PostgresCursorWrapper:
    """Wraps a psycopg2 cursor to provide an interface compatible with sqlite3."""
    def __init__(self, pg_cursor, pg_conn=None):
        self._cur = pg_cursor
        self._conn = pg_conn
        self.lastrowid = None
        self._mock_rows = None
        self._mock_idx = 0

    @property
    def description(self):
        return self._cur.description

    @property
    def rowcount(self):
        return self._cur.rowcount

    def execute(self, query, params=None):
        adapted_sql = query

        # Intercept SQLite PRAGMA statements (e.g. PRAGMA foreign_keys)
        if re.search(r'^\s*PRAGMA\s+foreign_keys', adapted_sql, re.IGNORECASE):
            self._mock_rows = [(1,)]
            self._mock_idx = 0
            return self

        self._mock_rows = None
        self._mock_idx = 0

        # 1. Translate SQLite 'INSERT OR IGNORE INTO' to Postgres 'INSERT INTO ... ON CONFLICT DO NOTHING'
        if re.search(r'^\s*INSERT\s+OR\s+IGNORE\s+INTO', adapted_sql, re.IGNORECASE):
            adapted_sql = re.sub(r'^\s*INSERT\s+OR\s+IGNORE\s+INTO', 'INSERT INTO', adapted_sql, flags=re.IGNORECASE)
            if 'ON CONFLICT' not in adapted_sql.upper():
                adapted_sql += ' ON CONFLICT DO NOTHING'

        # 2. Capture auto-generated ID for tables where cursor.lastrowid is needed
        capture_lastrowid = False
        if re.search(r'^\s*INSERT\s+INTO\s+attendance_sessions', adapted_sql, re.IGNORECASE) and 'RETURNING' not in adapted_sql.upper():
            adapted_sql += ' RETURNING id'
            capture_lastrowid = True

        # 3. Translate ? parameter placeholders to %s
        adapted_sql = re.sub(r'\?', '%s', adapted_sql)

        # 4. Execute query with IntegrityError mapping
        try:
            if params is not None:
                self._cur.execute(adapted_sql, params)
            else:
                self._cur.execute(adapted_sql)

            if capture_lastrowid:
                res = self._cur.fetchone()
                self.lastrowid = res[0] if res else None
        except psycopg2.IntegrityError as e:
            if self._conn:
                try:
                    self._conn.rollback()
                except Exception:
                    pass
            raise sqlite3.IntegrityError(str(e)) from e

        return self

    def executemany(self, query, seq_of_params):
        adapted_sql = re.sub(r'\?', '%s', query)
        try:
            return self._cur.executemany(adapted_sql, seq_of_params)
        except psycopg2.IntegrityError as e:
            if self._conn:
                try:
                    self._conn.rollback()
                except Exception:
                    pass
            raise sqlite3.IntegrityError(str(e)) from e

    def fetchone(self):
        if self._mock_rows is not None:
            if self._mock_idx < len(self._mock_rows):
                row = self._mock_rows[self._mock_idx]
                self._mock_idx += 1
                return row
            return None
        return self._cur.fetchone()

    def fetchall(self):
        if self._mock_rows is not None:
            remaining = self._mock_rows[self._mock_idx:]
            self._mock_idx = len(self._mock_rows)
            return remaining
        return self._cur.fetchall()

    def fetchmany(self, size=None):
        return self._cur.fetchmany(size) if size else self._cur.fetchmany()

    def close(self):
        self._cur.close()

    def __iter__(self):
        return iter(self._cur)


class PostgresConnectionWrapper:
    """Wraps a psycopg2 connection to provide an interface compatible with sqlite3."""
    def __init__(self, dsn):
        self._conn = psycopg2.connect(dsn)

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor(), self._conn)

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def is_postgres() -> bool:
    """Returns True if DATABASE_URL points to a PostgreSQL database."""
    return bool(DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://")) and HAVE_PSYCOPG2)


def get_connection():
    """Returns a database connection: Postgres (Neon) if DATABASE_URL is set, else SQLite."""
    if is_postgres():
        return PostgresConnectionWrapper(DATABASE_URL)

    # SQLite fallback with WAL & high-concurrency PRAGMAs
    db_dir = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA cache_size = -64000")
    conn.execute("PRAGMA temp_store = MEMORY")
    return conn


def create_tables():
    """Initializes tables, indexes, and initial seeds for the configured database."""
    conn = get_connection()
    cursor = conn.cursor()

    if is_postgres():
        logger.info("Initializing Neon PostgreSQL database schema...")
        pg_ddl = [
            """CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                department VARCHAR(255),
                password VARCHAR(255) NOT NULL,
                embedding BYTEA,
                photo_url TEXT,
                year VARCHAR(50),
                email VARCHAR(255)
            )""",
            """CREATE TABLE IF NOT EXISTS attendance_sessions (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                date VARCHAR(50) NOT NULL,
                start_time VARCHAR(50) NOT NULL,
                end_time VARCHAR(50) NOT NULL,
                full_day_threshold REAL DEFAULT 75.0,
                half_day_threshold REAL DEFAULT 40.0,
                status VARCHAR(50) DEFAULT 'active',
                created_at VARCHAR(100) NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS attendance_session_logs (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
                student_id VARCHAR(100) NOT NULL,
                timestamp VARCHAR(50) NOT NULL,
                time VARCHAR(50) NOT NULL,
                confidence REAL DEFAULT 95.0,
                liveness_passed INTEGER DEFAULT 1
            )""",
            "CREATE INDEX IF NOT EXISTS idx_session_logs_student ON attendance_session_logs(session_id, student_id)",
            """CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(100) NOT NULL,
                date VARCHAR(50) NOT NULL,
                time VARCHAR(50) NOT NULL,
                method VARCHAR(50) DEFAULT 'manual',
                confidence REAL DEFAULT 0.0,
                liveness_passed INTEGER DEFAULT 0,
                status VARCHAR(50) DEFAULT 'Present',
                session_id INTEGER,
                minutes_attended INTEGER DEFAULT 0,
                reason TEXT,
                CONSTRAINT uq_attendance_student_date UNIQUE (student_id, date)
            )""",
            "CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)",
            """CREATE TABLE IF NOT EXISTS face_embeddings (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(100) NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
                embedding BYTEA NOT NULL,
                quality_score REAL DEFAULT 1.0,
                created_at VARCHAR(100) NOT NULL,
                capture_condition VARCHAR(100) DEFAULT 'enrolled'
            )""",
            "CREATE INDEX IF NOT EXISTS idx_face_embeddings_sid ON face_embeddings(student_id)",
            """CREATE TABLE IF NOT EXISTS system_config (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at VARCHAR(100) NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(100),
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(100) NOT NULL,
                severity VARCHAR(50) DEFAULT 'info',
                is_read INTEGER DEFAULT 0,
                created_at VARCHAR(100) NOT NULL,
                action_url TEXT,
                metadata TEXT
            )""",
            "CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)",
        ]
        for stmt in pg_ddl:
            cursor.execute(stmt)
        conn.commit()

        # Reset sequences for serial tables
        for t in ['students', 'attendance', 'attendance_sessions', 'attendance_session_logs', 'face_embeddings', 'notifications']:
            try:
                cursor.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), COALESCE((SELECT MAX(id) FROM {t}), 1), true);")
            except Exception:
                pass
        conn.commit()

        # Seed default configurations if empty
        from datetime import datetime
        now_iso = datetime.now().isoformat()
        default_configs = [
            ("ip_restriction_enabled", "false"),
            ("allowed_ips", "127.0.0.1, ::1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"),
            ("face_threshold", "0.75"),
            ("min_margin", "0.08"),
            ("duplicate_protection", "true"),
            ("duplicate_window_minutes", "5"),
            ("late_after_time", "09:15"),
        ]
        for cfg_key, cfg_val in default_configs:
            cursor.execute(
                "INSERT INTO system_config (key, value, updated_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (cfg_key, cfg_val, now_iso)
            )
        conn.commit()

        # Seed default admin user if empty
        cursor.execute("SELECT COUNT(*) FROM students")
        if cursor.fetchone()[0] == 0:
            import bcrypt
            def _quick_hash(pwd: str) -> str:
                return bcrypt.hashpw(pwd.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")
            cursor.execute(
                "INSERT INTO students (student_id, name, department, password) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                ("admin", "Admin User", "Administration", _quick_hash("admin123"))
            )
            conn.commit()

        conn.close()
        logger.info("Neon PostgreSQL tables and configurations initialized successfully.")
        return

    # SQLite execution branch
    logger.info("Initializing SQLite database schema...")
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
                logger.warning("Could not migrate legacy embedding for %s: %s", sid, e)

    conn.commit()

    # Seed default credentials if database is empty
    cursor.execute("SELECT COUNT(*) FROM students")
    count = cursor.fetchone()[0]
    if count == 0:
        import bcrypt
        def _quick_hash(pwd: str) -> str:
            return bcrypt.hashpw(pwd.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")
        
        default_users = [
            ("admin", "Admin User", "Administration", _quick_hash("admin123")),
            ("CS001", "Test Student - Akif", "Computer Science", _quick_hash("password123")),
            ("CS008", "Ahmad", "Computer Science", _quick_hash("AhmadCS008")),
        ]
        cursor.executemany(
            "INSERT INTO students (student_id, name, department, password) VALUES (?, ?, ?, ?)",
            default_users
        )
        conn.commit()

    # Seed default system configurations if not present
    from datetime import datetime
    now_iso = datetime.now().isoformat()
    default_configs = [
        ("ip_restriction_enabled", "false"),
        ("allowed_ips", "127.0.0.1, ::1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"),
        ("face_threshold", "0.75"),
        ("min_margin", "0.08"),
        ("duplicate_protection", "true"),
        ("duplicate_window_minutes", "5"),
        ("late_after_time", "09:15"),
    ]
    for cfg_key, cfg_val in default_configs:
        cursor.execute(
            "INSERT OR IGNORE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)",
            (cfg_key, cfg_val, now_iso)
        )
    conn.commit()

    conn.close()


def get_system_config(key: str, default: str = None) -> str:
    """Reads a configuration setting from system_config table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_config WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    if row is not None:
        return row[0]
    return default


def set_system_config(key: str, value: str) -> None:
    """Upserts a configuration setting into system_config table."""
    from datetime import datetime
    now_iso = datetime.now().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO system_config (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, (key, str(value), now_iso))
    conn.commit()
    conn.close()