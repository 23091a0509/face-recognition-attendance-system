import os
import time
import pickle
import numpy as np
import torch
import cv2
from PIL import Image
from typing import Dict, List, Tuple, Optional, Any
from facenet_pytorch import MTCNN, InceptionResnetV1

from config import (
    FACE_THRESHOLD,
    MIN_MATCH_MARGIN,
    MIN_FACE_SIZE,
    MIN_BLUR_VAR,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    TRACKER_IOU_THRESHOLD,
    IDENTITY_CACHE_SECONDS,
)

# ---------------------------------------------------------------------------
# Device & Model Singletons (Instructions 31 & 32)
# ---------------------------------------------------------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[INFO] Face Recognition Device: {device.upper()}")

mtcnn = MTCNN(
    image_size=160,
    margin=20,
    keep_all=True,
    min_face_size=MIN_FACE_SIZE,
    factor=0.709,
    thresholds=[0.6, 0.7, 0.7],
    device=device
)

facenet = InceptionResnetV1(
    pretrained="vggface2"
).eval().to(device)

# ---------------------------------------------------------------------------
# Model Warmup (Instruction 33)
# ---------------------------------------------------------------------------
try:
    dummy = torch.randn(1, 3, 160, 160, device=device)
    with torch.no_grad():
        _ = facenet(dummy)
    if device == "cuda":
        torch.cuda.synchronize()
    print("[INFO] FaceNet model warmup completed.")
except Exception as e:
    print(f"[WARN] FaceNet warmup failed: {e}")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(BASE_DIR, "students_cache.pkl")


