import mediapipe as mp
import numpy as np
import cv2
import time
from math import dist

mp_face_mesh = mp.solutions.face_mesh

# Eye landmark indices (MediaPipe standard)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

EYE_AR_THRESHOLD = 0.20
BLINK_CONSEC_FRAMES = 2

def eye_aspect_ratio(eye_points, landmarks):
    p1 = landmarks[eye_points[1]]
    p2 = landmarks[eye_points[5]]
    p3 = landmarks[eye_points[2]]
    p4 = landmarks[eye_points[4]]
    p5 = landmarks[eye_points[0]]
    p6 = landmarks[eye_points[3]]

    vertical1 = dist(p1, p2)
    vertical2 = dist(p3, p4)
    horizontal = dist(p5, p6)

    if horizontal < 1e-6:
        return 0.3
    return (vertical1 + vertical2) / (2.0 * horizontal)


class BlinkDetector:
    """
    High-Performance ROI-Cropped Blink & Liveness Detector
    - Evaluates FaceMesh ONLY on the cropped face ROI (not the full camera frame)
    - Enforces state machine: IDLE -> FACE_DETECTED -> BLINK_REQUIRED -> BLINK_CONFIRMED
    - Auto-resets upon student identity change or timeout expiration
    """
    def __init__(self, timeout_seconds: float = 10.0):
        self.face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.blink_counter = 0
        self.blinked = False
        self.timeout_seconds = timeout_seconds
        self.last_face_time = time.time()
        self.active_identity = None
        self.state = "IDLE"

    def reset(self, new_identity: str = None):
        self.blink_counter = 0
        self.blinked = False
        self.active_identity = new_identity
        self.last_face_time = time.time()
        self.state = "IDLE" if not new_identity else "FACE_DETECTED"

    def process(self, frame, bbox=None, student_id: str = None) -> bool:
        """
        Processes frame for blink liveness.
        If bbox is provided, extracts and runs FaceMesh ONLY on the face ROI.
        """
        now = time.time()

        # Security check: reset if student identity changes
        if student_id and student_id != self.active_identity:
            self.reset(student_id)

        # Timeout check: reset if student takes longer than timeout without completing blink
        if now - self.last_face_time > self.timeout_seconds:
            self.reset(student_id)

        self.last_face_time = now

        # Extract face ROI if bbox given
        if bbox is not None:
            h_frame, w_frame = frame.shape[:2]
            x1, y1, x2, y2 = [int(v) for v in bbox]

            # 20% margin around face to ensure full eye contour capture
            bw, bh = x2 - x1, y2 - y1
            mx = int(bw * 0.20)
            my = int(bh * 0.20)
            cx1 = max(0, x1 - mx)
            cy1 = max(0, y1 - my)
            cx2 = min(w_frame, x2 + mx)
            cy2 = min(h_frame, y2 + my)

            roi = frame[cy1:cy2, cx1:cx2]
            if roi.size == 0 or roi.shape[0] < 20 or roi.shape[1] < 20:
                self.blink_counter = 0
                return self.blinked
            process_img = roi
        else:
            process_img = frame

        rgb = cv2.cvtColor(process_img, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            self.blink_counter = 0
            return self.blinked

        landmarks = results.multi_face_landmarks[0].landmark
        h, w = process_img.shape[:2]
        points = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]

        left_ear = eye_aspect_ratio(LEFT_EYE, points)
        right_ear = eye_aspect_ratio(RIGHT_EYE, points)
        ear = (left_ear + right_ear) / 2.0

        if ear < EYE_AR_THRESHOLD:
            self.blink_counter += 1
            self.state = "BLINK_REQUIRED"
        else:
            if self.blink_counter >= BLINK_CONSEC_FRAMES:
                self.blinked = True
                self.state = "BLINK_CONFIRMED"
            self.blink_counter = 0

        return self.blinked
