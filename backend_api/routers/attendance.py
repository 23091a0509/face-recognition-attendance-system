import sqlite3
import logging
from fastapi import APIRouter, HTTPException, Depends
from datetime import date, datetime, timedelta

logger = logging.getLogger(__name__)
from typing import Optional, List, Dict, Any
import base64
import numpy as np
from io import BytesIO
from PIL import Image
import pickle
from pydantic import BaseModel, Field
from backend.database import get_connection
from .auth import require_admin, get_current_user
from backend_api.routers.notifications import create_notification
from backend_api.config import (
    get_today_date_str,
    get_time_str,
    is_attendance_late,
    ATTENDANCE_LATE_AFTER,
    FACE_RECOGNITION_THRESHOLD,
    MIN_MATCH_MARGIN
)
from attendance_service.recognition import FaceQualityChecker, FaceMatcher, normalize_embedding, TemporalVerifier
from backend_api.routers.admin import verify_campus_ip

frame_verifier = TemporalVerifier(required_consistent_frames=3, max_interval_seconds=3.0, time_window_seconds=10.0)

router = APIRouter(
    prefix="/attendance",
    tags=["attendance"]
)

# ---------------------------------------------------------------------------
# Attendance Session Models & Time Parsing Utilities
# ---------------------------------------------------------------------------
class CreateSessionRequest(BaseModel):
    title: str = Field(default="Morning Core Session", min_length=2)
    start_time: str = Field(default="09:00:00")
    end_time: str = Field(default="13:00:00")
    date: Optional[str] = None
    full_day_threshold: float = Field(default=75.0, ge=10.0, le=100.0)
    half_day_threshold: float = Field(default=40.0, ge=5.0, le=100.0)

class SessionHeartbeatRequest(BaseModel):
    confidence: Optional[float] = 98.0
    liveness_passed: Optional[bool] = True

def parse_time_to_24h(time_str: str) -> str:
    """Parses 12h or 24h formatted time string into standard HH:MM:SS."""
    time_str = str(time_str).strip()
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p", "%I:%M:%S %p", "%I:%M:%S%p"):
        try:
            dt = datetime.strptime(time_str, fmt)
            return dt.strftime("%H:%M:%S")
        except ValueError:
            pass
    return time_str

def evaluate_student_attendance(session: dict, logs: list) -> dict:
    """
    Evaluates student attendance according to transparent duration & halves logic:
    1. Present for full session (>=75% or present in both halves) -> Full Day
    2. Present only during first half / leaves before threshold (40% - 74%) -> Half Day
    3. Never recognized or <40% -> Absent
    """
    session_date = session.get("date") or get_today_date_str()
    start_str = parse_time_to_24h(session.get("start_time", "09:00:00"))
    end_str = parse_time_to_24h(session.get("end_time", "13:00:00"))

    try:
        start_dt = datetime.strptime(f"{session_date} {start_str}", "%Y-%m-%d %H:%M:%S")
        end_dt = datetime.strptime(f"{session_date} {end_str}", "%Y-%m-%d %H:%M:%S")
    except Exception:
        start_dt = datetime.strptime(f"{session_date} 09:00:00", "%Y-%m-%d %H:%M:%S")
        end_dt = datetime.strptime(f"{session_date} 13:00:00", "%Y-%m-%d %H:%M:%S")

    if end_dt <= start_dt:
        end_dt += timedelta(days=1)

    total_minutes = max(1, int((end_dt - start_dt).total_seconds() / 60))
    mid_dt = start_dt + timedelta(minutes=total_minutes / 2)

    if not logs:
        return {
            "status": "Absent",
            "minutes_attended": 0,
            "total_minutes": total_minutes,
            "attendance_percentage": 0.0,
            "reason": "Never recognized during session",
            "halves_attended": {"first_half": False, "second_half": False},
            "first_seen": None,
            "last_seen": None
        }

    parsed_dts = []
    for l in logs:
        t_val = l.get("timestamp") or l.get("time") if isinstance(l, dict) else str(l)
        try:
            if "T" in t_val:
                p_dt = datetime.fromisoformat(t_val)
            elif " " in t_val:
                p_dt = datetime.strptime(t_val[:19], "%Y-%m-%d %H:%M:%S")
            else:
                p_dt = datetime.strptime(f"{session_date} {parse_time_to_24h(t_val)}", "%Y-%m-%d %H:%M:%S")
            parsed_dts.append(p_dt)
        except Exception:
            pass

    if not parsed_dts:
        return {
            "status": "Absent",
            "minutes_attended": 0,
            "total_minutes": total_minutes,
            "attendance_percentage": 0.0,
            "reason": "No valid verification timestamps found",
            "halves_attended": {"first_half": False, "second_half": False},
            "first_seen": None,
            "last_seen": None
        }

    parsed_dts.sort()
    first_dt = parsed_dts[0]
    last_dt = parsed_dts[-1]

    # Half session presence checks
    has_first_half = any(start_dt - timedelta(minutes=15) <= dt < mid_dt for dt in parsed_dts)
    has_second_half = any(mid_dt <= dt <= end_dt + timedelta(minutes=15) for dt in parsed_dts)

    # Active presence span
    span_seconds = max(0, (last_dt - first_dt).total_seconds())
    span_mins = int(span_seconds / 60)
    minutes_attended = min(total_minutes, max(1, span_mins))
    percentage = round((minutes_attended / total_minutes) * 100, 1)

    full_thresh = float(session.get("full_day_threshold", 75.0))
    half_thresh = float(session.get("half_day_threshold", 40.0))

    if percentage < half_thresh:
        status = "Absent"
        reason = f"Leaves before required threshold ({percentage}% < {half_thresh}% minimum threshold, {minutes_attended}m attended)"
    elif (has_first_half and has_second_half and percentage >= 50.0) or (percentage >= full_thresh):
        status = "Full Day"
        reason = f"Present for full session ({percentage}% duration, verified across session)"
    elif has_first_half and not has_second_half:
        status = "Half Day"
        reason = f"Present only during first half ({minutes_attended} of {total_minutes} mins attended)"
    elif not has_first_half and has_second_half:
        status = "Half Day"
        reason = f"Present only during second half ({minutes_attended} of {total_minutes} mins attended)"
    elif percentage >= half_thresh:
        status = "Half Day"
        reason = f"Leaves before full day threshold ({percentage}% duration attended, {full_thresh}% required for Full Day)"
    else:
        status = "Absent"
        reason = f"Insufficient attendance duration ({percentage}% < {half_thresh}% minimum threshold)"

    return {
        "status": status,
        "minutes_attended": minutes_attended,
        "total_minutes": total_minutes,
        "attendance_percentage": percentage,
        "reason": reason,
        "halves_attended": {"first_half": has_first_half, "second_half": has_second_half},
        "first_seen": first_dt.strftime("%H:%M:%S"),
        "last_seen": last_dt.strftime("%H:%M:%S")
    }

