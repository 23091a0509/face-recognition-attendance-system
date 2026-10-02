try:
    import cv2
except ImportError:
    cv2 = None
import numpy as np
from typing import Dict, Any, Tuple, Optional

class FaceQualityChecker:
    """
    Evaluates multi-factor image and facial quality for enrollment and live recognition:
    - Resolution / face size
    - Blur via Laplacian variance
    - Lighting (brightness & contrast)
    - Head pose / facial landmark symmetry
    - Centering
    """

    def __init__(
        self,
        min_face_size: int = 50,
        min_blur_var: float = 20.0,
        min_brightness: float = 30.0,
        max_brightness: float = 245.0,
        min_contrast: float = 15.0
    ):
        self.min_face_size = min_face_size
        self.min_blur_var = min_blur_var
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.min_contrast = min_contrast

    def evaluate(
        self,
        image_rgb: np.ndarray,
        box: Tuple[float, float, float, float],
        landmarks: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """
        Evaluates a detected face patch within image_rgb.
        box: (x1, y1, x2, y2)
        landmarks: shape (5, 2) optional 5-point facial landmarks
        Returns a dictionary containing quality metrics, pass/fail boolean, and user message.
        """
        img_h, img_w = image_rgb.shape[:2]
        x1, y1, x2, y2 = [int(round(b)) for b in box]
        
        # Clamp to image boundaries
        x1 = max(0, min(x1, img_w - 1))
        y1 = max(0, min(y1, img_h - 1))
        x2 = max(x1 + 1, min(x2, img_w))
        y2 = max(y1 + 1, min(y2, img_h))

        face_w = x2 - x1
        face_h = y2 - y1

        # 1. Size Check
        if face_w < self.min_face_size or face_h < self.min_face_size:
            return {
                "valid": False,
                "quality_score": round(max(0.1, min(face_w, face_h) / self.min_face_size * 0.4), 2),
                "message": "Move closer to the camera",
                "reason": "face_too_small",
                "metrics": {"face_width": face_w, "face_height": face_h}
            }

        size_score = min(1.0, max(0.0, (min(face_w, face_h) - self.min_face_size) / 120.0))

        # Crop face region
        face_patch = image_rgb[y1:y2, x1:x2]
        if face_patch.size == 0:
            return {
                "valid": False,
                "quality_score": 0.0,
                "message": "Face out of frame boundaries",
                "reason": "empty_crop"
            }

        if cv2 is not None:
            face_gray = cv2.cvtColor(face_patch, cv2.COLOR_RGB2GRAY)
        else:
            if face_patch.ndim == 3 and face_patch.shape[2] >= 3:
                face_gray = np.dot(face_patch[..., :3].astype(np.float64), [0.299, 0.587, 0.114])
            else:
                face_gray = face_patch.astype(np.float64)

        # 2. Lighting Assessment
        mean_lum = float(np.mean(face_gray))
        std_lum = float(np.std(face_gray))

        if mean_lum < self.min_brightness:
            return {
                "valid": False,
                "quality_score": round(max(0.1, mean_lum / self.min_brightness * 0.4), 2),
                "message": "Lighting too dark, please face a light source",
                "reason": "too_dark",
                "metrics": {"brightness": round(mean_lum, 1)}
            }
        if mean_lum > self.max_brightness:
            return {
                "valid": False,
                "quality_score": round(max(0.1, (255 - mean_lum) / 15.0 * 0.4), 2),
                "message": "Lighting overexposed, please adjust angle",
                "reason": "too_bright",
                "metrics": {"brightness": round(mean_lum, 1)}
            }

        lighting_score = min(1.0, max(0.0, 1.0 - abs(mean_lum - 128.0) / 110.0))
        contrast_score = min(1.0, max(0.0, std_lum / 50.0))

        # 3. Blur Assessment (Laplacian Variance)
        if cv2 is not None:
            blur_var = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
        else:
            if face_gray.shape[0] >= 3 and face_gray.shape[1] >= 3:
                lap = (
                    face_gray[:-2, 1:-1] +
                    face_gray[2:, 1:-1] +
                    face_gray[1:-1, :-2] +
                    face_gray[1:-1, 2:] -
                    4.0 * face_gray[1:-1, 1:-1]
                )
                blur_var = float(np.var(lap))
            else:
                blur_var = 0.0
        if blur_var < self.min_blur_var:
            return {
                "valid": False,
                "quality_score": round(min(0.45, blur_var / self.min_blur_var * 0.5), 2),
                "message": "Image is blurry, please hold still",
                "reason": "image_blurry",
                "metrics": {"blur_variance": round(blur_var, 1)}
            }
        blur_score = min(1.0, max(0.0, blur_var / 150.0))

        # 4. Pose & Landmark Geometry (if landmarks provided)
        pose_score = 1.0
        if landmarks is not None and len(landmarks) >= 5:
            # landmarks: [left_eye, right_eye, nose, left_mouth, right_mouth]
            left_eye = landmarks[0]
            right_eye = landmarks[1]
            eye_dx = right_eye[0] - left_eye[0]
            eye_dy = right_eye[1] - left_eye[1]
            eye_dist = np.hypot(eye_dx, eye_dy)

            if eye_dist > 1e-3:
                eye_tilt = abs(eye_dy) / eye_dist
                if eye_tilt > 0.35:
                    return {
                        "valid": False,
                        "quality_score": 0.4,
                        "message": "Please look directly at the camera",
                        "reason": "excessive_head_tilt",
                        "metrics": {"eye_tilt": round(float(eye_tilt), 2)}
                    }
                pose_score = max(0.0, 1.0 - eye_tilt * 2.0)

        # 5. Centering Score
        face_cx = (x1 + x2) / 2.0
        face_cy = (y1 + y2) / 2.0
        dist_from_center_x = abs(face_cx - (img_w / 2.0)) / (img_w / 2.0)
        dist_from_center_y = abs(face_cy - (img_h / 2.0)) / (img_h / 2.0)
        centering_score = max(0.0, 1.0 - (dist_from_center_x * 0.5 + dist_from_center_y * 0.5))

        # Composite Normalized Quality Score in [0, 1]
        composite_quality = (
            0.25 * size_score +
            0.30 * blur_score +
            0.25 * (lighting_score * 0.7 + contrast_score * 0.3) +
            0.10 * pose_score +
            0.10 * centering_score
        )
        composite_quality = round(float(np.clip(composite_quality, 0.0, 1.0)), 2)

        return {
            "valid": True,
            "quality_score": composite_quality,
            "message": "Quality optimal",
            "reason": "pass",
            "metrics": {
                "face_size": (face_w, face_h),
                "blur_variance": round(blur_var, 1),
                "brightness": round(mean_lum, 1),
                "contrast": round(std_lum, 1)
            }
        }