# ---------------------------------------------------------------------------
# Optimized Student Gallery Representation (Instructions 3, 4, 5)
# Normalizes once into a single continuous PyTorch tensor on target device.
# ---------------------------------------------------------------------------
class StudentGallery:
    def __init__(self):
        self.student_ids: List[str] = []
        self.student_names: List[str] = []
        self.student_depts: List[str] = []
        # Mapping from row index in sample_matrix to student_index in student_ids
        self.sample_to_student: List[int] = []
        # Normalized continuous tensor of shape (Total_Samples, 512)
        self.sample_matrix: Optional[torch.Tensor] = None
        self.num_students: int = 0
        self.num_samples: int = 0

    def build_from_cache(self, cache_data: List[Dict[str, Any]]) -> bool:
        """
        Builds and L2-normalizes the entire gallery once into a single tensor on device.
        """
        self.student_ids = []
        self.student_names = []
        self.student_depts = []
        self.sample_to_student = []
        raw_samples = []

        student_idx = 0
        for s in cache_data:
            if not isinstance(s, dict):
                continue
            sid = s.get("student_id")
            if not sid or sid == "admin":
                continue

            name = s.get("name", sid)
            dept = s.get("department", "General")

            # Collect all sample embeddings for this student
            samples = []
            if "embeddings" in s and s["embeddings"]:
                for e in s["embeddings"]:
                    arr = np.asarray(e, dtype=np.float32)
                    if arr.shape == (512,):
                        samples.append(arr)
            elif "embedding" in s and s["embedding"] is not None:
                arr = np.asarray(s["embedding"], dtype=np.float32)
                if arr.shape == (512,):
                    samples.append(arr)

            if not samples:
                continue

            self.student_ids.append(sid)
            self.student_names.append(name)
            self.student_depts.append(dept)

            for samp in samples:
                raw_samples.append(samp)
                self.sample_to_student.append(student_idx)

            student_idx += 1

        self.num_students = len(self.student_ids)
        self.num_samples = len(raw_samples)

        if self.num_samples == 0:
            self.sample_matrix = None
            return False

        # Convert to single PyTorch tensor on target device (Instruction 5)
        matrix = torch.from_numpy(np.array(raw_samples, dtype=np.float32)).to(device)
        # L2-normalize all stored embeddings once (Instruction 4)
        norm = matrix.norm(dim=-1, keepdim=True).clamp(min=1e-9)
        self.sample_matrix = matrix / norm
        return True

    def match_batch(
        self,
        query_embeddings: torch.Tensor,
        threshold: float = FACE_THRESHOLD,
        min_margin: float = MIN_MATCH_MARGIN
    ) -> List[Dict[str, Any]]:
        """
        Matches batch of live face embeddings against database gallery using
        a single vectorized matrix multiplication on target device (Instructions 3, 5, 17).
        """
        if self.sample_matrix is None or self.num_students == 0:
            return [{"recognized": False, "student_id": None, "name": None, "similarity": 0.0, "status": "UNKNOWN"}] * len(query_embeddings)

        # Vectorized dot products: (num_faces, num_samples)
        # Both query_embeddings and self.sample_matrix are unit vectors
        scores_matrix = torch.matmul(query_embeddings, self.sample_matrix.T)

        results = []
        for face_idx in range(len(query_embeddings)):
            face_scores = scores_matrix[face_idx]

            # Aggregate best sample score per distinct student
            student_best = {}
            for sample_idx, student_idx in enumerate(self.sample_to_student):
                sc = float(face_scores[sample_idx].item())
                if student_idx not in student_best or sc > student_best[student_idx]:
                    student_best[student_idx] = sc

            # Sort students by similarity score descending
            sorted_students = sorted(student_best.items(), key=lambda x: x[1], reverse=True)

            if not sorted_students:
                results.append({"recognized": False, "student_id": None, "name": None, "similarity": 0.0, "status": "UNKNOWN"})
                continue

            best_idx, best_score = sorted_students[0]
            second_score = sorted_students[1][1] if len(sorted_students) > 1 else -1.0
            margin = (best_score - second_score) if second_score > -1.0 else 1.0

            # Round to 3 decimal places
            best_score = round(float(best_score), 3)
            margin = round(float(margin), 3)

            best_sid = self.student_ids[best_idx]
            best_name = self.student_names[best_idx]
            best_dept = self.student_depts[best_idx]

            # Margin check and threshold verification (Instruction 17)
            if best_score >= threshold and margin >= min_margin:
                results.append({
                    "recognized": True,
                    "student_id": best_sid,
                    "name": best_name,
                    "department": best_dept,
                    "similarity": best_score,
                    "margin": margin,
                    "status": "KNOWN"
                })
            elif best_score >= (threshold - 0.08):
                results.append({
                    "recognized": False,
                    "candidate_student_id": best_sid,
                    "candidate_name": best_name,
                    "similarity": best_score,
                    "margin": margin,
                    "status": "UNCERTAIN"
                })
            else:
                results.append({
                    "recognized": False,
                    "student_id": None,
                    "name": None,
                    "similarity": best_score,
                    "margin": margin,
                    "status": "UNKNOWN"
                })

        return results


# Global in-memory student gallery
student_gallery = StudentGallery()


# ---------------------------------------------------------------------------
# Load students from cache (Instruction 29)
# ---------------------------------------------------------------------------
def load_students() -> StudentGallery:
    if not os.path.exists(CACHE_PATH):
        print("[WARN] Cache file not found")
        return student_gallery

    try:
        with open(CACHE_PATH, "rb") as f:
            data = pickle.load(f)
        student_gallery.build_from_cache(data)
        print(f"[INFO] Loaded {student_gallery.num_students} students ({student_gallery.num_samples} samples) into memory tensor.")
    except Exception as e:
        print(f"[WARN] Failed to load cache file: {e}")

    return student_gallery


# ---------------------------------------------------------------------------
# Lightweight Face Tracker with Identity Caching (Instructions 7, 9, 10)
# ---------------------------------------------------------------------------
def compute_iou(boxA, boxB) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(1, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(1, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))

    return float(interArea) / float(boxAArea + boxBArea - interArea)