# ----------------------------
# Get today's attendance
# ----------------------------
# ----------------------------
# Get today's attendance
# ----------------------------
@router.get("/today")
def today_attendance(admin_user: dict = Depends(require_admin)):
    today = get_today_date_str()

    conn = get_connection()
    cursor = conn.cursor()

    # Get all students (exclude admin account)
    cursor.execute("""
        SELECT student_id, name, department 
        FROM students 
        WHERE student_id != 'admin'
        ORDER BY student_id ASC
    """)
    all_students = cursor.fetchall()

    # Get today's attendance logs with status and duration
    cursor.execute("""
        SELECT student_id, time, status, minutes_attended, reason, confidence, method
        FROM attendance 
        WHERE date = ?
    """, (today,))
    att_rows = cursor.fetchall()
    att_map = {
        r[0]: {
            "time": r[1],
            "status": r[2] or "Present",
            "minutes_attended": r[3] or 0,
            "reason": r[4] or "",
            "confidence": r[5] or 98.0,
            "method": r[6] or "Face AI"
        }
        for r in att_rows
    }
    conn.close()

    records = []
    total_present = 0
    total_full_day = 0
    total_half_day = 0
    total_late = 0
    total_absent = 0

    for s in all_students:
        sid, name, dept = s[0], s[1], s[2]
        if sid in att_map:
            att_info = att_map[sid]
            time_str = att_info["time"]
            rec_status = att_info["status"]
            is_late = is_attendance_late(time_str)

            if rec_status in ["Half Day", "half_day"]:
                status = "Half Day"
                total_half_day += 1
                total_present += 1
            elif rec_status in ["Full Day", "full_day"]:
                status = "Full Day"
                total_full_day += 1
                total_present += 1
            elif is_late:
                status = "Late"
                total_late += 1
                total_present += 1
            else:
                status = rec_status or "Present"
                total_present += 1

            records.append({
                "student_id": sid,
                "name": name,
                "department": dept,
                "time": time_str,
                "status": status,
                "minutes_attended": att_info["minutes_attended"],
                "reason": att_info["reason"],
                "confidence": att_info["confidence"],
                "method": att_info["method"]
            })
        else:
            total_absent += 1
            records.append({
                "student_id": sid,
                "name": name,
                "department": dept,
                "time": "--:--",
                "status": "Absent",
                "minutes_attended": 0,
                "reason": "Never recognized during session",
                "confidence": 0.0,
                "method": "-"
            })

    # Sort records: Present & Late first by time desc, then Absent
    records.sort(key=lambda x: (0 if x["status"] in ["Full Day", "Half Day", "Present", "Late"] else 1, x["student_id"]))

    return {
        "date": today,
        "total_students": len(all_students),
        "total_present": total_present,
        "total_full_day": total_full_day,
        "total_half_day": total_half_day,
        "total_absent": total_absent,
        "total_late": total_late,
        "records": records
    }


