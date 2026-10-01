"""
Canonical Face Recognition Engine for Attendance System
Provides:
- L2 Normalization & Vectorized Cosine Similarity
- Multi-factor Face Quality Evaluator
- MTCNN Face Detection & Landmark Extraction
- FaceNet InceptionResnetV1 Embedding
- Multi-Embedding Gallery Matcher with Top-1 vs Top-2 Margin & Unknown Triage
- Temporal Consistency Verifier & Smoothing
- MediaPipe Liveness State Machine
- Unified RecognitionPipeline
"""

from .normalization import normalize_embedding, cosine_similarity
from .quality import FaceQualityChecker
from .matcher import FaceMatcher
from .temporal import TemporalSmoother, TemporalVerifier

__all__ = [
    "normalize_embedding",
    "cosine_similarity",
    "FaceQualityChecker",
    "FaceDetector",
    "FaceEmbedder",
    "FaceMatcher",
    "TemporalSmoother",
    "TemporalVerifier",
    "LivenessStateMachine",
    "LivenessState",
    "RecognitionPipeline",
    "get_device",
    "get_mtcnn_detector",
    "get_facenet_embedder",
]

def __getattr__(name: str):
    if name in ("FaceDetector", "get_device", "get_mtcnn_detector"):
        from .detector import FaceDetector, get_device, get_mtcnn_detector
        mapping = {
            "FaceDetector": FaceDetector,
            "get_device": get_device,
            "get_mtcnn_detector": get_mtcnn_detector,
        }
        return mapping[name]
    elif name in ("FaceEmbedder", "get_facenet_embedder"):
        from .embedder import FaceEmbedder, get_facenet_embedder
        mapping = {
            "FaceEmbedder": FaceEmbedder,
            "get_facenet_embedder": get_facenet_embedder,
        }
        return mapping[name]
    elif name in ("LivenessStateMachine", "LivenessState"):
        from .liveness import LivenessStateMachine, LivenessState
        mapping = {
            "LivenessStateMachine": LivenessStateMachine,
            "LivenessState": LivenessState,
        }
        return mapping[name]
    elif name == "RecognitionPipeline":
        from .pipeline import RecognitionPipeline
        return RecognitionPipeline
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
