from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from backend.database import get_connection
from backend_api.routers.auth import get_current_user, require_admin

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)

# -------------------------------------------------------------
# Pydantic Request Models
# -------------------------------------------------------------
class AnnouncementRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=150)
    message: str = Field(..., min_length=5, max_length=1000)
    recipient: str = Field(default="ALL", description="'ALL', a department name, or specific student_id")
    priority: str = Field(default="normal", description="'normal' or 'high'")

class LowAttendanceCheckRequest(BaseModel):
    threshold_percentage: float = Field(default=75.0, ge=10.0, le=100.0)

class AttendanceCorrectionNotificationRequest(BaseModel):
    student_id: str
    date: str
    status: str
    note: Optional[str] = "Attendance record adjusted by administrator"

# -------------------------------------------------------------
# Internal Helper to Create Notifications
# -------------------------------------------------------------
def create_notification(
    student_id: Optional[str],
    title: str,
    message: str,
    notif_type: str,  # 'attendance_success', 'low_attendance', 'announcement', 'correction'
    severity: str = "info",  # 'success', 'warning', 'info', 'alert'
    action_url: Optional[str] = "/student/attendance",
    metadata: Optional[Dict[str, Any]] = None
):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        meta_json = json.dumps(metadata) if metadata else None
        
        cursor.execute(
            """
            INSERT INTO notifications (student_id, title, message, type, severity, is_read, created_at, action_url, metadata)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
            """,
            (student_id or "ALL", title, message, notif_type, severity, now_str, action_url, meta_json)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to create notification: {e}")
        return False

# -------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------
@router.get("")
def get_notifications(
    notif_type: Optional[str] = Query(None, description="Filter by type: attendance_success, low_attendance, announcement, correction"),
    unread_only: bool = Query(False, description="Filter only unread"),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetch notifications.
    Students receive their own notifications and broadcasts ('ALL').
    Admins receive all notifications.
    """
    user_id = current_user.get("student_id")
    is_admin = current_user.get("role") == "admin"

    conn = get_connection()
    cursor = conn.cursor()

    # Query construction
    conditions = []
    params = []

    if not is_admin:
        conditions.append("(student_id = ? OR student_id = 'ALL' OR student_id IS NULL)")
        params.append(user_id)
    
    if notif_type and notif_type.strip():
        conditions.append("type = ?")
        params.append(notif_type.strip())

    if unread_only:
        conditions.append("is_read = 0")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT id, student_id, title, message, type, severity, is_read, created_at, action_url, metadata
        FROM notifications
        {where_clause}
        ORDER BY created_at DESC, id DESC
    """
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()

    notifications = []
    unread_count = 0

    for r in rows:
        is_read_val = bool(r[6])
        if not is_read_val:
            unread_count += 1

        meta_parsed = None
        if r[9]:
            try:
                meta_parsed = json.loads(r[9])
            except:
                meta_parsed = {}

        notifications.append({
            "id": r[0],
            "student_id": r[1],
            "title": r[2],
            "message": r[3],
            "type": r[4],
            "severity": r[5] or "info",
            "is_read": is_read_val,
            "created_at": r[7],
            "action_url": r[8],
            "metadata": meta_parsed
        })

    # Total unread count for user
    if is_admin:
        cursor.execute("SELECT COUNT(*) FROM notifications WHERE is_read = 0")
        total_unread = cursor.fetchone()[0]
    else:
        cursor.execute(
            "SELECT COUNT(*) FROM notifications WHERE (student_id = ? OR student_id = 'ALL' OR student_id IS NULL) AND is_read = 0",
            (user_id,)
        )
        total_unread = cursor.fetchone()[0]

    conn.close()

    return {
        "total": len(notifications),
        "unread_count": total_unread,
        "notifications": notifications
    }


@router.post("/announcement")
def broadcast_announcement(
    req: AnnouncementRequest,
    admin_user: dict = Depends(require_admin)
):
    """
    Admin: Broadcast an official announcement to ALL students or a specific recipient.
    """
    severity = "alert" if req.priority == "high" else "info"
    metadata = {
        "priority": req.priority,
        "sender": admin_user.get("student_id") or "Administration",
        "broadcast_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    success = create_notification(
        student_id=req.recipient,
        title=f"Announcement: {req.title}",
        message=req.message,
        notif_type="announcement",
        severity=severity,
        action_url="/student/notifications",
        metadata=metadata
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to post announcement")

    return {
        "status": "success",
        "message": f"Announcement broadcasted to {req.recipient} successfully!"
    }


@router.post("/trigger-low-attendance-check")
def trigger_low_attendance_check(
    req: LowAttendanceCheckRequest = LowAttendanceCheckRequest(),
    admin_user: dict = Depends(require_admin)
):
    """
    Admin: Check attendance rates across all students.
    Automatically generates low-attendance warnings for students below threshold.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Get distinct academic dates on which attendance was recorded
    cursor.execute("SELECT DISTINCT date FROM attendance")
    dates = [row[0] for row in cursor.fetchall()]
    total_dates = len(dates)

    if total_dates == 0:
        conn.close()
        return {
            "status": "skipped",
            "message": "No recorded attendance sessions yet to evaluate.",
            "warnings_generated": 0,
            "evaluated_students": 0
        }

    # Get all active students
    cursor.execute("SELECT student_id, name, department FROM students WHERE student_id != 'admin'")
    students = cursor.fetchall()

    warnings_generated = 0
    today_str = datetime.now().strftime("%Y-%m-%d")

    for sid, name, dept in students:
        cursor.execute("SELECT COUNT(DISTINCT date) FROM attendance WHERE student_id = ?", (sid,))
        attended = cursor.fetchone()[0]
        rate = round((attended / total_dates) * 100, 1)

        if rate < req.threshold_percentage:
            # Check if warning already sent today to prevent spam
            cursor.execute(
                """
                SELECT id FROM notifications
                WHERE student_id = ? AND type = 'low_attendance' AND created_at LIKE ?
                """,
                (sid, f"{today_str}%")
            )
            already_warned_today = cursor.fetchone()

            if not already_warned_today:
                create_notification(
                    student_id=sid,
                    title="Low-Attendance Warning ⚠️",
                    message=(
                        f"Dear {name}, your attendance in {dept or 'your department'} is currently {rate}% "
                        f"({attended}/{total_dates} classes attended), which is below the required {req.threshold_percentage}%. "
                        f"Please ensure consistent attendance to maintain exam eligibility."
                    ),
                    notif_type="low_attendance",
                    severity="warning",
                    action_url="/student/attendance",
                    metadata={
                        "attended_sessions": attended,
                        "total_sessions": total_dates,
                        "current_rate": rate,
                        "required_rate": req.threshold_percentage
                    }
                )
                warnings_generated += 1

    conn.close()

    return {
        "status": "success",
        "evaluated_students": len(students),
        "total_sessions": total_dates,
        "threshold": req.threshold_percentage,
        "warnings_generated": warnings_generated,
        "message": f"Evaluated {len(students)} students: {warnings_generated} new low-attendance warnings generated."
    }


@router.post("/attendance-correction")
def send_attendance_correction(
    req: AttendanceCorrectionNotificationRequest,
    admin_user: dict = Depends(require_admin)
):
    """
    Admin: Send notification when an attendance record has been updated or corrected.
    """
    success = create_notification(
        student_id=req.student_id,
        title="Attendance Record Corrected ✏️",
        message=f"Your attendance record for {req.date} has been updated to '{req.status}'. Note: {req.note}",
        notif_type="correction",
        severity="info",
        action_url="/student/attendance",
        metadata={
            "date": req.date,
            "status": req.status,
            "updated_by": admin_user.get("student_id") or "admin"
        }
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send correction notification")

    return {
        "status": "success",
        "message": f"Attendance correction notification sent to student {req.student_id}."
    }


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark a specific notification as read.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
    conn.commit()
    conn.close()
    return {"status": "success", "id": notification_id, "is_read": True}


@router.post("/mark-all-read")
def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    """
    Mark all notifications for the current user as read.
    """
    user_id = current_user.get("student_id")
    is_admin = current_user.get("role") == "admin"

    conn = get_connection()
    cursor = conn.cursor()

    if is_admin:
        cursor.execute("UPDATE notifications SET is_read = 1")
    else:
        cursor.execute(
            "UPDATE notifications SET is_read = 1 WHERE student_id = ? OR student_id = 'ALL' OR student_id IS NULL",
            (user_id,)
        )

    conn.commit()
    conn.close()
    return {"status": "success", "message": "All notifications marked as read."}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Dismiss or delete a notification.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM notifications WHERE id = ?", (notification_id,))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Notification {notification_id} deleted."}