@router.get("/history")
def get_attendance_history(admin_user: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.student_id, a.date, a.time, COALESCE(s.name, a.student_id), COALESCE(s.department, 'General'),
               a.status, a.minutes_attended, a.reason, a.confidence, a.method
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.student_id
        ORDER BY a.date DESC, a.time DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    records = []
    for r in rows:
        time_str = r[2]
        rec_status = r[5]
        status = rec_status if rec_status in ["Full Day", "Half Day", "Absent"] else ("Late" if is_attendance_late(time_str) else "Present")

        records.append({
            "student_id": r[0],
            "date": r[1],
            "time": r[2],
            "name": r[3],
            "department": r[4],
            "status": status,
            "minutes_attended": r[6] or 0,
            "reason": r[7] or "",
            "confidence": r[8] or 98.0,
            "method": r[9] or "Face AI"
        })

    return records


# ----------------------------
# Get FULL attendance records of a student (Includes Half Day & Full Day Status)
# ----------------------------
@router.get("/student/{student_id}/records")
def student_attendance_records(student_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin" and current_user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own records")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT date, time, status, minutes_attended, reason, confidence, method FROM attendance WHERE student_id = ? ORDER BY date DESC",
        (student_id,)
    )

    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "date": r[0],
            "time": r[1],
            "status": r[2] or "Present",
            "minutes_attended": r[3] or 0,
            "reason": r[4] or "",
            "confidence": r[5] or 98.0,
            "method": r[6] or "Face AI"
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Attendance Session Endpoints (User Request: Active Session & Rules)
# ---------------------------------------------------------------------------
@router.get("/session/current")
def get_current_session(current_user: dict = Depends(get_current_user)):
    today = get_today_date_str()
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at
        FROM attendance_sessions
        WHERE date = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
    """, (today,))
    row = cursor.fetchone()

    # If no active session for today, check latest or auto-create default
    if not row:
        cursor.execute("""
            SELECT id, title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at
            FROM attendance_sessions
            ORDER BY id DESC LIMIT 1
        """)
        row = cursor.fetchone()

    if not row:
        now_dt = datetime.now()
        cursor.execute(
            """INSERT INTO attendance_sessions (title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at)
               VALUES (?, ?, '09:00:00', '13:00:00', 75.0, 40.0, 'active', ?)""",
            ("Daily Academic Session", today, now_dt.isoformat())
        )
        conn.commit()
        session_id = cursor.lastrowid
        session_dict = {
            "id": session_id,
            "title": "Daily Academic Session",
            "date": today,
            "start_time": "09:00:00",
            "end_time": "13:00:00",
            "full_day_threshold": 75.0,
            "half_day_threshold": 40.0,
            "status": "active"
        }
    else:
        session_dict = {
            "id": row[0],
            "title": row[1],
            "date": row[2],
            "start_time": row[3],
            "end_time": row[4],
            "full_day_threshold": row[5],
            "half_day_threshold": row[6],
            "status": row[7]
        }

    now_dt = datetime.now()
    s_date = session_dict["date"]
    end_t = parse_time_to_24h(session_dict["end_time"])
    try:
        session_end_dt = datetime.strptime(f"{s_date} {end_t}", "%Y-%m-%d %H:%M:%S")
    except Exception:
        session_end_dt = datetime.strptime(f"{today} 13:00:00", "%Y-%m-%d %H:%M:%S")

    remaining_secs = max(0, int((session_end_dt - now_dt).total_seconds()))
    is_ended = (remaining_secs <= 0 or session_dict["status"] == "ended")

    session_dict["seconds_remaining"] = remaining_secs
    session_dict["is_ended"] = is_ended

    student_id = current_user.get("student_id")
    student_status = None
    if student_id and student_id != "admin":
        cursor.execute("""
            SELECT timestamp, time, confidence, liveness_passed
            FROM attendance_session_logs
            WHERE session_id = ? AND student_id = ?
            ORDER BY id ASC
        """, (session_dict["id"], student_id))
        log_rows = cursor.fetchall()
        logs = [{"timestamp": lr[0], "time": lr[1], "confidence": lr[2]} for lr in log_rows]
        student_status = evaluate_student_attendance(session_dict, logs)

        cursor.execute("SELECT status, minutes_attended, reason FROM attendance WHERE student_id = ? AND date = ?", (student_id, session_dict["date"]))
        att_row = cursor.fetchone()
        if att_row:
            student_status["final_recorded_status"] = att_row[0]
            student_status["is_recorded"] = True
        else:
            student_status["final_recorded_status"] = None
            student_status["is_recorded"] = False

    conn.close()
    return {
        "session": session_dict,
        "student_status": student_status,
        "now": now_dt.strftime("%H:%M:%S")
    }


@router.post("/session/create")
def create_session(data: CreateSessionRequest, admin_user: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor()

    s_date = data.date or get_today_date_str()
    start_t = parse_time_to_24h(data.start_time)
    end_t = parse_time_to_24h(data.end_time)

    cursor.execute("UPDATE attendance_sessions SET status = 'ended' WHERE date = ? AND status = 'active'", (s_date,))

    cursor.execute("""
        INSERT INTO attendance_sessions (title, date, start_time, end_time, full_day_threshold, half_day_threshold, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    """, (data.title, s_date, start_t, end_t, data.full_day_threshold, data.half_day_threshold, datetime.now().isoformat()))

    session_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "message": "Attendance session created and activated successfully",
        "session_id": session_id,
        "title": data.title,
        "date": s_date,
        "start_time": start_t,
        "end_time": end_t
    }


@router.post("/session/{session_id}/end")
def end_session(session_id: int, admin_user: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, title, date, start_time, end_time, full_day_threshold, half_day_threshold FROM attendance_sessions WHERE id = ?", (session_id,))
    s_row = cursor.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")

    session_dict = {
        "id": s_row[0], "title": s_row[1], "date": s_row[2],
        "start_time": s_row[3], "end_time": s_row[4],
        "full_day_threshold": s_row[5], "half_day_threshold": s_row[6]
    }

    cursor.execute("UPDATE attendance_sessions SET status = 'ended' WHERE id = ?", (session_id,))

    cursor.execute("SELECT student_id, name FROM students WHERE student_id != 'admin'")
    all_students = cursor.fetchall()

    results = []
    for sid, name in all_students:
        cursor.execute("SELECT timestamp, time, confidence FROM attendance_session_logs WHERE session_id = ? AND student_id = ? ORDER BY id ASC", (session_id, sid))
        log_rows = cursor.fetchall()
        logs = [{"timestamp": lr[0], "time": lr[1], "confidence": lr[2]} for lr in log_rows]
        evaluation = evaluate_student_attendance(session_dict, logs)

        status = evaluation["status"]
        mins = evaluation["minutes_attended"]
        reason = evaluation["reason"]

        cursor.execute("SELECT id FROM attendance WHERE student_id = ? AND date = ?", (sid, session_dict["date"]))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE attendance SET status = ?, minutes_attended = ?, reason = ? WHERE id = ?", (status, mins, reason, existing[0]))
        elif status in ["Full Day", "Half Day"]:
            cursor.execute("""
                INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status, session_id, minutes_attended, reason)
                VALUES (?, ?, ?, 'face_recognition', 98.0, 1, ?, ?, ?, ?)
            """, (sid, session_dict["date"], evaluation.get("first_seen") or "09:00:00", status, session_id, mins, reason))

        create_notification(
            student_id=sid,
            title=f"Attendance Finalized: {status} ({session_dict['title']})",
            message=f"Session completed. Your evaluated attendance status is {status}. Reason: {reason}",
            notif_type="attendance_success" if status == "Full Day" else ("attendance_warning" if status == "Half Day" else "alert"),
            severity="success" if status == "Full Day" else ("warning" if status == "Half Day" else "alert"),
            action_url="/student/attendance",
            metadata={"status": status, "minutes_attended": mins, "reason": reason}
        )

        results.append({
            "student_id": sid,
            "name": name,
            "status": status,
            "minutes_attended": mins,
            "reason": reason
        })

    conn.commit()
    conn.close()

    return {
        "message": f"Session {session_id} ended. Evaluated {len(results)} students according to duration & halves rules.",
        "evaluations": results
    }


@router.post("/session/{session_id}/heartbeat")
def session_heartbeat(
    session_id: int,
    data: SessionHeartbeatRequest,
    current_user: dict = Depends(get_current_user),
    _ip_check: None = Depends(verify_campus_ip)
):
    student_id = current_user.get("student_id")
    if not student_id or student_id == "admin":
        raise HTTPException(status_code=400, detail="Student session heartbeat required")

    now_dt = datetime.now()
    now_iso = now_dt.isoformat()
    time_now = now_dt.strftime("%H:%M:%S")
    today = get_today_date_str()

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, title, date, start_time, end_time, full_day_threshold, half_day_threshold, status FROM attendance_sessions WHERE id = ?", (session_id,))
    s_row = cursor.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")

    session_dict = {
        "id": s_row[0], "title": s_row[1], "date": s_row[2],
        "start_time": s_row[3], "end_time": s_row[4],
        "full_day_threshold": s_row[5], "half_day_threshold": s_row[6],
        "status": s_row[7]
    }

    cursor.execute("""
        INSERT INTO attendance_session_logs (session_id, student_id, timestamp, time, confidence, liveness_passed)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (session_id, student_id, now_iso, time_now, data.confidence or 98.0, 1 if data.liveness_passed else 0))

    cursor.execute("SELECT timestamp, time, confidence FROM attendance_session_logs WHERE session_id = ? AND student_id = ? ORDER BY id ASC", (session_id, student_id))
    log_rows = cursor.fetchall()
    logs = [{"timestamp": lr[0], "time": lr[1], "confidence": lr[2]} for lr in log_rows]
    eval_res = evaluate_student_attendance(session_dict, logs)

    cursor.execute("SELECT id FROM attendance WHERE student_id = ? AND date = ?", (student_id, today))
    att_row = cursor.fetchone()
    if att_row:
        cursor.execute("UPDATE attendance SET status = ?, minutes_attended = ?, reason = ? WHERE id = ?", (eval_res["status"], eval_res["minutes_attended"], eval_res["reason"], att_row[0]))
    else:
        cursor.execute("""
            INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status, session_id, minutes_attended, reason)
            VALUES (?, ?, ?, 'face_recognition', ?, 1, ?, ?, ?, ?)
        """, (student_id, today, time_now, data.confidence or 98.0, eval_res["status"], session_id, eval_res["minutes_attended"], eval_res["reason"]))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "live_evaluation": eval_res,
        "recorded_at": time_now
    }


