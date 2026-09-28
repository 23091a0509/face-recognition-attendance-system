import pytest
import numpy as np
from attendance_service.recognition.normalization import normalize_embedding, cosine_similarity

def test_l2_normalization_unit_vector():
    vec = np.array([3.0, 4.0], dtype=np.float32)
    norm_vec = normalize_embedding(vec)
    norm = np.linalg.norm(norm_vec)
    assert np.isclose(norm, 1.0, atol=1e-6)

def test_l2_normalization_batch():
    matrix = np.random.randn(10, 512).astype(np.float32)
    norm_matrix = normalize_embedding(matrix)
    norms = np.linalg.norm(norm_matrix, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-6)

def test_zero_vector_stability():
    zeros = np.zeros(512, dtype=np.float32)
    norm_zeros = normalize_embedding(zeros)
    assert not np.isnan(norm_zeros).any()
    assert not np.isinf(norm_zeros).any()

def test_cosine_similarity_identical():
    vec = np.random.randn(512).astype(np.float32)
    sim = cosine_similarity(vec, vec)
    assert np.isclose(sim, 1.0, atol=1e-5)

def test_cosine_similarity_orthogonal():
    v1 = np.zeros(512, dtype=np.float32)
    v1[0] = 1.0
    v2 = np.zeros(512, dtype=np.float32)
    v2[1] = 1.0
    sim = cosine_similarity(v1, v2)
    assert np.isclose(sim, 0.0, atol=1e-5)
