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
from .detector import FaceDetector, get_device, get_mtcnn_detector
from .embedder import FaceEmbedder, get_facenet_embedder
from .matcher import FaceMatcher
from .temporal import TemporalSmoother, TemporalVerifier
from .liveness import LivenessStateMachine, LivenessState
from .pipeline import RecognitionPipeline

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
