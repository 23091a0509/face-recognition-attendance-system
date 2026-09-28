import torch
import numpy as np
from PIL import Image
from typing import Tuple, List, Optional
from facenet_pytorch import MTCNN

_device = None
_mtcnn_instance = None

def get_device() -> str:
    global _device
    if _device is None:
        _device = "cuda" if torch.cuda.is_available() else "cpu"
    return _device

def get_mtcnn_detector() -> MTCNN:
    global _mtcnn_instance
    if _mtcnn_instance is None:
        device = get_device()
        _mtcnn_instance = MTCNN(
            image_size=160,
            margin=20,
            keep_all=True,
            select_largest=False,
            post_process=True,
            device=device
        )
    return _mtcnn_instance

class FaceDetector:
    """Wrapper around MTCNN face detector with lazy single-instance initialization."""

    def __init__(self):
        self.device = get_device()
        self.detector = get_mtcnn_detector()

    def detect(self, image: Image.Image) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Detects bounding boxes, probabilities, and 5-point facial landmarks.
        Returns:
            boxes: np.ndarray of shape (N, 4) or None
            probs: np.ndarray of shape (N,) or None
            landmarks: np.ndarray of shape (N, 5, 2) or None
        """
        boxes, probs, landmarks = self.detector.detect(image, landmarks=True)
        return boxes, probs, landmarks

    def extract_aligned(self, image: Image.Image, boxes: Optional[np.ndarray] = None) -> Optional[torch.Tensor]:
        """
        Extracts aligned face tensors of shape (N, 3, 160, 160) from detected boxes.
        """
        if boxes is None or len(boxes) == 0:
            return self.detector(image)
        return self.detector.extract(image, boxes, save_path=None)
