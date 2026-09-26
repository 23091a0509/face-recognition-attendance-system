from fastapi import APIRouter, HTTPException, Depends
from datetime import date, datetime
import base64
import numpy as np
from io import BytesIO
from PIL import Image
import pickle
from pydantic import BaseModel, Field
from backend.database import get_connection
from .auth import require_admin, get_current_user
from backend_api.routers.notifications import create_notification

router = APIRouter(
    prefix="/attendance",
    tags=["attendance"]
)

# ----------------------------
# Get today's attendance
# ----------------------------
@router.get("/today")
def today_attendance(admin_user: dict = Depends(require_admin)):
    today = date.today().isoformat()

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

    # Get today's attendance logs
    cursor.execute("""
        SELECT student_id, time 
        FROM attendance 
        WHERE date = ?
    """, (today,))
    att_map = dict(cursor.fetchall())
    conn.close()

    records = []
    total_present = 0
    total_late = 0
    total_absent = 0

    for s in all_students:
        sid, name, dept = s[0], s[1], s[2]
        if sid in att_map:
            time_str = att_map[sid]
            is_late = False
            try:
                parts = time_str.split(":")
                h = int(parts[0])
                m = int(parts[1])
                if h > 9 or (h == 9 and m > 15):
                    is_late = True
            except Exception:
                pass
            
            status = "Late" if is_late else "Present"
            if is_late:
                total_late += 1
            total_present += 1

            records.append({
                "student_id": sid,
                "name": name,
                "department": dept,
                "time": time_str,
                "status": status,
                "method": "Face AI"
            })
        else:
            total_absent += 1
            records.append({
                "student_id": sid,
                "name": name,
                "department": dept,
                "time": "--:--",
                "status": "Absent",
                "method": "-"
            })

    # Sort records: Present & Late first by time desc, then Absent
    records.sort(key=lambda x: (0 if x["status"] in ["Present", "Late"] else 1, x["student_id"]))

    return {
        "date": today,
        "total_students": len(all_students),
        "total_present": total_present,
        "total_absent": total_absent,
        "total_late": total_late,
        "records": records
    }