# ----------------------------
# Get attendance stats of a student
# ----------------------------
@router.get("/student/{student_id}")
def student_attendance(student_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin" and current_user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own stats")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT COUNT(*) FROM attendance WHERE student_id = ?",
        (student_id,)
    )
    present_count = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(DISTINCT date) FROM attendance"
    )
    total_classes = cursor.fetchone()[0]

    conn.close()

    percentage = (
        (present_count / total_classes) * 100
        if total_classes > 0 else 0
    )

    return {
        "student_id": student_id,
        "present": present_count,
        "total_classes": total_classes,
        "attendance_percentage": round(percentage, 2)
    }


class AttendanceMarkRequest(BaseModel):
    student_id: str = Field(..., min_length=2, max_length=50)

# ----------------------------
# Check if student marked attendance today
# ----------------------------
@router.get("/student/{student_id}/today")
def check_student_today(student_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin" and current_user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    today = get_today_date_str()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT time FROM attendance WHERE student_id = ? AND date = ?",
        (student_id, today)
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            "already_marked": True,
            "student_id": student_id,
            "date": today,
            "time": row[0]
        }
    return {
        "already_marked": False,
        "student_id": student_id,
        "date": today
    }


# ----------------------------
# Mark attendance
# ----------------------------
@router.post("/mark")
def mark_attendance(
    data: AttendanceMarkRequest,
    current_user: dict = Depends(get_current_user),
    _ip_check: None = Depends(verify_campus_ip)
):
    student_id = data.student_id.strip()
    user_role = current_user.get("role")
    logged_in_sid = (current_user.get("student_id") or "").strip()

    # Access Control:
    # 1. Students can ONLY mark attendance for their own logged-in student account.
    # 2. Students cannot mark attendance for any other student.
    # 3. Admins have full authorization to mark attendance for any student.
    if user_role != "admin":
        if not logged_in_sid or logged_in_sid.upper() != student_id.upper():
            raise HTTPException(
                status_code=403,
                detail=f"Access Denied: As a student, you can ONLY mark attendance for your own account ({logged_in_sid}). Marking attendance for student '{student_id}' is forbidden. Only administrators can mark attendance for other students."
            )

    today = get_today_date_str()
    time_now = get_time_str()

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?",
        (student_id, today)
    )
    existing = cursor.fetchone()

    if existing:
        conn.close()
        return {
            "status": "already_marked",
            "student_id": student_id,
            "date": today,
            "time": existing[0],
            "confidence": existing[1] if len(existing) > 1 and existing[1] else 100.0,
            "method": existing[2] if len(existing) > 2 and existing[2] else "manual"
        }

    from backend.database import get_system_config
    late_cutoff = get_system_config("late_after_time", ATTENDANCE_LATE_AFTER)
    mark_status = "Late" if is_attendance_late(time_now, late_cutoff) else "Present"

    try:
        cursor.execute(
            "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status) VALUES (?, ?, ?, 'manual', 100.0, 1, ?)",
            (student_id, today, time_now, mark_status)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        # Concurrent mark handled safely
        cursor.execute("SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?", (student_id, today))
        rec = cursor.fetchone()
        conn.close()
        return {
            "status": "already_marked",
            "student_id": student_id,
            "date": today,
            "time": rec[0] if rec else time_now,
            "confidence": 100.0,
            "method": "manual"
        }

    conn.close()

    create_notification(
        student_id=student_id,
        title="Attendance Successfully Marked",
        message=f"Attendance was recorded for {today} at {time_now} via manual check-in.",
        notif_type="attendance_success",
        severity="success",
        action_url="/student/attendance",
        metadata={"method": "manual", "date": today, "time": time_now}
    )

    return {
        "status": "marked",
        "student_id": student_id,
        "date": today,
        "time": time_now,
        "confidence": 100.0,
        "method": "manual"
    }


def _load_gallery_from_db(conn):
    """
    Loads student gallery supporting both multi-embeddings (from face_embeddings table)
    and backward-compatible single embeddings (from students.embedding).
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT fe.student_id, s.name, s.department, fe.embedding
        FROM face_embeddings fe
        JOIN students s ON fe.student_id = s.student_id
        WHERE fe.student_id != 'admin'
    """)
    rows = cursor.fetchall()
    gallery = {}
    for sid, name, dept, emb_blob in rows:
        if not emb_blob:
            continue
        try:
            emb = pickle.loads(emb_blob)
            if sid not in gallery:
                gallery[sid] = {"name": name, "department": dept or "General", "embeddings": []}
            arr = np.asarray(emb, dtype=np.float32)
            if arr.ndim == 1:
                gallery[sid]["embeddings"].append(arr)
            elif arr.ndim == 2:
                for row in arr:
                    gallery[sid]["embeddings"].append(row)
        except Exception:
            pass

    # Supplementary check: students who only have legacy students.embedding
    cursor.execute("""
        SELECT student_id, name, department, embedding
        FROM students
        WHERE student_id != 'admin' AND embedding IS NOT NULL
    """)
    for sid, name, dept, emb_blob in cursor.fetchall():
        if sid not in gallery or len(gallery[sid]["embeddings"]) == 0:
            try:
                emb = pickle.loads(emb_blob)
                arr = np.asarray(emb, dtype=np.float32)
                if arr.ndim == 1:
                    embs = [arr]
                else:
                    embs = [r for r in arr]
                gallery[sid] = {"name": name, "department": dept or "General", "embeddings": embs}
            except Exception:
                pass

    return gallery


