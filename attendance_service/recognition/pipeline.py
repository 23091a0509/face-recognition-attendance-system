import time
import numpy as np
from PIL import Image
from typing import Dict, List, Optional, Any, Union

from .detector import FaceDetector
from .embedder import FaceEmbedder
from .quality import FaceQualityChecker
from .matcher import FaceMatcher
from .temporal import TemporalSmoother, TemporalVerifier
from .liveness import LivenessStateMachine

class RecognitionPipeline:
    """
    Canonical End-to-End Recognition Pipeline:
    Frame -> Resize -> Quality Pre-check -> MTCNN Detect -> FaceNet Embed ->
    L2 Normalize -> Multi-embedding Match -> Top-1/Top-2 Margin ->
    Temporal Consistency -> Liveness Verification -> Standardized Output.
    """

    def __init__(
        self,
        threshold: Optional[float] = None,
        min_margin: Optional[float] = None,
        required_consistent_frames: int = 3,
        window_seconds: float = 2.0,
        enable_liveness: bool = True
    ):
        self.detector = FaceDetector()
        self.embedder = FaceEmbedder()
        self.quality_checker = FaceQualityChecker()
        self.matcher = FaceMatcher(threshold=threshold, min_margin=min_margin)
        self.smoother = TemporalSmoother(window_size=7)
        self.verifier = TemporalVerifier(
            required_consistent_frames=required_consistent_frames,
            time_window_seconds=window_seconds
        )
        self.enable_liveness = enable_liveness
        self.liveness_machine = LivenessStateMachine() if enable_liveness else None

    def process(
        self,
        frame_input: Union[np.ndarray, Image.Image],
        gallery: Dict[str, Dict[str, Any]],
        target_student_id: Optional[str] = None,
        is_student_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Process a single image frame through the canonical pipeline.
        frame_input: numpy array (RGB) or PIL Image
        gallery: dict of enrolled students and their embeddings
        target_student_id: if checking for a specific student (1:1 personal mode)
        is_student_mode: True for student self-attendance, enforcing single-face constraint
        """
        t0 = time.time()

        if isinstance(frame_input, np.ndarray):
            # Assumed RGB numpy array
            frame_rgb = frame_input
            pil_img = Image.fromarray(frame_rgb)
        else:
            pil_img = frame_input.convert("RGB")
            frame_rgb = np.array(pil_img)

        # 1. Detection & Alignment
        boxes, probs, landmarks = self.detector.detect(pil_img)

        if boxes is None or len(boxes) == 0:
            if self.liveness_machine:
                self.liveness_machine.update(frame_rgb, False, False)
            self.smoother.update("NO_FACE")

            return {
                "success": True,
                "status": "NO_FACE",
                "face_detected": False,
                "face_count": 0,
                "recognized": False,
                "student_id": None,
                "name": None,
                "similarity": 0.0,
                "quality_score": 0.0,
                "liveness_passed": False,
                "stable_frames": 0,
                "attendance_marked": False,
                "message": "No face detected in camera frame",
                "latency_ms": round((time.time() - t0) * 1000, 1)
            }

        face_count = len(boxes)

        # In student personal attendance mode: strictly forbid multiple faces (Anti-Proxy)
        if is_student_mode and face_count > 1:
            if self.liveness_machine:
                self.liveness_machine.update(frame_rgb, True, False, multiple_faces=True)

            return {
                "success": True,
                "status": "MULTIPLE_FACES",
                "face_detected": True,
                "face_count": face_count,
                "recognized": False,
                "student_id": target_student_id,
                "name": None,
                "similarity": 0.0,
                "quality_score": 0.0,
                "liveness_passed": False,
                "stable_frames": 0,
                "attendance_marked": False,
                "message": f"Multiple faces ({face_count}) detected. Only the student should be visible in camera.",
                "latency_ms": round((time.time() - t0) * 1000, 1)
            }

        # 2. Quality Evaluation of Primary Face
        primary_box = boxes[0]
        primary_landmarks = landmarks[0] if (landmarks is not None and len(landmarks) > 0) else None
        quality_res = self.quality_checker.evaluate(frame_rgb, primary_box, primary_landmarks)

        if not quality_res["valid"]:
            return {
                "success": True,
                "status": "LOW_QUALITY",
                "face_detected": True,
                "face_count": face_count,
                "box": [float(b) for b in primary_box],
                "recognized": False,
                "student_id": target_student_id,
                "name": None,
                "similarity": 0.0,
                "quality_score": quality_res["quality_score"],
                "liveness_passed": False,
                "stable_frames": 0,
                "attendance_marked": False,
                "quality_warning": quality_res["message"],
                "message": quality_res["message"],
                "latency_ms": round((time.time() - t0) * 1000, 1)
            }

        # 3. Aligned Face Embedding Extraction
        aligned_faces = self.detector.extract_aligned(pil_img, boxes[:1])
        if aligned_faces is None or len(aligned_faces) == 0:
            return {
                "success": True,
                "status": "ALIGNMENT_FAILED",
                "face_detected": True,
                "face_count": face_count,
                "recognized": False,
                "message": "Face alignment failed. Please look directly at the camera.",
                "latency_ms": round((time.time() - t0) * 1000, 1)
            }

        query_emb = self.embedder.embed_tensor(aligned_faces[0])[0]

        # 4. Gallery Matching with Top-1 / Top-2 Margin & Unknown Triage
        match_res = self.matcher.match(
            query_embedding=query_emb,
            gallery=gallery,
            target_student_id=target_student_id
        )

        match_status = match_res.get("status")
        recognized_sid = match_res.get("student_id") if match_res.get("recognized") else None

        # 5. Liveness State Machine Step
        liveness_info = {"liveness_passed": True, "action_prompt": "Liveness active"}
        if self.enable_liveness and self.liveness_machine:
            liveness_info = self.liveness_machine.update(
                frame_rgb=frame_rgb,
                face_detected=True,
                quality_passed=True,
                recognized_student_id=recognized_sid
            )

        # 6. Temporal Consistency & Smoothing
        smoothed_id, stability = self.smoother.update(recognized_sid or match_status)

        is_temporally_verified = False
        stable_frame_count = 0
        if recognized_sid and (smoothed_id == recognized_sid):
            is_temporally_verified, stable_frame_count = self.verifier.record_match(recognized_sid)

        # 7. Final Status Determination
        final_status = "UNKNOWN"
        ready_for_attendance = False

        if match_status == "PROXY_MISMATCH":
            final_status = "PROXY_BLOCKED"
        elif match_status == "UNCERTAIN":
            final_status = "UNCERTAIN"
        elif match_status == "KNOWN" and recognized_sid:
            if not liveness_info["liveness_passed"]:
                final_status = "LIVENESS_REQUIRED"
            elif not is_temporally_verified:
                final_status = "VERIFYING_STABILITY"
            else:
                final_status = "RECOGNIZED"
                ready_for_attendance = True

        total_latency = round((time.time() - t0) * 1000, 1)

        return {
            "success": True,
            "status": final_status,
            "face_detected": True,
            "face_count": face_count,
            "box": [float(b) for b in primary_box],
            "recognized": final_status == "RECOGNIZED",
            "ready_for_attendance": ready_for_attendance,
            "student_id": match_res.get("student_id"),
            "name": match_res.get("name"),
            "department": match_res.get("department"),
            "detected_other_id": match_res.get("detected_student_id"),
            "detected_other_name": match_res.get("detected_name"),
            "mismatch": match_res.get("mismatch", False),
            "similarity": match_res.get("similarity_score", 0.0),
            "margin": match_res.get("margin", 0.0),
            "quality_score": quality_res["quality_score"],
            "liveness_passed": liveness_info["liveness_passed"],
            "liveness_state": liveness_info.get("state"),
            "action_prompt": liveness_info.get("action_prompt"),
            "stable_frames": stable_frame_count,
            "stability_score": stability,
            "attendance_marked": False,
            "message": match_res.get("message") or liveness_info.get("action_prompt"),
            "latency_ms": total_latency
        }
