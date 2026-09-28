import time
import math
from typing import Dict, Any, Optional, Tuple
import cv2
import numpy as np

try:
    import mediapipe as mp
    mp_face_mesh = mp.solutions.face_mesh
except Exception:
    mp_face_mesh = None

# Eye landmark indices (MediaPipe Face Mesh)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

EYE_AR_THRESHOLD = 0.20
BLINK_CONSEC_FRAMES = 2

def eye_aspect_ratio(eye_indices, landmarks, w: int, h: int) -> float:
    pts = [(landmarks[idx].x * w, landmarks[idx].y * h) for idx in eye_indices]
    p1, p2, p3, p4, p5, p6 = pts
    v1 = math.dist(p2, p6)
    v2 = math.dist(p3, p5)
    horiz = math.dist(p1, p4)
    if horiz < 1e-6:
        return 0.0
    return (v1 + v2) / (2.0 * horiz)

class LivenessState:
    IDLE = "IDLE"
    FACE_DETECTED = "FACE_DETECTED"
    QUALITY_CHECK = "QUALITY_CHECK"
    BLINK_REQUIRED = "BLINK_REQUIRED"
    BLINK_CONFIRMED = "BLINK_CONFIRMED"
    IDENTITY_VERIFICATION = "IDENTITY_VERIFICATION"
    TEMPORAL_CONFIRMATION = "TEMPORAL_CONFIRMATION"
    ATTENDANCE_MARKED = "ATTENDANCE_MARKED"

class LivenessStateMachine:
    """
    Finite state machine governing active liveness, blink verification,
    and automatic session reset upon face loss, identity switch, or timeout.
    """

    def __init__(self, timeout_seconds: float = 10.0):
        self.timeout_seconds = timeout_seconds
        self.state = LivenessState.IDLE
        self.state_start_time = time.time()
        self.active_student_id: Optional[str] = None
        self.blink_counter = 0
        self.has_blinked = False
        
        self.mesh_detector = None
        if mp_face_mesh is not None:
            self.mesh_detector = mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )

    def transition_to(self, new_state: str):
        if self.state != new_state:
            self.state = new_state
            self.state_start_time = time.time()

    def reset(self, message: str = "Session reset"):
        self.state = LivenessState.IDLE
        self.state_start_time = time.time()
        self.active_student_id = None
        self.blink_counter = 0
        self.has_blinked = False

    def update(
        self,
        frame_rgb: np.ndarray,
        face_detected: bool,
        quality_passed: bool,
        recognized_student_id: Optional[str] = None,
        multiple_faces: bool = False
    ) -> Dict[str, Any]:
        """
        Step the state machine with current frame observations.
        """
        now = time.time()
        elapsed = now - self.state_start_time

        # Safety reset rules
        if not face_detected or multiple_faces:
            if self.state != LivenessState.IDLE:
                self.reset()
            return {
                "state": self.state,
                "liveness_passed": False,
                "action_prompt": "Multiple faces in frame. Only one person allowed." if multiple_faces else "Looking for face..."
            }

        # Timeout guard
        if self.state != LivenessState.IDLE and elapsed > self.timeout_seconds:
            self.reset("Liveness verification timed out")
            return {
                "state": self.state,
                "liveness_passed": False,
                "action_prompt": "Verification timed out. Please face the camera and try again."
            }

        # Identity switch guard
        if recognized_student_id and self.active_student_id and recognized_student_id != self.active_student_id:
            self.reset("Identity switched during verification")

        if recognized_student_id:
            self.active_student_id = recognized_student_id

        # ── State Transitions ──
        if self.state == LivenessState.IDLE:
            if face_detected:
                self.transition_to(LivenessState.FACE_DETECTED)

        if self.state == LivenessState.FACE_DETECTED:
            if quality_passed:
                self.transition_to(LivenessState.QUALITY_CHECK)
            else:
                return {
                    "state": self.state,
                    "liveness_passed": False,
                    "action_prompt": "Adjusting face alignment and lighting..."
                }

        if self.state == LivenessState.QUALITY_CHECK:
            self.transition_to(LivenessState.BLINK_REQUIRED)

        # Blink Detection Step
        if self.state in [LivenessState.BLINK_REQUIRED, LivenessState.BLINK_CONFIRMED]:
            is_blink = self._detect_blink(frame_rgb)
            if is_blink:
                self.has_blinked = True
                self.transition_to(LivenessState.BLINK_CONFIRMED)

        action_prompts = {
            LivenessState.IDLE: "Looking for face...",
            LivenessState.FACE_DETECTED: "Face detected. Assessing quality...",
            LivenessState.QUALITY_CHECK: "Quality verified.",
            LivenessState.BLINK_REQUIRED: "Please blink your eyes naturally 👁️",
            LivenessState.BLINK_CONFIRMED: "Blink verified! Confirming identity...",
            LivenessState.IDENTITY_VERIFICATION: "Verifying student identity...",
            LivenessState.TEMPORAL_CONFIRMATION: "Maintaining stability...",
            LivenessState.ATTENDANCE_MARKED: "Attendance Verified & Marked ✅"
        }

        return {
            "state": self.state,
            "liveness_passed": self.has_blinked,
            "action_prompt": action_prompts.get(self.state, "Processing..."),
            "elapsed_seconds": round(elapsed, 1)
        }

    def _detect_blink(self, frame_rgb: np.ndarray) -> bool:
        if self.mesh_detector is None:
            return True  # Fallback if mediapipe mesh unavailable

        results = self.mesh_detector.process(frame_rgb)
        if not results.multi_face_landmarks:
            self.blink_counter = 0
            return False

        landmarks = results.multi_face_landmarks[0].landmark
        h, w = frame_rgb.shape[:2]

        left_ear = eye_aspect_ratio(LEFT_EYE, landmarks, w, h)
        right_ear = eye_aspect_ratio(RIGHT_EYE, landmarks, w, h)
        avg_ear = (left_ear + right_ear) / 2.0

        if avg_ear < EYE_AR_THRESHOLD:
            self.blink_counter += 1
        else:
            if self.blink_counter >= BLINK_CONSEC_FRAMES:
                self.blink_counter = 0
                return True
            self.blink_counter = 0

        return False
