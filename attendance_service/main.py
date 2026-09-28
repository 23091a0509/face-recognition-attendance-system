import cv2
import time
import os
import threading
import queue
from collections import deque, defaultdict
from typing import Set, Dict, Any, List

from config import (
    FACE_THRESHOLD,
    MIN_MATCH_MARGIN,
    CAMERA_INDEX,
    DETECTION_INTERVAL,
    RECOGNITION_INTERVAL,
    LIVENESS_INTERVAL,
    CACHE_RELOAD_INTERVAL,
    PERFORMANCE_MODE,
    MIN_FACE_SIZE,
)
from face_recognizer import (
    recognize_faces_optimized,
    load_students,
    student_gallery,
    CACHE_PATH,
    device,
)
from api_client import mark_attendance
from cache_builder import build_cache
from liveness import BlinkDetector

# ---------------------------------------------------------------------------
# Attendance Policies & Buffer Configs
# ---------------------------------------------------------------------------
ATTENDANCE_COOLDOWN = 60 * 5  # 5 minutes between check-ins for same student
VOTING_WINDOW = 8
MIN_VOTES = 5
MIN_AVG_SIMILARITY = 0.72

CAMERA_READ_RETRIES = 5
CAMERA_RETRY_DELAY = 0.5
CAMERA_RECONNECT_ATTEMPTS = 3
CAMERA_RECONNECT_DELAY = 2.0

BACKEND_STARTUP_RETRIES = 5
BACKEND_RETRY_DELAY = 3.0

# ---------------------------------------------------------------------------
# Non-Blocking Background Attendance Worker (Instructions 26 & 27)
# ---------------------------------------------------------------------------
attendance_queue: queue.Queue = queue.Queue()
pending_attendance_ids: Set[str] = set()
marked_students_status: Dict[str, str] = {}  # sid -> status message
attendance_lock = threading.Lock()

def attendance_worker():
    """
    Background worker thread: executes backend HTTP check-ins asynchronously.
    Prevents the camera preview from freezing during network requests.
    """
    while True:
        try:
            task = attendance_queue.get()
            if task is None:
                break

            student_id, name = task
            print(f"[BACKGROUND-WORKER] Submitting attendance for '{name}' ({student_id})...")

            try:
                success = mark_attendance(student_id)
                with attendance_lock:
                    if success:
                        marked_students_status[student_id] = "Marked Present ✅"
                        print(f"[BACKGROUND-WORKER] SUCCESS: Attendance recorded for {student_id}")
                    else:
                        marked_students_status[student_id] = "Already Marked Today"
                        print(f"[BACKGROUND-WORKER] NOTICE: Attendance already recorded today for {student_id}")
            except Exception as e:
                print(f"[BACKGROUND-WORKER] ERROR for {student_id}: {e}")
                with attendance_lock:
                    marked_students_status[student_id] = "Network Error"
            finally:
                with attendance_lock:
                    pending_attendance_ids.discard(student_id)
                attendance_queue.task_done()
        except Exception as e:
            print(f"[BACKGROUND-WORKER] Unexpected error: {e}")


# Start daemon worker thread at module import
worker_thread = threading.Thread(target=attendance_worker, daemon=True)
worker_thread.start()


# ---------------------------------------------------------------------------
# Camera Recovery Helper (Instruction 28)
# ---------------------------------------------------------------------------
def open_camera(index: int) -> cv2.VideoCapture:
    """Configures camera with 640x480 resolution (Instruction 11)."""
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        raise RuntimeError(f"[ERROR] Camera index {index} could not be opened.")

    # Optimized capture dimensions: 640x480
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    print(f"[INFO] Camera opened successfully (index={index}, resolution=640x480)")
    return cap


def build_cache_with_retry() -> bool:
    for attempt in range(1, BACKEND_STARTUP_RETRIES + 1):
        try:
            print(f"[INFO] Connecting to backend (attempt {attempt}/{BACKEND_STARTUP_RETRIES})...")
            build_cache()
            print("[INFO] Student cache built successfully.")
            return True
        except Exception as e:
            print(f"[WARN] Backend not reachable: {e}")
            if attempt < BACKEND_STARTUP_RETRIES:
                time.sleep(BACKEND_RETRY_DELAY)
    return False