class TrackedFace:
    def __init__(self, track_id: int, box: List[int]):
        self.track_id = track_id
        self.box = box
        self.identity: Optional[str] = None
        self.name: Optional[str] = None
        self.similarity: float = 0.0
        self.margin: float = 0.0
        self.recognized: bool = False
        self.last_verified_time: float = 0.0
        self.stable_count: int = 1
        self.consecutive_misses: int = 0

    def update_box(self, box: List[int]):
        self.box = box
        self.consecutive_misses = 0
        self.stable_count += 1

    def set_identity(self, sid: str, name: str, sim: float, margin: float, recognized: bool):
        self.identity = sid
        self.name = name
        self.similarity = sim
        self.margin = margin
        self.recognized = recognized
        self.last_verified_time = time.time()


class FaceTracker:
    def __init__(self, iou_thresh: float = TRACKER_IOU_THRESHOLD):
        self.tracks: Dict[int, TrackedFace] = {}
        self.next_id = 1
        self.iou_thresh = iou_thresh

    def update(self, detected_boxes: List[List[int]]) -> List[TrackedFace]:
        now = time.time()
        matched_track_ids = set()
        active_tracks = []

        for box in detected_boxes:
            best_iou = 0.0
            best_track_id = None

            for tid, track in self.tracks.items():
                if tid in matched_track_ids:
                    continue
                iou = compute_iou(box, track.box)
                if iou > best_iou:
                    best_iou = iou
                    best_track_id = tid

            if best_track_id is not None and best_iou >= self.iou_thresh:
                track = self.tracks[best_track_id]
                track.update_box(box)
                matched_track_ids.add(best_track_id)
                active_tracks.append(track)
            else:
                # New track
                new_track = TrackedFace(self.next_id, box)
                self.tracks[self.next_id] = new_track
                active_tracks.append(new_track)
                self.next_id += 1

        # Prune dead tracks
        for tid in list(self.tracks.keys()):
            if tid not in matched_track_ids and self.tracks[tid] not in active_tracks:
                self.tracks[tid].consecutive_misses += 1
                if self.tracks[tid].consecutive_misses > 5:
                    del self.tracks[tid]

        return active_tracks


face_tracker = FaceTracker()


# ---------------------------------------------------------------------------
# Face Quality Filter (Instructions 14 & 15)
# ---------------------------------------------------------------------------
def check_face_quality(frame: np.ndarray, box: List[int]) -> Tuple[bool, str]:
    x1, y1, x2, y2 = [int(v) for v in box]
    h_frame, w_frame = frame.shape[:2]

    # Boundary clamp
    x1 = max(0, min(x1, w_frame - 1))
    y1 = max(0, min(y1, h_frame - 1))
    x2 = max(x1 + 1, min(x2, w_frame))
    y2 = max(y1 + 1, min(y2, h_frame))

    w = x2 - x1
    h = y2 - y1

    if w < MIN_FACE_SIZE or h < MIN_FACE_SIZE:
        return False, "Move closer to camera"

    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return False, "Face out of frame"

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop

    # Brightness check
    mean_b = float(np.mean(gray))
    if mean_b < MIN_BRIGHTNESS:
        return False, "Lighting too dark"
    if mean_b > MAX_BRIGHTNESS:
        return False, "Lighting overexposed"

    # Laplacian blur check
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_var < MIN_BLUR_VAR:
        return False, "Hold still (blurry)"

    return True, "OK"


