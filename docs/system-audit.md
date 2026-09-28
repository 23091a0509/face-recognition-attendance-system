# Face Recognition Attendance System — Comprehensive System Audit

**Audit Date:** 2026-09-28  
**Repository:** [https://github.com/23091a0509/face-recognition-attendance-system](https://github.com/23091a0509/face-recognition-attendance-system)  
**System Type:** Full-Stack Biometric Face Recognition & Attendance Management System  
**Stack:** React 19 + TypeScript (Vite), FastAPI (Python 3.10+), SQLite, PyTorch / facenet-pytorch (MTCNN + InceptionResnetV1), OpenCV, MediaPipe FaceMesh.

---

## 1. Executive Summary

This comprehensive audit was conducted to identify architectural, accuracy, security, performance, and maintenance defects across the entire repository. The system currently possesses strong foundations (lazy ML model loading, FastAPI routing, React 19 UI, JWT auth, and live webcam scanner). However, critical vulnerabilities and quality bottlenecks were discovered in:
- Multi-embedding representation (single vector limitation)
- Ad-hoc thresholds and uncalibrated confidence percentages
- Single-frame attendance marking (lack of temporal verification)
- Open CORS regex and fallback security keys
- Database race conditions (missing unique constraint on `attendance(student_id, date)`)
- Triplicated recognition logic (`backend_api`, `attendance_service`, and `backend/mark_attendance.py`)
- Inconsistent liveness state management

Below is the structured breakdown of findings, categorized by severity, with immediate remediation plans.

---

## 2. Current Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │    Client Browser / Mobile PWA       │
                      │    - Student Portal / Webcam Scanner │
                      │    - Admin Portal / Management Kiosk │
                      └──────────────────┬───────────────────┘
                                         │ HTTPS / JWT
                                         ▼
                      ┌──────────────────────────────────────┐
                      │          FastAPI Backend             │
                      │  - Auth Router (/auth)               │
                      │  - Students Router (/students)       │
                      │  - Attendance Router (/attendance)   │
                      │  - Notifications Router              │
                      └──────────┬─────────────────┬─────────┘
                                 │                 │
                SQL / Migrations │                 │ PyTorch MTCNN + FaceNet
                                 ▼                 ▼
        ┌─────────────────────────────┐   ┌─────────────────────────────┐
        │       SQLite Database       │   │    Local Edge Service       │
        │  - students                 │   │  (attendance_service)       │
        │  - attendance               │   │  - OpenCV Video Capture     │
        │  - notifications            │   │  - MediaPipe Liveness       │
        │  - [NEW] face_embeddings    │   │  - Pickle Cache Sync        │
        └─────────────────────────────┘   └─────────────────────────────┘
```

---

## 3. Detailed Audit Findings by Severity

### 🔴 Critical Severity

| ID | Issue Description | Affected Files | Impact | Recommended Fix |
|:---|:---|:---|:---|:---|
| **SEC-01** | **CORS Wide-Open Regex with Credentials**<br>`allow_origin_regex=r"^https?://.*"` allows any origin to send authenticated cross-site requests. | `backend_api/main.py` | CSRF and unauthorized cross-origin requests. | Restrict CORS to explicit allowed frontend origins (`FRONTEND_URL`, localhost, configured tunnel). |
| **SEC-02** | **Hardcoded Service API Key Fallback**<br>`SERVICE_API_KEY` defaults silently to `"dev-service-api-key"` in both backend and edge client. | `backend_api/routers/auth.py`<br>`attendance_service/config.py` | Any client using the default key gains full admin access if env var is missing. | Raise fatal error in production if `SERVICE_API_KEY` or `JWT_SECRET_KEY` is not provided. |
| **DATA-01** | **No Database Unique Constraint on Attendance**<br>`attendance` table has no `UNIQUE(student_id, date)`. | `backend/database.py` | Race conditions allow duplicate attendance records for the same student on the same day. | Add `UNIQUE(student_id, date)` constraint and indices; catch `sqlite3.IntegrityError` cleanly. |
| **AI-01** | **Single-Frame Attendance Triggering**<br>`/attendance/recognize-frame` marks attendance on a single frame exceeding threshold. | `backend_api/routers/attendance.py` | Accidental false-positive match or brief misidentification logs instant attendance. | Enforce temporal verification: require consecutive valid predictions over a time window ($K \ge 3\text{--}5$ frames). |

---

### 🟠 High Severity

| ID | Issue Description | Affected Files | Impact | Recommended Fix |
|:---|:---|:---|:---|:---|
| **AI-02** | **Single Embedding Bottleneck**<br>Each student is represented by only one 512-d vector. Head angle variations, distance, or lighting shifts cause false rejections. | `backend_api/routers/students.py`<br>`backend/database.py` | High False Rejection Rate (FRR) under varied classroom angles. | Create `face_embeddings` table to store 5–10 quality-checked embeddings per student; compare query vector against student gallery. |
| **AI-03** | **Uncalibrated Ad-Hoc Recognition Thresholds**<br>Thresholds are hardcoded arbitrarily: `0.60` in `mark_attendance.py`, `0.68` in `attendance.py`, `0.75` in `attendance_service`. | `attendance_service/config.py`<br>`backend/mark_attendance.py`<br>`backend_api/routers/attendance.py` | High risk of false matches or rejections without empirical verification. | Implement `tools/calibrate_threshold.py` to evaluate FAR/FRR/F1 across genuine & impostor pairs. |
| **AI-04** | **No Top-1 vs Top-2 Margin Check**<br>System matches if `best_score >= threshold` without checking margin against runner-up. | `attendance_service/face_recognizer.py`<br>`backend/mark_attendance.py` | Two visually similar classmates can be confused. | Implement $(S_1 \ge \theta) \land (S_1 - S_2 \ge \text{margin})$ check. |
| **AI-05** | **Lack of Unknown / Uncertain Classification**<br>Faces are either declared recognized or unrecognized without uncertainty triage. | `backend_api/routers/attendance.py`<br>`attendance_service/face_recognizer.py` | Borderline faces cause flickering or false accepts. | Standardize classification: `KNOWN`, `UNKNOWN`, `UNCERTAIN` with actionable UI prompts. |
| **ARCH-01** | **Triplicated Recognition Implementations**<br>Recognition logic is duplicated across `backend_api`, `attendance_service`, and `backend/mark_attendance.py`. | `backend_api/routers/attendance.py`<br>`attendance_service/face_recognizer.py`<br>`backend/mark_attendance.py` | High maintenance overhead and conflicting behavior. | Unify into canonical package `attendance_service/recognition/` used everywhere. |
| **LIVE-01** | **Persistent Liveness State Leak**<br>`BlinkDetector` sets `self.blinked = True` and never resets if student walks away. | `attendance_service/liveness.py` | Next person walking in front of camera inherits previous blink. | Implement finite state machine with liveness timeout and auto-reset. |

---

### 🟡 Medium Severity

| ID | Issue Description | Affected Files | Impact | Recommended Fix |
|:---|:---|:---|:---|:---|
| **PERF-01** | **Inefficient Pairwise Distance Calculation**<br>`sklearn.metrics.pairwise.cosine_similarity` called in Python loop per student. | `attendance_service/face_recognizer.py` | Frame processing latency on CPU. | Vectorize matching using matrix multiplication `norm_db @ norm_query`. |
| **UX-01** | **Raw Cosine Similarity Presented as "99.8% Confidence"**<br>Cosine similarity multiplied by 100 is presented as statistical probability. | `frontend/src/pages/student/Webcam.tsx`<br>`backend_api/routers/attendance.py` | Misleads students and reviewers regarding mathematical confidence. | Relabel UI to "Match Similarity" and use calibrated scores. |
| **TIME-01** | **Hardcoded Timezone & Cutoff Times**<br>`"09:15"` and `datetime.now()` hardcoded in multiple places. | `backend_api/routers/attendance.py`<br>`frontend/src/pages/admin/Attendance.tsx` | Time drift between UTC servers and local classrooms. | Centralize `TIMEZONE = "Asia/Kolkata"` and `ATTENDANCE_LATE_AFTER = "09:15"`. |
| **CACHE-01**| **Unversioned Pickle Cache Synchronization**<br>`students_cache.pkl` relies on file modification timestamp polling. | `attendance_service/main.py`<br>`backend_api/routers/students.py` | Unreliable cross-process synchronization. | Introduce monotonic cache versioning in database. |
| **PRIV-01** | **Public Raw Biometric Vector Endpoint**<br>`GET /students/{id}/embedding` returns raw 512-float vector. | `backend_api/routers/students.py` | Biometric exposure risk. | Restrict to admin/service role; never expose to public or frontend. |

---

### 🟢 Low Severity

| ID | Issue Description | Affected Files | Impact | Recommended Fix |
|:---|:---|:---|:---|:---|
| **DOC-01** | **Outdated & Inaccurate README**<br>Contains third-party developer info, broken links, machine-specific paths. | `README.md` | Unprofessional presentation. | Rewrite README with complete setup, architecture, and evaluation instructions. |
| **DOC-02** | **Stale Bug Reports in `docs/`**<br>`docs/current-bugs.md` contains historical notes describing already-patched issues. | `docs/` | Misleads users and developers. | Archive or replace with current architecture and security specifications. |

---

## 4. Remediation Roadmap

The 40 phases requested in the project brief will be executed in systematic stages:
1. **Database & Migration Foundation:** Enforce `UNIQUE(student_id, date)` and create `face_embeddings` table with backward compatibility.
2. **Canonical Recognition Engine:** Build modular `attendance_service/recognition/` (detector, embedder, matcher, quality, temporal, liveness state machine).
3. **Face Enrollment Quality Pipeline:** Guided multi-sample capture with blur, brightness, pose, size, and landmark verification.
4. **Calibration & Evaluation Tools:** Create `tools/calibrate_threshold.py` and `tools/evaluate_recognition.py`.
5. **Security, CORS & Timezone Hardening:** Restrict origins, remove default keys, define Indian classroom timezone policy.
6. **Frontend UX & Camera Modernization:** Multi-state guidance, throttling, match similarity display, no false confidence claims.
7. **Comprehensive Automated Tests & Documentation:** Pytest test suite, full documentation suite in `docs/`, and CI workflow.