def main():
    if not build_cache_with_retry():
        print("[ERROR] Attendance service cannot start — backend unavailable.")
        return

    gallery = load_students()
    if gallery.num_students == 0:
        print("[ERROR] No students found in cache. Register students first via admin panel.")
        return

    try:
        cap = open_camera(CAMERA_INDEX)
    except RuntimeError as e:
        print(e)
        return

    last_seen = {}
    vote_buffer = defaultdict(lambda: deque(maxlen=VOTING_WINDOW))
    similarity_buffer = defaultdict(lambda: deque(maxlen=VOTING_WINDOW))

    blink_detector = BlinkDetector()

    frame_count = 0
    consecutive_failures = 0
    last_cache_mtime = os.path.getmtime(CACHE_PATH) if os.path.exists(CACHE_PATH) else 0
    last_cache_check = time.time()
    last_perf_log = time.time()

    cached_results: List[Dict[str, Any]] = []

    print("=" * 65)
    print("AI BIOMETRIC ATTENDANCE SERVICE (HIGH-PERFORMANCE RUNNER)")
    print(f"Device: {device.upper()} | FaceNet: Inception-ResNet-v1 | MTCNN: Aligned 160x160")
    print(f"Threshold: {FACE_THRESHOLD} | Min Margin: {MIN_MATCH_MARGIN}")
    print(f"Intervals -> Detection: every {DETECTION_INTERVAL} frames | Embedding: every {RECOGNITION_INTERVAL} frames")
    print("Press 'q' in camera window to exit.")
    print("=" * 65)

    fps_tracker = deque(maxlen=30)

    while True:
        t_frame_start = time.perf_counter()
        ret, frame = cap.read()

        if not ret:
            consecutive_failures += 1
            if consecutive_failures % 5 == 1:
                print(f"[WARN] Camera read dropped (count={consecutive_failures})")

            if consecutive_failures < CAMERA_READ_RETRIES:
                time.sleep(CAMERA_RETRY_DELAY)
                continue

            # Sustained failure -> reconnect
            print("[WARN] Sustained camera failure. Attempting reconnect...")
            cap.release()
            reconnected = False
            for attempt in range(1, CAMERA_RECONNECT_ATTEMPTS + 1):
                time.sleep(CAMERA_RECONNECT_DELAY)
                try:
                    cap = open_camera(CAMERA_INDEX)
                    consecutive_failures = 0
                    reconnected = True
                    print("[INFO] Camera reconnected successfully.")
                    break
                except RuntimeError:
                    pass

            if not reconnected:
                print("[FATAL] Camera could not be reconnected. Shutting down.")
                break
            continue

        consecutive_failures = 0
        frame_count += 1
        now = time.time()

        # Rate-limited cache check (every CACHE_RELOAD_INTERVAL seconds) (Instruction 30)
        if now - last_cache_check >= CACHE_RELOAD_INTERVAL:
            last_cache_check = now
            if os.path.exists(CACHE_PATH):
                try:
                    mtime = os.path.getmtime(CACHE_PATH)
                    if mtime > last_cache_mtime:
                        load_students()
                        last_cache_mtime = mtime
                        print(f"[INFO] Automatically reloaded student gallery ({gallery.num_students} students)")
                except Exception as e:
                    print(f"[WARN] Cache reload check error: {e}")

        # Decoupled Pipeline Execution (Instructions 7, 8, 9)
        should_detect = (frame_count % DETECTION_INTERVAL == 0) or (len(cached_results) == 0)
        should_embed = (frame_count % RECOGNITION_INTERVAL == 0)
        should_liveness = (frame_count % LIVENESS_INTERVAL == 0)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        timing_stats = {}

        if should_detect or should_embed:
            results, timing_stats = recognize_faces_optimized(
                rgb,
                gallery=gallery,
                force_detect=should_detect,
                force_embed=should_embed,
                threshold=FACE_THRESHOLD,
                min_margin=MIN_MATCH_MARGIN
            )
            cached_results = results
        else:
            results = cached_results

        # Liveness conditional on detected face (Instruction 22)
        blinked = False
        t_liveness_start = time.perf_counter()

        # Multiple faces check in student mode (Instruction 16)
        multiple_faces_present = len(results) > 1

        primary_face = results[0] if results else None
        if primary_face and should_liveness:
            # Crop ROI before passing to FaceMesh (Instruction 21)
            blinked = blink_detector.process(
                frame,
                bbox=primary_face["box"],
                student_id=primary_face.get("student_id")
            )
        timing_stats["liveness_ms"] = round((time.perf_counter() - t_liveness_start) * 1000, 2)

        recognized_ids_this_frame = set()

        for r in results:
            x1, y1, x2, y2 = r["box"]
            sid = r.get("student_id")
            name = r.get("name")
            sim = r.get("similarity", 0.0)
            is_recognized = r.get("recognized", False)

            if is_recognized and sid:
                recognized_ids_this_frame.add(sid)
                vote_buffer[sid].append(True)
                similarity_buffer[sid].append(sim)
            else:
                if sid:
                    vote_buffer[sid].append(False)

            votes = sum(vote_buffer[sid]) if sid else 0
            avg_sim = float(np.mean(similarity_buffer[sid])) if (sid and similarity_buffer[sid]) else 0.0
            eligible = (votes >= MIN_VOTES) and (avg_sim >= MIN_AVG_SIMILARITY)
            cooldown_ok = (now - last_seen.get(sid, 0)) >= ATTENDANCE_COOLDOWN

            # Renamed confidence to similarity (Instruction 18)
            label = f"{name} | Sim: {sim:.2f}"
            box_color = (0, 255, 0) if is_recognized else (0, 165, 255)

            # Multiple faces warning (Instruction 16)
            if multiple_faces_present:
                box_color = (0, 0, 255)
                label = "Multiple faces detected! Only 1 person permitted"

            # Attendance Check-in Decision Gate
            elif eligible and cooldown_ok and sid:
                with attendance_lock:
                    is_pending = sid in pending_attendance_ids
                    status_text = marked_students_status.get(sid)

                if is_pending:
                    label += " | Verifying with Server..."
                elif status_text:
                    label += f" | {status_text}"
                elif blinked:
                    # Non-blocking dispatch to background thread (Instruction 26 & 27)
                    with attendance_lock:
                        if sid not in pending_attendance_ids:
                            pending_attendance_ids.add(sid)
                            attendance_queue.put((sid, name))
                            last_seen[sid] = now
                            vote_buffer[sid].clear()
                            similarity_buffer[sid].clear()
                            blink_detector.reset()
                            label += " | Marking Present..."
                else:
                    label += " | Blink to Confirm 👁️"

            # Render Bounding Box and Telemetry
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            cv2.rectangle(frame, (x1, max(0, y1 - 26)), (x2, y1), box_color, -1)
            cv2.putText(
                frame,
                label,
                (x1 + 4, max(y1 - 7, 14)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (0, 0, 0),
                2,
            )
            cv2.putText(
                frame,
                label,
                (x1 + 4, max(y1 - 7, 14)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (255, 255, 255),
                1,
            )

        # Decay votes for missing students
        for tracked_sid in list(vote_buffer.keys()):
            if tracked_sid not in recognized_ids_this_frame:
                vote_buffer[tracked_sid].append(False)

        # Measure frame rate
        t_total = (time.perf_counter() - t_frame_start) * 1000
        current_fps = 1000.0 / t_total if t_total > 0 else 0.0
        fps_tracker.append(current_fps)
        avg_fps = np.mean(fps_tracker) if fps_tracker else 0.0

        # Performance Mode Logging (Instruction 34)
        if PERFORMANCE_MODE and (now - last_perf_log >= 2.0):
            last_perf_log = now
            det_ms = timing_stats.get("detection_ms", 0.0)
            emb_ms = timing_stats.get("embedding_ms", 0.0)
            mat_ms = timing_stats.get("matching_ms", 0.0)
            liv_ms = timing_stats.get("liveness_ms", 0.0)
            print(
                f"[PERF] FPS: {avg_fps:4.1f} | Det: {det_ms:5.1f}ms | "
                f"Embed: {emb_ms:5.1f}ms | Match: {mat_ms:4.1f}ms | "
                f"Liveness: {liv_ms:4.1f}ms | Total: {t_total:5.1f}ms"
            )

        # Draw HUD Telemetry Header
        hud_text = f"FPS: {avg_fps:.1f} | Tracked: {len(results)} | Threshold: {FACE_THRESHOLD}"
        cv2.putText(frame, hud_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)

        cv2.imshow("Attendance Camera (Optimized)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("[INFO] Exiting attendance camera...")
            break

    # Cleanup
    attendance_queue.put(None)
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