# ---------------------------------------------------------------------------
# Canonical Batch Recognition Pipeline (Instructions 2, 6, 9, 10, 11, 12, 17)
# ---------------------------------------------------------------------------
def recognize_faces_optimized(
    frame_rgb: np.ndarray,
    gallery: Optional[StudentGallery] = None,
    force_detect: bool = False,
    force_embed: bool = False,
    threshold: float = FACE_THRESHOLD,
    min_margin: float = MIN_MATCH_MARGIN
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """
    High-Performance Canonical Video Recognition:
    - BATCH FaceNet embeddings in ONE tensor call
    - Reuses tracked identities when spatially consistent
    - Skips full MTCNN and FaceNet when nothing changed
    - Returns recognized results and fine-grained latency telemetries
    """
    timing = {
        "detection_ms": 0.0,
        "extraction_ms": 0.0,
        "embedding_ms": 0.0,
        "matching_ms": 0.0
    }

    gal = gallery if gallery is not None else student_gallery
    img_pil = Image.fromarray(frame_rgb)
    now = time.time()

    # 1. Detection
    t0 = time.perf_counter()
    boxes, _ = mtcnn.detect(img_pil)
    timing["detection_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    if boxes is None or len(boxes) == 0:
        return [], timing

    # Update tracker
    int_boxes = [[int(b) for b in box] for box in boxes]
    tracked_faces = face_tracker.update(int_boxes)

    # 2. Identify which faces actually need a new FaceNet embedding (Instruction 9)
    faces_to_embed = []
    indices_to_embed = []

    for idx, track in enumerate(tracked_faces):
        # Quality check
        quality_ok, q_msg = check_face_quality(frame_rgb, track.box)
        if not quality_ok:
            continue

        # Check if recent identity is cached and still valid (Instruction 10)
        cache_valid = (
            not force_embed and
            track.identity is not None and
            (now - track.last_verified_time) < IDENTITY_CACHE_SECONDS
        )

        if not cache_valid:
            indices_to_embed.append(idx)

    # 3. Extract & Align only faces that require recognition (Instructions 12 & 38)
    if indices_to_embed:
        boxes_to_extract = [boxes[i] for i in indices_to_embed]
        t0 = time.perf_counter()
        aligned_crops = mtcnn.extract(img_pil, boxes_to_extract, save_path=None)
        timing["extraction_ms"] = round((time.perf_counter() - t0) * 1000, 2)

        if aligned_crops is not None and len(aligned_crops) > 0:
            # 4. Batch FaceNet Inference in a SINGLE Tensor (Instruction 2)
            t0 = time.perf_counter()
            # Stack all face crops into one (B, 3, 160, 160) tensor
            faces_tensor = torch.stack([crop for crop in aligned_crops]).to(device)

            with torch.no_grad():
                raw_embeddings = facenet(faces_tensor)

            # L2-normalize live embeddings directly in PyTorch (Instruction 6)
            norm = raw_embeddings.norm(dim=-1, keepdim=True).clamp(min=1e-9)
            norm_embeddings = raw_embeddings / norm
            timing["embedding_ms"] = round((time.perf_counter() - t0) * 1000, 2)

            # 5. Vectorized Database Matching (Instructions 3, 5, 17)
            t0 = time.perf_counter()
            match_results = gal.match_batch(norm_embeddings, threshold=threshold, min_margin=min_margin)
            timing["matching_ms"] = round((time.perf_counter() - t0) * 1000, 2)

            # Update tracked face caches with new identities
            for crop_idx, track_idx in enumerate(indices_to_embed):
                if crop_idx < len(match_results):
                    m = match_results[crop_idx]
                    track = tracked_faces[track_idx]
                    track.set_identity(
                        sid=m.get("student_id"),
                        name=m.get("name"),
                        sim=m.get("similarity", 0.0),
                        margin=m.get("margin", 0.0),
                        recognized=m.get("recognized", False)
                    )

    # Build final response for all tracked faces
    results = []
    for track in tracked_faces:
        results.append({
            "track_id": track.track_id,
            "student_id": track.identity,
            "name": track.name or "Scanning...",
            "similarity": track.similarity,
            "margin": track.margin,
            "recognized": track.recognized,
            "box": track.box,
            "stable_count": track.stable_count
        })

    return results, timing


# Backward-compatible wrapper for legacy calls
def recognize_faces(frame_rgb, students=None, threshold=FACE_THRESHOLD):
    results, _ = recognize_faces_optimized(frame_rgb, threshold=threshold)
    legacy_format = []
    for r in results:
        if r.get("recognized"):
            legacy_format.append({
                "student_id": r["student_id"],
                "name": r["name"],
                "confidence": r["similarity"],
                "similarity": r["similarity"],
                "margin": r["margin"],
                "box": r["box"]
            })
    return legacy_format
