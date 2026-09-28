import torch
import numpy as np
from typing import Union
from facenet_pytorch import InceptionResnetV1
from .detector import get_device
from .normalization import normalize_embedding

_facenet_instance = None

def get_facenet_embedder() -> InceptionResnetV1:
    global _facenet_instance
    if _facenet_instance is None:
        device = get_device()
        _facenet_instance = InceptionResnetV1(
            pretrained="vggface2"
        ).eval().to(device)
    return _facenet_instance

class FaceEmbedder:
    """Computes L2-normalized 512-dimensional facial embeddings using FaceNet."""

    def __init__(self):
        self.device = get_device()
        self.model = get_facenet_embedder()

    def embed_tensor(self, face_tensor: torch.Tensor) -> np.ndarray:
        """
        Takes a face tensor of shape (3, 160, 160) or (N, 3, 160, 160),
        runs inference under torch.no_grad(), and returns L2-normalized float32 numpy array.
        """
        if face_tensor.dim() == 3:
            face_tensor = face_tensor.unsqueeze(0)
        
        face_tensor = face_tensor.to(self.device)
        with torch.no_grad():
            raw_embeddings = self.model(face_tensor).cpu().numpy()
            
        return normalize_embedding(raw_embeddings)
