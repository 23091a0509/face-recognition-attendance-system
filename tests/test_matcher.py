import pytest
import numpy as np
from attendance_service.recognition.matcher import FaceMatcher
from attendance_service.recognition.normalization import normalize_embedding

def test_matcher_known_identity():
    matcher = FaceMatcher(threshold=0.72, min_margin=0.06)
    
    # Create target student embedding
    target_emb = normalize_embedding(np.random.randn(512).astype(np.float32))
    
    # Query with slightly perturbed version (simulating realistic genuine capture)
    query_emb = normalize_embedding(target_emb + np.random.normal(0, 0.015, 512).astype(np.float32))
    
    # Another completely different student
    other_emb = normalize_embedding(np.random.randn(512).astype(np.float32))
    
    gallery = {
        "STU_001": {"name": "Alice", "department": "CSE", "embeddings": [target_emb]},
        "STU_002": {"name": "Bob", "department": "ECE", "embeddings": [other_emb]}
    }
    
    res = matcher.match(query_emb, gallery)
    assert res["status"] == "KNOWN"
    assert res["recognized"] is True
    assert res["student_id"] == "STU_001"
    assert res["similarity_score"] >= 0.72
    assert res["margin"] >= 0.06

def test_matcher_proxy_detection_in_personal_mode():
    matcher = FaceMatcher(threshold=0.70, min_margin=0.06)
    
    alice_emb = normalize_embedding(np.random.randn(512).astype(np.float32))
    bob_emb = normalize_embedding(np.random.randn(512).astype(np.float32))
    
    gallery = {
        "ALICE": {"name": "Alice", "department": "CSE", "embeddings": [alice_emb]},
        "BOB": {"name": "Bob", "department": "CSE", "embeddings": [bob_emb]}
    }
    
    # Bob is standing in front of the camera, but session belongs to Alice!
    bob_query = normalize_embedding(bob_emb + np.random.normal(0, 0.02, 512).astype(np.float32))
    
    res = matcher.match(bob_query, gallery, target_student_id="ALICE")
    assert res["status"] == "PROXY_MISMATCH"
    assert res["recognized"] is False
    assert res["mismatch"] is True
    assert res["detected_student_id"] == "BOB"

def test_matcher_unknown_identity():
    matcher = FaceMatcher(threshold=0.72)
    
    registered_emb = normalize_embedding(np.random.randn(512).astype(np.float32))
    unregistered_query = normalize_embedding(np.random.randn(512).astype(np.float32))
    
    gallery = {
        "STU_001": {"name": "Alice", "department": "CSE", "embeddings": [registered_emb]}
    }
    
    res = matcher.match(unregistered_query, gallery)
    assert res["status"] in ["UNKNOWN", "UNCERTAIN"]
    assert res["recognized"] is False