# ----------------------------------------------------------------------
# ⭐ Real-Time Biometric Face Recognition & Auto-Attendance
# ----------------------------------------------------------------------
class FrameRecognitionRequest(BaseModel):
    image: str
    confidence_threshold: Optional[float] = None
    target_student_id: Optional[str] = None

@router.post("/recognize-frame")
async def recognize_frame(
    req: FrameRecognitionRequest,
    current_user: dict = Depends(get_current_user),
    _ip_check: None = Depends(verify_campus_ip)
):
    try:
        import cv2
        import torch
        from .students import get_mtcnn, get_facenet, _get_device

        img_data = req.image
        if "," in img_data:
            img_data = img_data.split(",")[1]

        raw_bytes = base64.b64decode(img_data)
        pil_img = Image.open(BytesIO(raw_bytes)).convert("RGB")
        img_np = np.array(pil_img)

        # 1. Quality & Lighting Pre-Checks using canonical FaceQualityChecker
        quality_checker = FaceQualityChecker()
        mtcnn = get_mtcnn()
        facenet = get_facenet()
        device = _get_device()

        boxes, probs, landmarks = mtcnn.detect(pil_img, landmarks=True)
        user_role = current_user.get("role")
        logged_in_sid = (current_user.get("student_id") or "").strip()

        if boxes is None or len(boxes) == 0:
            if user_role != "admin" and logged_in_sid:
                frame_verifier.reset_student(logged_in_sid)
            return {
                "success": True,
                "face_detected": False,
                "recognized": False,
                "face_count": 0,
                "message": "No face detected in frame",
                "detected_faces": []
            }

        face_count = len(boxes)
        primary_box = boxes[0]
        primary_landmarks = landmarks[0] if (landmarks is not None and len(landmarks) > 0) else None

        # Check face bounding box dimensions (ensure face isn't too small)
        face_w = float(primary_box[2] - primary_box[0])
        face_h = float(primary_box[3] - primary_box[1])
        if face_w < 50 or face_h < 50:
            if user_role != "admin" and logged_in_sid:
                frame_verifier.reset_student(logged_in_sid)
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": face_count,
                "box": [float(b) for b in primary_box],
                "quality_warning": "Face too far away. Please move closer to the camera.",
                "message": "Please move closer to the camera",
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Face"} for b_box in boxes]
            }

        # Quality check on the detected face
        q_eval = quality_checker.evaluate(img_np, primary_box, primary_landmarks)
        if not q_eval["valid"]:
            if user_role != "admin" and logged_in_sid:
                frame_verifier.reset_student(logged_in_sid)
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": face_count,
                "box": [float(b) for b in primary_box],
                "quality_score": q_eval["quality_score"],
                "quality_warning": q_eval["message"],
                "message": q_eval["message"],
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Face"} for b_box in boxes]
            }

        # Extract aligned face crops
        faces = mtcnn.extract(pil_img, boxes, save_path=None)
        if faces is None or len(faces) == 0:
            if user_role != "admin" and logged_in_sid:
                frame_verifier.reset_student(logged_in_sid)
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": face_count,
                "box": [float(b) for b in primary_box],
                "message": "Face alignment failed. Please look directly at camera.",
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Face"} for b_box in boxes]
            }

        conn = get_connection()
        today = get_today_date_str()
        time_now = get_time_str()

        # Load enrolled student gallery with multi-embeddings
        gallery = _load_gallery_from_db(conn)

        # Dynamic biometric configuration from system_config (with config defaults fallback)
        from backend.database import get_system_config
        try:
            effective_threshold = float(get_system_config("face_threshold", str(FACE_RECOGNITION_THRESHOLD)))
        except (ValueError, TypeError):
            effective_threshold = float(FACE_RECOGNITION_THRESHOLD)

        try:
            effective_margin = float(get_system_config("min_margin", str(MIN_MATCH_MARGIN)))
        except (ValueError, TypeError):
            effective_margin = float(MIN_MATCH_MARGIN)

        # Allow request to explicitly override threshold if provided by caller
        if req.confidence_threshold is not None:
            effective_threshold = float(req.confidence_threshold)

        matcher = FaceMatcher(threshold=effective_threshold, min_margin=effective_margin)

        # -------------------------------------------------------------
        # SCENARIO A: Student Portal - Strict 1:1 Biometric Verification
        # Access Rule: A student can ONLY mark attendance for their own account.
        # Proxy attendance for another student is strictly detected and blocked.
        # -------------------------------------------------------------
        if user_role != "admin":
            if not logged_in_sid:
                conn.close()
                return {
                    "success": False,
                    "face_detected": False,
                    "recognized": False,
                    "message": "Access Denied: Student ID missing from user session."
                }

            if face_count > 1:
                frame_verifier.reset_student(logged_in_sid)
                conn.close()
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "face_count": face_count,
                    "box": [float(b) for b in primary_box],
                    "message": f"Multiple faces ({face_count}) detected. Only the logged-in student must be visible."
                }

            # Extract 512-dim embedding for primary face
            face_tensor = faces[0].unsqueeze(0).to(device)
            with torch.no_grad():
                raw_emb = facenet(face_tensor).cpu().numpy()[0]
            norm_face = normalize_embedding(raw_emb)

            match_res = matcher.match(norm_face, gallery, target_student_id=logged_in_sid)
            primary_box_coords = [float(b) for b in primary_box]
            sim_score = match_res.get("similarity_score", 0.0)
            confidence_pct = round(min(99.8, max(0.0, sim_score * 100)), 1)

            if match_res["status"] == "NOT_ENROLLED":
                frame_verifier.reset_student(logged_in_sid)
                conn.close()
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "enrolled": False,
                    "student_id": logged_in_sid,
                    "confidence": 0.0,
                    "box": primary_box_coords,
                    "message": f"No face profile registered for account {logged_in_sid}. Please enroll your face first."
                }

            if match_res["status"] == "PROXY_MISMATCH":
                frame_verifier.reset_student(logged_in_sid)
                conn.close()
                detected_other_id = match_res.get("detected_student_id")
                detected_other_name = match_res.get("detected_name")
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "enrolled": True,
                    "mismatch": True,
                    "student_id": logged_in_sid,
                    "name": match_res.get("name"),
                    "detected_other_id": detected_other_id,
                    "detected_other_name": detected_other_name,
                    "confidence": confidence_pct,
                    "box": primary_box_coords,
                    "liveness_passed": False,
                    "message": f"Proxy Attendance Blocked! Detected face belongs to '{detected_other_name}' ({detected_other_id}), but you are logged into '{logged_in_sid}'. Students can ONLY mark attendance for their own account!"
                }

            if match_res["recognized"]:
                # Multi-frame Temporal Consistency Verification:
                # Require matching the same student identity for at least 3 consecutive frames
                # before writing attendance to the database or session logs.
                is_verified, consistent_count = frame_verifier.record_match(logged_in_sid)
                if not is_verified:
                    conn.close()
                    return {
                        "success": True,
                        "face_detected": True,
                        "recognized": False,
                        "verifying": True,
                        "consecutive_frames": consistent_count,
                        "required_frames": 3,
                        "enrolled": True,
                        "mismatch": False,
                        "student_id": logged_in_sid,
                        "name": match_res.get("name"),
                        "department": match_res.get("department", "General"),
                        "confidence": confidence_pct,
                        "similarity": sim_score,
                        "box": primary_box_coords,
                        "already_marked": False,
                        "liveness_passed": True,
                        "message": f"Verifying identity... ({consistent_count}/3 frames confirmed). Hold steady."
                    }

                # Verified! Mark attendance ONLY after 3 consecutive frames
                cursor = conn.cursor()
                cursor.execute("SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?", (logged_in_sid, today))
                existing_record = cursor.fetchone()
                already_marked = existing_record is not None
                record_time = existing_record[0] if already_marked else time_now

                # Log presence into active session if one exists
                cursor.execute("""
                    SELECT id, title, start_time, end_time, full_day_threshold, half_day_threshold
                    FROM attendance_sessions
                    WHERE date = ? AND status = 'active'
                    ORDER BY id DESC LIMIT 1
                """, (today,))
                active_sess = cursor.fetchone()
                evaluated_status = "Present"

                if active_sess:
                    sess_id = active_sess[0]
                    # Rate-limit session logs: only record if at least 15s have passed since the previous log
                    cursor.execute("""
                        SELECT timestamp FROM attendance_session_logs
                        WHERE session_id = ? AND student_id = ?
                        ORDER BY id DESC LIMIT 1
                    """, (sess_id, logged_in_sid))
                    last_log_row = cursor.fetchone()
                    should_write_log = True
                    if last_log_row and last_log_row[0]:
                        try:
                            last_iso = last_log_row[0]
                            if "T" in last_iso:
                                prev_dt = datetime.fromisoformat(last_iso)
                            else:
                                prev_dt = datetime.strptime(last_iso[:19], "%Y-%m-%d %H:%M:%S")
                            if (datetime.now() - prev_dt).total_seconds() < 15.0:
                                should_write_log = False
                        except Exception:
                            pass

                    if should_write_log:
                        cursor.execute("""
                            INSERT INTO attendance_session_logs (session_id, student_id, timestamp, time, confidence, liveness_passed)
                            VALUES (?, ?, ?, ?, ?, 1)
                        """, (sess_id, logged_in_sid, datetime.now().isoformat(), time_now, confidence_pct))

                    cursor.execute("""
                        SELECT timestamp, time, confidence FROM attendance_session_logs
                        WHERE session_id = ? AND student_id = ? ORDER BY id ASC
                    """, (sess_id, logged_in_sid))
                    log_rows = cursor.fetchall()
                    logs = [{"timestamp": lr[0], "time": lr[1], "confidence": lr[2]} for lr in log_rows]
                    sess_dict = {
                        "id": sess_id, "title": active_sess[1], "date": today,
                        "start_time": active_sess[2], "end_time": active_sess[3],
                        "full_day_threshold": active_sess[4], "half_day_threshold": active_sess[5]
                    }
                    eval_res = evaluate_student_attendance(sess_dict, logs)
                    evaluated_status = eval_res["status"]

                    if not already_marked:
                        try:
                            cursor.execute("""
                                INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status, session_id, minutes_attended, reason)
                                VALUES (?, ?, ?, 'face_recognition', ?, 1, ?, ?, ?, ?)
                            """, (logged_in_sid, today, time_now, confidence_pct, evaluated_status, sess_id, eval_res["minutes_attended"], eval_res["reason"]))
                            conn.commit()
                            create_notification(
                                student_id=logged_in_sid,
                                title="Attendance Successfully Logged",
                                message=f"Biometric face recognition verified attendance on {today} at {time_now} ({evaluated_status}).",
                                notif_type="attendance_success",
                                severity="success",
                                action_url="/student/attendance",
                                metadata={"confidence": confidence_pct, "method": "face_recognition", "date": today, "time": time_now, "status": evaluated_status}
                            )
                        except sqlite3.IntegrityError:
                            already_marked = True
                    elif should_write_log:
                        cursor.execute("""
                            UPDATE attendance
                            SET status = ?, session_id = ?, minutes_attended = ?, reason = ?
                            WHERE student_id = ? AND date = ?
                        """, (evaluated_status, sess_id, eval_res["minutes_attended"], eval_res["reason"], logged_in_sid, today))
                        conn.commit()
                else:
                    if not already_marked:
                        late_cutoff = get_system_config("late_after_time", ATTENDANCE_LATE_AFTER)
                        status_to_mark = "Late" if is_attendance_late(time_now, late_cutoff) else "Present"
                        try:
                            cursor.execute(
                                "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status) VALUES (?, ?, ?, 'face_recognition', ?, 1, ?)",
                                (logged_in_sid, today, time_now, confidence_pct, status_to_mark)
                            )
                            conn.commit()
                            create_notification(
                                student_id=logged_in_sid,
                                title="Attendance Successfully Marked",
                                message=f"Biometric face recognition verified attendance on {today} at {time_now} (Similarity: {confidence_pct}%).",
                                notif_type="attendance_success",
                                severity="success",
                                action_url="/student/attendance",
                                metadata={"confidence": confidence_pct, "method": "face_recognition", "date": today, "time": time_now}
                            )
                        except sqlite3.IntegrityError:
                            already_marked = True

                conn.close()
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": True,
                    "verifying": False,
                    "consecutive_frames": consistent_count,
                    "required_frames": 3,
                    "enrolled": True,
                    "mismatch": False,
                    "student_id": logged_in_sid,
                    "name": match_res.get("name"),
                    "department": match_res.get("department", "General"),
                    "confidence": confidence_pct,
                    "similarity": sim_score,
                    "box": primary_box_coords,
                    "already_marked": already_marked,
                    "marked_time": record_time,
                    "liveness_passed": True,
                    "message": "Attendance marked successfully" if not already_marked else f"Attendance already recorded today at {record_time}"
                }
            else:
                frame_verifier.reset_student(logged_in_sid)
                conn.close()
                user_msg = match_res.get("message") or f"Match similarity is {confidence_pct}% ({int(effective_threshold*100)}% required). Face the camera directly."
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "verifying": False,
                    "enrolled": True,
                    "mismatch": False,
                    "student_id": logged_in_sid,
                    "name": match_res.get("name"),
                    "department": match_res.get("department", "General"),
                    "confidence": confidence_pct,
                    "similarity": sim_score,
                    "box": primary_box_coords,
                    "liveness_passed": False,
                    "message": user_msg
                }

        # -------------------------------------------------------------
        # SCENARIO B: Admin / Group Kiosk - Multi-Face 1:N Identification
        # Privilege Rule: ONLY administrators are permitted to scan & mark attendance for all students.
        # -------------------------------------------------------------
        if not gallery:
            conn.close()
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": len(boxes),
                "box": [float(b) for b in primary_box],
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Unregistered"} for b_box in boxes],
                "message": "No registered face profiles found in database"
            }

        detected_faces = []
        recognized_students = []
        cursor = conn.cursor()

        target_sid = (req.target_student_id or "").strip()
        if target_sid and target_sid.upper() == "AUTO":
            target_sid = ""

        for i in range(len(faces)):
            face_tensor = faces[i].unsqueeze(0).to(device)
            with torch.no_grad():
                raw_emb = facenet(face_tensor).cpu().numpy()[0]
            norm_face = normalize_embedding(raw_emb)

            match_res = matcher.match(norm_face, gallery, target_student_id=target_sid if target_sid else None)
            box = [float(b) for b in boxes[i]] if i < len(boxes) else [0, 0, 0, 0]
            sim_score = match_res.get("similarity_score", 0.0)
            confidence_pct = round(min(99.8, max(0.0, sim_score * 100)), 1)

            if target_sid and match_res.get("status") == "PROXY_MISMATCH":
                detected_other_id = match_res.get("detected_student_id")
                detected_other_name = match_res.get("detected_name")
                detected_faces.append({
                    "recognized": False,
                    "mismatch": True,
                    "verifying": False,
                    "student_id": None,
                    "target_student_id": target_sid,
                    "name": match_res.get("name"),
                    "detected_other_id": detected_other_id,
                    "detected_other_name": detected_other_name,
                    "confidence": confidence_pct,
                    "similarity": sim_score,
                    "box": box,
                    "already_marked": False,
                    "status": f"Face does not match target ({target_sid})",
                    "message": f"Detected face belongs to '{detected_other_name}' ({detected_other_id}), not target student '{target_sid}'. Attendance not marked.",
                    "liveness_passed": False
                })
                continue

            if match_res["recognized"] and match_res.get("student_id"):
                matched_sid = match_res["student_id"]
                matched_name = match_res["name"]
                matched_dept = match_res.get("department", "General")

                is_verified, consistent_count = frame_verifier.record_match(matched_sid)
                if not is_verified:
                    face_info = {
                        "recognized": False,
                        "verifying": True,
                        "consecutive_frames": consistent_count,
                        "required_frames": 3,
                        "student_id": matched_sid,
                        "name": matched_name,
                        "department": matched_dept,
                        "confidence": confidence_pct,
                        "similarity": sim_score,
                        "box": box,
                        "already_marked": False,
                        "status": f"Verifying ({consistent_count}/3)",
                        "message": f"Verifying identity ({consistent_count}/3)... Hold still.",
                        "liveness_passed": True
                    }
                    detected_faces.append(face_info)
                else:
                    cursor.execute("SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?", (matched_sid, today))
                    existing_record = cursor.fetchone()
                    already_marked = existing_record is not None
                    record_time = existing_record[0] if already_marked else time_now

                    if not already_marked:
                        late_cutoff = get_system_config("late_after_time", ATTENDANCE_LATE_AFTER)
                        status_to_mark = "Late" if is_attendance_late(time_now, late_cutoff) else "Present"
                        try:
                            cursor.execute(
                                "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed, status) VALUES (?, ?, ?, 'face_recognition', ?, 1, ?)",
                                (matched_sid, today, time_now, confidence_pct, status_to_mark)
                            )
                            conn.commit()
                            create_notification(
                                student_id=matched_sid,
                                title="Attendance Successfully Marked",
                                message=f"Live camera face recognition verified your attendance on {today} at {time_now} (Similarity: {confidence_pct}%).",
                                notif_type="attendance_success",
                                severity="success",
                                action_url="/student/attendance",
                                metadata={"confidence": confidence_pct, "method": "face_recognition", "date": today, "time": time_now}
                            )
                        except sqlite3.IntegrityError:
                            already_marked = True

                    face_info = {
                        "recognized": True,
                        "verifying": False,
                        "consecutive_frames": consistent_count,
                        "required_frames": 3,
                        "student_id": matched_sid,
                        "name": matched_name,
                        "department": matched_dept,
                        "confidence": confidence_pct,
                        "similarity": sim_score,
                        "box": box,
                        "already_marked": already_marked,
                        "marked_time": record_time,
                        "status": "Already Marked Today" if already_marked else "Marked Present",
                        "liveness_passed": True
                    }
                    detected_faces.append(face_info)
                    recognized_students.append(face_info)
            else:
                detected_faces.append({
                    "recognized": False,
                    "verifying": False,
                    "name": "Unrecognized Face",
                    "confidence": confidence_pct,
                    "similarity": sim_score,
                    "box": box,
                    "status": "Unknown Face",
                    "message": match_res.get("message") or "Face not recognized with sufficient certainty"
                })

        conn.close()
        primary_match = recognized_students[0] if recognized_students else (detected_faces[0] if detected_faces else None)

        return {
            "success": True,
            "face_detected": len(detected_faces) > 0,
            "face_count": len(detected_faces),
            "recognized_count": len(recognized_students),
            "detected_faces": detected_faces,
            "recognized": len(recognized_students) > 0,
            "student_id": primary_match.get("student_id") if (primary_match and primary_match.get("recognized")) else None,
            "name": primary_match.get("name") if (primary_match and primary_match.get("recognized")) else None,
            "department": primary_match.get("department") if (primary_match and primary_match.get("recognized")) else None,
            "confidence": primary_match.get("confidence", 0) if primary_match else 0,
            "box": primary_match.get("box") if primary_match else None,
            "already_marked": primary_match.get("already_marked", False) if primary_match else False,
            "marked_time": primary_match.get("marked_time") if primary_match else None,
            "mismatch": primary_match.get("mismatch", False) if primary_match else False,
            "liveness_passed": primary_match.get("liveness_passed", False) if primary_match else False,
            "message": primary_match.get("message") if (primary_match and primary_match.get("message")) else (
                f"{len(recognized_students)} student(s) recognized" if recognized_students else "Face detected but not recognized"
            )
        }

    except Exception as e:
        logger.error("[RECOGNIZE-FRAME] Error: %s", e)
        return {
            "success": False,
            "face_detected": False,
            "recognized": False,
            "detected_faces": [],
            "error": str(e)
        }