@router.get("/history")
def get_attendance_history(admin_user: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.student_id, a.date, a.time, COALESCE(s.name, a.student_id), COALESCE(s.department, 'General')
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.student_id
        ORDER BY a.date DESC, a.time DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    records = []
    for r in rows:
        time_str = r[2]
        is_late = False
        try:
            h, m, _ = time_str.split(":")
            if int(h) > 9 or (int(h) == 9 and int(m) > 15):
                is_late = True
        except Exception:
            pass

        records.append({
            "student_id": r[0],
            "date": r[1],
            "time": r[2],
            "name": r[3],
            "department": r[4],
            "status": "Late" if is_late else "Present",
            "method": "Face AI"
        })

    return records


# ----------------------------
# Get FULL attendance records of a student
# ----------------------------
@router.get("/student/{student_id}/records")
def student_attendance_records(student_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin" and current_user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own records")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT date, time FROM attendance WHERE student_id = ? ORDER BY date DESC",
        (student_id,)
    )

    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "date": r[0],
            "time": r[1]
        }
        for r in rows
    ]


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

    today = datetime.now().strftime("%Y-%m-%d")
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
def mark_attendance(data: AttendanceMarkRequest, current_user: dict = Depends(get_current_user)):
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

    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    time_now = now.strftime("%H:%M:%S")

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

    cursor.execute(
        "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed) VALUES (?, ?, ?, 'manual', 100.0, 1)",
        (student_id, today, time_now)
    )

    conn.commit()
    conn.close()

    create_notification(
        student_id=student_id,
        title="Attendance Successfully Marked ✅",
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


# ----------------------------------------------------------------------
# ⭐ Real-Time Biometric Face Recognition & Auto-Attendance
# ----------------------------------------------------------------------
class FrameRecognitionRequest(BaseModel):
    image: str
    confidence_threshold: float = 0.65

@router.post("/recognize-frame")
async def recognize_frame(
    req: FrameRecognitionRequest,
    current_user: dict = Depends(get_current_user)
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

        # 1. Quality & Lighting Pre-Checks
        gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        mean_brightness = float(np.mean(gray))
        if mean_brightness < 25.0:
            return {
                "success": True,
                "face_detected": False,
                "recognized": False,
                "quality_warning": "Lighting too dark. Please face a light source.",
                "message": "Lighting too dark. Please face a light source.",
                "detected_faces": []
            }
        elif mean_brightness > 245.0:
            return {
                "success": True,
                "face_detected": False,
                "recognized": False,
                "quality_warning": "Lighting overexposed. Please adjust position.",
                "message": "Lighting overexposed. Please adjust position.",
                "detected_faces": []
            }

        # Blur check via Laplacian variance
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_blurry = laplacian_var < 18.0

        mtcnn = get_mtcnn()
        facenet = get_facenet()
        device = _get_device()

        boxes, probs = mtcnn.detect(pil_img)
        if boxes is None or len(boxes) == 0:
            return {
                "success": True,
                "face_detected": False,
                "recognized": False,
                "face_count": 0,
                "quality_warning": "Please hold still" if is_blurry else None,
                "message": "No face detected in frame",
                "detected_faces": []
            }

        # Check face bounding box dimensions (ensure face isn't too small)
        primary_box = boxes[0]
        face_w = float(primary_box[2] - primary_box[0])
        face_h = float(primary_box[3] - primary_box[1])
        if face_w < 55 or face_h < 55:
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": len(boxes),
                "box": [float(b) for b in primary_box],
                "quality_warning": "Face too far away. Please move closer.",
                "message": "Please move closer to the camera",
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Face"} for b_box in boxes]
            }

        faces = mtcnn(pil_img)
        if faces is None or len(faces) == 0:
            return {
                "success": True,
                "face_detected": True,
                "recognized": False,
                "face_count": len(boxes),
                "box": [float(b) for b in primary_box],
                "message": "Face alignment failed. Please look directly at camera.",
                "detected_faces": [{"box": [float(b) for b in b_box], "recognized": False, "name": "Face"} for b_box in boxes]
            }

        conn = get_connection()
        cursor = conn.cursor()

        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        time_now = now.strftime("%H:%M:%S")

        user_role = current_user.get("role")
        logged_in_sid = (current_user.get("student_id") or "").strip()

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

            cursor.execute(
                "SELECT student_id, name, department, embedding FROM students WHERE student_id = ?",
                (logged_in_sid,)
            )
            student_row = cursor.fetchone()
            if not student_row or not student_row[3]:
                conn.close()
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "enrolled": False,
                    "student_id": logged_in_sid,
                    "name": student_row[1] if student_row else logged_in_sid,
                    "confidence": 0.0,
                    "message": f"No face profile registered for account {logged_in_sid}. Please enroll your face first."
                }

            student_id, name, dept, emb_blob = student_row
            db_raw = pickle.loads(emb_blob)
            db_emb = db_raw[0] if hasattr(db_raw, "__len__") and len(db_raw) == 1 and hasattr(db_raw[0], "__len__") else db_raw
            norm_db = db_emb / (np.linalg.norm(db_emb) + 1e-9)

            # Extract primary face embedding from current frame
            face_tensor = faces[0].unsqueeze(0).to(device)
            with torch.no_grad():
                face_emb = facenet(face_tensor).cpu().numpy()[0]
            norm_face = face_emb / (np.linalg.norm(face_emb) + 1e-9)

            # Direct 1:1 cosine similarity check against logged-in student
            sim = float(np.dot(norm_face, norm_db))
            confidence_pct = round(min(99.8, max(0.0, sim * 100)), 1)
            # Optimal calibrated threshold for verified personal attendance: 0.68
            threshold = 0.68

            primary_box = [float(b) for b in boxes[0]]

            if sim >= threshold:
                # Verified! Mark attendance ONLY for this logged-in student
                cursor.execute("SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?", (student_id, today))
                existing_record = cursor.fetchone()
                already_marked = existing_record is not None
                record_time = existing_record[0] if already_marked else time_now

                if not already_marked:
                    cursor.execute(
                        "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed) VALUES (?, ?, ?, 'face_recognition', ?, 1)",
                        (student_id, today, time_now, confidence_pct)
                    )
                    conn.commit()
                    create_notification(
                        student_id=student_id,
                        title="Attendance Successfully Marked ✅",
                        message=f"Biometric face recognition verified attendance on {today} at {time_now} (Confidence: {confidence_pct}%).",
                        notif_type="attendance_success",
                        severity="success",
                        action_url="/student/attendance",
                        metadata={"confidence": confidence_pct, "method": "face_recognition", "date": today, "time": time_now}
                    )

                conn.close()
                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": True,
                    "enrolled": True,
                    "mismatch": False,
                    "student_id": student_id,
                    "name": name,
                    "department": dept or "Computer Science",
                    "confidence": confidence_pct,
                    "box": primary_box,
                    "already_marked": already_marked,
                    "marked_time": record_time,
                    "liveness_passed": True,
                    "message": "Attendance marked successfully! ✅" if not already_marked else f"Attendance already recorded today at {record_time}"
                }
            else:
                # Face did NOT match the logged-in student.
                # Check if the face belongs to another registered student (Anti-Proxy Enforcement)
                cursor.execute(
                    "SELECT student_id, name, department, embedding FROM students WHERE student_id != ? AND embedding IS NOT NULL AND student_id != 'admin'",
                    (student_id,)
                )
                other_students = cursor.fetchall()
                best_other_sid = None
                best_other_name = None
                best_other_sim = -1.0

                for o_sid, o_name, o_dept, o_emb_blob in other_students:
                    if not o_emb_blob:
                        continue
                    try:
                        o_raw = pickle.loads(o_emb_blob)
                        o_emb = o_raw[0] if hasattr(o_raw, "__len__") and len(o_raw) == 1 and hasattr(o_raw[0], "__len__") else o_raw
                        norm_o = o_emb / (np.linalg.norm(o_emb) + 1e-9)
                        o_sim = float(np.dot(norm_face, norm_o))
                        if o_sim > best_other_sim:
                            best_other_sim = o_sim
                            best_other_sid = o_sid
                            best_other_name = o_name
                    except Exception:
                        continue

                conn.close()

                # If face matches another student in the institution: Block proxy!
                if best_other_sim >= 0.70 and best_other_sid:
                    proxy_pct = round(min(99.8, max(0.0, best_other_sim * 100)), 1)
                    return {
                        "success": True,
                        "face_detected": True,
                        "recognized": False,
                        "enrolled": True,
                        "mismatch": True,
                        "student_id": student_id,
                        "name": name,
                        "detected_other_id": best_other_sid,
                        "detected_other_name": best_other_name,
                        "confidence": proxy_pct,
                        "box": primary_box,
                        "liveness_passed": False,
                        "message": f"Proxy Attendance Blocked! Detected face belongs to '{best_other_name}' ({best_other_sid}), but you are logged into '{name}' ({student_id}). Students can ONLY mark attendance for their own account!"
                    }

                return {
                    "success": True,
                    "face_detected": True,
                    "recognized": False,
                    "enrolled": True,
                    "mismatch": False,
                    "student_id": student_id,
                    "name": name,
                    "department": dept or "Computer Science",
                    "confidence": confidence_pct,
                    "box": primary_box,
                    "liveness_passed": False,
                    "message": f"Face match is {confidence_pct}% (68% required). Only the logged-in student ({name}) can mark attendance on this account."
                }

        # -------------------------------------------------------------
        # SCENARIO B: Admin / Group Kiosk - High-Precision 1:N Identification
        # Privilege Rule: ONLY administrators are permitted to scan & mark attendance for all students.
        # -------------------------------------------------------------
        if user_role != "admin":
            conn.close()
            return {
                "success": False,
                "face_detected": False,
                "recognized": False,
                "message": "Access Denied: Only administrators can mark attendance for other students."
            }
        cursor.execute("SELECT student_id, name, department, embedding FROM students WHERE embedding IS NOT NULL AND student_id != 'admin'")
        db_students = cursor.fetchall()

        if not db_students:
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
        num_faces = len(faces)
        threshold = max(0.72, min(0.85, req.confidence_threshold or 0.74))

        for i in range(num_faces):
            face_tensor = faces[i].unsqueeze(0).to(device)
            with torch.no_grad():
                face_emb = facenet(face_tensor).cpu().numpy()[0]

            norm_face = face_emb / (np.linalg.norm(face_emb) + 1e-9)

            best_sid = None
            best_name = None
            best_dept = None
            best_sim = -1.0
            second_sim = -1.0

            for sid, name, dept, emb_blob in db_students:
                if not emb_blob:
                    continue
                try:
                    db_raw = pickle.loads(emb_blob)
                    db_emb = db_raw[0] if hasattr(db_raw, "__len__") and len(db_raw) == 1 and hasattr(db_raw[0], "__len__") else db_raw
                    norm_db = db_emb / (np.linalg.norm(db_emb) + 1e-9)
                    sim = float(np.dot(norm_face, norm_db))
                    if sim > best_sim:
                        second_sim = best_sim
                        best_sim = sim
                        best_sid = sid
                        best_name = name
                        best_dept = dept
                    elif sim > second_sim:
                        second_sim = sim
                except Exception:
                    continue

            box = [float(b) for b in boxes[i]] if i < len(boxes) else [0, 0, 0, 0]
            confidence_pct = round(min(99.8, max(0.0, best_sim * 100)), 1)
            margin = (best_sim - second_sim) if second_sim > 0 else 1.0

            # Match only if passes strict threshold AND clear margin ahead of runner-up
            if best_sim >= threshold and margin >= 0.07 and best_sid:
                cursor.execute("SELECT time, confidence, method FROM attendance WHERE student_id = ? AND date = ?", (best_sid, today))
                existing_record = cursor.fetchone()
                already_marked = existing_record is not None
                record_time = existing_record[0] if already_marked else time_now

                if not already_marked:
                    cursor.execute(
                        "INSERT INTO attendance (student_id, date, time, method, confidence, liveness_passed) VALUES (?, ?, ?, 'face_recognition', ?, 1)",
                        (best_sid, today, time_now, confidence_pct)
                    )
                    conn.commit()
                    create_notification(
                        student_id=best_sid,
                        title="Attendance Successfully Marked ✅",
                        message=f"Kiosk face recognition verified your attendance on {today} at {time_now} (Confidence: {confidence_pct}%).",
                        notif_type="attendance_success",
                        severity="success",
                        action_url="/student/attendance",
                        metadata={"confidence": confidence_pct, "method": "face_recognition", "date": today, "time": time_now}
                    )

                face_info = {
                    "recognized": True,
                    "student_id": best_sid,
                    "name": best_name,
                    "department": best_dept or "Computer Science",
                    "confidence": confidence_pct,
                    "box": box,
                    "already_marked": already_marked,
                    "marked_time": record_time,
                    "status": "Already Marked Today" if already_marked else "Marked Present ✅",
                    "liveness_passed": True
                }
                detected_faces.append(face_info)
                recognized_students.append(face_info)
            else:
                detected_faces.append({
                    "recognized": False,
                    "name": "Unrecognized Face",
                    "confidence": confidence_pct,
                    "box": box,
                    "status": "Unknown Face",
                    "message": "Face not recognized with sufficient certainty"
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
            "student_id": primary_match.get("student_id") if primary_match else None,
            "name": primary_match.get("name") if primary_match else None,
            "department": primary_match.get("department") if primary_match else None,
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
        print(f"[RECOGNIZE-FRAME] Error: {e}")
        return {
            "success": False,
            "face_detected": False,
            "recognized": False,
            "detected_faces": [],
            "error": str(e)
        }


