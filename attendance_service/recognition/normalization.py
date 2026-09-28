import numpy as np

def normalize_embedding(emb: np.ndarray) -> np.ndarray:
    """
    Apply standard L2 normalization to a 1D or 2D embedding vector.
    Ensures ||emb||_2 = 1.0 with epsilon guard against zero division.
    """
    emb_arr = np.asarray(emb, dtype=np.float32)
    if emb_arr.ndim == 1:
        norm = np.linalg.norm(emb_arr)
        if norm < 1e-9:
            return emb_arr
        return emb_arr / norm
    elif emb_arr.ndim == 2:
        norm = np.linalg.norm(emb_arr, axis=1, keepdims=True)
        norm = np.where(norm < 1e-9, 1.0, norm)
        return emb_arr / norm
    else:
        raise ValueError(f"Expected 1D or 2D array for embedding, got shape {emb_arr.shape}")

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Computes cosine similarity between two 1D embedding vectors or between
    a 1D query vector and a 2D matrix of stored vectors.
    Returns float or 1D array of float similarities.
    """
    norm_a = normalize_embedding(a)
    norm_b = normalize_embedding(b)
    
    if norm_b.ndim == 1:
        return float(np.dot(norm_a, norm_b))
    else:
        # norm_b is (N, D), norm_a is (D,) -> return (N,)
        return np.dot(norm_b, norm_a)
