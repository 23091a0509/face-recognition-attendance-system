import os
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from .normalization import normalize_embedding, cosine_similarity

class FaceMatcher:
    """
    Gallery matcher supporting multiple embeddings per student with:
    - L2 normalized cosine similarity
    - Top-1 vs Top-2 margin check
    - Unknown vs Uncertain triage
    - Configurable calibration thresholds
    """

    def __init__(
        self,
        threshold: Optional[float] = None,
        min_margin: Optional[float] = None,
        aggregation: str = "max"  # "max" or "top_k_mean"
    ):
        # Read from environment with safe default fallback
        env_threshold = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.75"))
        env_margin = float(os.getenv("MIN_MATCH_MARGIN", "0.08"))

        self.threshold = threshold if threshold is not None else env_threshold
        self.min_margin = min_margin if min_margin is not None else env_margin
        self.aggregation = aggregation

    def match(
        self,
        query_embedding: np.ndarray,
        gallery: Dict[str, Dict[str, Any]],
        target_student_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Matches a query embedding against enrolled gallery.
        gallery: Dict mapping student_id to {
            "name": str,
            "department": str,
            "embeddings": List[np.ndarray] or 2D np.ndarray of shape (N, 512)
        }
        target_student_id: If provided (e.g. Student self-attendance), performs strict 1:1 check
                           and cross-checks against others for proxy detection.
        """
        norm_query = normalize_embedding(query_embedding).reshape(512)

        if not gallery:
            return {
                "status": "UNKNOWN",
                "recognized": False,
                "student_id": None,
                "name": None,
                "similarity_score": 0.0,
                "margin": 0.0,
                "message": "Gallery is empty. No students enrolled."
            }

        student_scores = []  # List of tuples: (score, student_id, name, department)

        for sid, record in gallery.items():
            stored_embs = record.get("embeddings")
            if stored_embs is None or len(stored_embs) == 0:
                continue

            stored_matrix = np.asarray(stored_embs, dtype=np.float32)
            if stored_matrix.ndim == 1:
                stored_matrix = stored_matrix.reshape(1, -1)
            stored_matrix = normalize_embedding(stored_matrix)

            # Vectorized dot products against all sample embeddings of this student
            sims = np.dot(stored_matrix, norm_query)

            if self.aggregation == "top_k_mean" and len(sims) >= 3:
                top_k = np.sort(sims)[-3:]
                score = float(np.mean(top_k))
            else:
                score = float(np.max(sims))

            student_scores.append((score, sid, record.get("name", sid), record.get("department", "General")))

        if not student_scores:
            return {
                "status": "UNKNOWN",
                "recognized": False,
                "student_id": None,
                "name": None,
                "similarity_score": 0.0,
                "margin": 0.0,
                "message": "No valid embeddings found in gallery."
            }

        # Sort descending by similarity score
        student_scores.sort(key=lambda x: x[0], reverse=True)

        best_score, best_sid, best_name, best_dept = student_scores[0]
        second_score = student_scores[1][0] if len(student_scores) > 1 else -1.0
        margin = (best_score - second_score) if second_score > -1.0 else 1.0

        # Round to 3 decimal places
        best_score = round(float(best_score), 3)
        margin = round(float(margin), 3)

        # -------------------------------------------------------------
        # SCENARIO A: Strict 1:1 Student Personal Mode
        # -------------------------------------------------------------
        if target_student_id:
            target_sid_clean = target_student_id.strip().upper()
            target_entry = next((s for s in student_scores if s[1].strip().upper() == target_sid_clean), None)

            if not target_entry:
                return {
                    "status": "NOT_ENROLLED",
                    "recognized": False,
                    "student_id": target_student_id,
                    "name": None,
                    "similarity_score": 0.0,
                    "margin": 0.0,
                    "message": f"Student account {target_student_id} has no registered face profile."
                }

            target_score, _, target_name, target_dept = target_entry
            target_score = round(float(target_score), 3)

            # 1. Check if the face belongs to a different student (Anti-Proxy)
            if best_sid.strip().upper() != target_sid_clean and best_score >= self.threshold:
                return {
                    "status": "PROXY_MISMATCH",
                    "recognized": False,
                    "student_id": target_student_id,
                    "name": target_name,
                    "detected_student_id": best_sid,
                    "detected_name": best_name,
                    "similarity_score": best_score,
                    "margin": margin,
                    "mismatch": True,
                    "message": f"Proxy attendance blocked: Face matches {best_name} ({best_sid}), but logged in as {target_name} ({target_student_id})."
                }

            # 2. Matches the logged-in student (Enforce S1 >= threshold AND margin >= min_margin)
            if best_sid.strip().upper() == target_sid_clean and target_score >= self.threshold and margin >= self.min_margin:
                return {
                    "status": "KNOWN",
                    "recognized": True,
                    "student_id": target_student_id,
                    "name": target_name,
                    "department": target_dept,
                    "similarity_score": target_score,
                    "margin": margin,
                    "mismatch": False,
                    "message": "Identity verified successfully"
                }

            # 3. Ambiguous match (Top score is above threshold but margin is too narrow)
            if target_score >= self.threshold and margin < self.min_margin:
                return {
                    "status": "UNCERTAIN",
                    "recognized": False,
                    "student_id": target_student_id,
                    "name": target_name,
                    "similarity_score": target_score,
                    "margin": margin,
                    "mismatch": False,
                    "message": f"Identity ambiguity detected (similarity {target_score}, margin {margin} < {self.min_margin}). Please face camera directly in good lighting."
                }

            # 4. Near-threshold match
            if target_score >= (self.threshold - 0.08):
                return {
                    "status": "UNCERTAIN",
                    "recognized": False,
                    "student_id": target_student_id,
                    "name": target_name,
                    "similarity_score": target_score,
                    "margin": margin,
                    "mismatch": False,
                    "message": f"Similarity ({target_score}) is below verification threshold ({self.threshold}). Please face camera directly."
                }

            return {
                "status": "UNKNOWN",
                "recognized": False,
                "student_id": target_student_id,
                "name": target_name,
                "similarity_score": target_score,
                "margin": margin,
                "mismatch": False,
                "message": "Face not recognized. Please center your face and check lighting."
            }

        # -------------------------------------------------------------
        # SCENARIO B: 1:N Kiosk / Admin Mode
        # -------------------------------------------------------------
        if best_score >= self.threshold and margin >= self.min_margin:
            return {
                "status": "KNOWN",
                "recognized": True,
                "student_id": best_sid,
                "name": best_name,
                "department": best_dept,
                "similarity_score": best_score,
                "second_similarity": round(float(second_score), 3) if second_score > -1.0 else 0.0,
                "margin": margin,
                "message": f"Recognized: {best_name} ({best_sid})"
            }

        if best_score >= self.threshold and margin < self.min_margin:
            return {
                "status": "UNCERTAIN",
                "recognized": False,
                "candidate_student_id": best_sid,
                "candidate_name": best_name,
                "similarity_score": best_score,
                "margin": margin,
                "message": f"Match ambiguous (similarity {best_score}, margin {margin} < {self.min_margin}). Please face camera directly."
            }

        if best_score >= (self.threshold - 0.08):
            return {
                "status": "UNCERTAIN",
                "recognized": False,
                "candidate_student_id": best_sid,
                "candidate_name": best_name,
                "similarity_score": best_score,
                "margin": margin,
                "message": f"Match uncertain ({best_score} vs {self.threshold} threshold, margin {margin}). Please look directly at camera."
            }

        return {
            "status": "UNKNOWN",
            "recognized": False,
            "similarity_score": best_score,
            "margin": margin,
            "message": "Unknown face. No matching registered student."
        }
