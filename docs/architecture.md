# System Architecture & Technical Specifications

## 1. High-Level Architecture

The **Face Recognition Attendance System** is an enterprise-grade full-stack biometric management platform designed for universities, schools, and corporate institutions. It bridges real-time facial feature extraction at 512 dimensions with role-based access control, automated timekeeping policies, and anti-proxy enforcement.

```mermaid
flowchart TD
    ClientBrowser["Client Browser (React 19 + TypeScript + Tailwind)"]
    KioskCamera["Kiosk / Edge Camera Service (OpenCV + MediaPipe)"]

    subgraph API_Gateway ["FastAPI Application Gateway (:8000)"]
        AuthRouter["/auth (JWT Authentication & RBAC)"]
        AttendanceRouter["/attendance (Real-Time Biometric Verification)"]
        StudentsRouter["/students (Multi-Sample Enrollment & Gallery)"]
        NotifRouter["/notifications (In-App Attendance Alerts)"]
    end

    subgraph AI_Core ["Canonical Recognition Engine"]
        FaceDetector["FaceDetector (MTCNN PyTorch)"]
        FaceEmbedder["FaceEmbedder (InceptionResnetV1)"]
        FaceQualityChecker["FaceQualityChecker (Variance / Luminance / Centering)"]
        FaceMatcher["FaceMatcher (Top-1/Top-2 Margin + L2 Cosine)"]
        TemporalVerifier["TemporalVerifier (K=3 Consecutive Matches)"]
        LivenessDetector["LivenessStateMachine (MediaPipe EAR)"]
    end

    subgraph Storage ["Persistent Data Layer"]
        SQLiteDB[("SQLite Database (attendance.db)")]
        TableStudents["students (Profiles & Passwords)"]
        TableEmbeddings["face_embeddings (512-dim Normalized Vectors)"]
        TableAttendance["attendance (Unique (student_id, date))"]
        TableConfig["system_config (Thresholds & Policies)"]
    end

    ClientBrowser -->|HTTP / REST + Bearer JWT| API_Gateway
    KioskCamera -->|HTTP / X-API-KEY| API_Gateway
    AttendanceRouter --> AI_Core
    StudentsRouter --> AI_Core
    API_Gateway --> Storage
    Storage --- TableStudents
    Storage --- TableEmbeddings
    Storage --- TableAttendance
    Storage --- TableConfig
```

---

## 2. Component Breakdown

### Frontend (React 19 + TypeScript + Vite)
- **Role-Based Routing**: Strict client-side guards separate the `/admin` portal (management dashboard, reports, CSV exports, student registration) from `/student` (personal attendance camera scanner, history, stats, profile).
- **Video Capture Subsystem**: HTML5 `MediaDevices.getUserMedia` stream with camera flip (front/rear), client-side aspect-ratio canvas scaling (480p), and visual bounding box overlays.
- **Telemetry UI**: Displays real-time live match similarity, sensor lock status, and actionable positioning prompts (e.g. lighting too dark, move closer).

### Backend API (FastAPI)
- **Asynchronous Execution**: High-throughput FastAPI endpoints with Pydantic request/response schema validation.
- **Institutional Timezone Engine**: Centralized time computation adhering strictly to `UTC+05:30` (Indian Standard Time - IST), preventing server timezone drift from marking students incorrectly.
- **Race Condition Prevention**: Database transactions wrap biometric attendance insertion in `try ... except sqlite3.IntegrityError`, guaranteeing idempotency during high-frequency concurrent classroom scans.

### Standalone Edge Attendance Service (`attendance_service/`)
- Designed for dedicated classroom kiosks or edge Raspberry Pi / Jetson devices.
- Uses dynamic cache polling (`students_cache.pkl`) with auto-reloading upon remote enrollment updates.
- Integrated MediaPipe Eye Aspect Ratio (EAR) blink detection prevents photographic proxy spoofing.

---

## 3. Database Schema

All database connections enforce `PRAGMA foreign_keys = ON;`.

```mermaid
erDiagram
    students ||--o{ face_embeddings : "owns"
    students ||--o{ attendance : "has"
    students ||--o{ notifications : "receives"

    students {
        INTEGER id PK
        TEXT student_id UK
        TEXT name
        TEXT department
        TEXT password
        BLOB embedding
    }

    face_embeddings {
        INTEGER id PK
        TEXT student_id FK
        BLOB embedding
        REAL quality_score
        TEXT created_at
        TEXT capture_condition
    }

    attendance {
        INTEGER id PK
        TEXT student_id FK
        TEXT date
        TEXT time
        TEXT method
        REAL confidence
        INTEGER liveness_passed
    }

    notifications {
        INTEGER id PK
        TEXT student_id FK
        TEXT title
        TEXT message
        TEXT type
        TEXT severity
        INTEGER is_read
        TEXT created_at
    }
```

### Key Constraints & Indexes
1. `uq_attendance_student_date`: `CREATE UNIQUE INDEX uq_attendance_student_date ON attendance(student_id, date);`
   - Guarantees at the database engine level that no student can have duplicate attendance records on any single calendar date.
2. `idx_face_embeddings_sid`: `CREATE INDEX idx_face_embeddings_sid ON face_embeddings(student_id);`
   - Accelerates multi-sample biometric gallery loading during startup and kiosk cache refreshes.
