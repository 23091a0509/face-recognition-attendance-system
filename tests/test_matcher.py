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

def test_matcher_margin_ambiguity_rejection():
    # Require S1 >= 0.75 and margin >= 0.08
    matcher = FaceMatcher(threshold=0.75, min_margin=0.08)

    # Deterministic orthonormal basis vectors in R^512
    e0 = np.zeros(512, dtype=np.float32)
    e0[0] = 1.0

    e1 = np.zeros(512, dtype=np.float32)
    e1[1] = 1.0

    e2 = np.zeros(512, dtype=np.float32)
    e2[2] = 1.0

    # Query is e0
    query_emb = e0

    # S1 has similarity 0.85 (> 0.75)
    cos_theta1 = 0.85
    sin_theta1 = np.sqrt(1.0 - cos_theta1 ** 2)
    s1_emb = (cos_theta1 * e0 + sin_theta1 * e1).astype(np.float32)

    # S2 has similarity 0.82 (> 0.75), yielding margin = 0.85 - 0.82 = 0.03 (< 0.08)
    cos_theta2 = 0.82
    sin_theta2 = np.sqrt(1.0 - cos_theta2 ** 2)
    s2_emb = (cos_theta2 * e0 + sin_theta2 * e2).astype(np.float32)

    gallery_ambiguous = {
        "STU_001": {"name": "Alice", "department": "CSE", "embeddings": [s1_emb]},
        "STU_002": {"name": "Bob", "department": "ECE", "embeddings": [s2_emb]}
    }

    # 1. 1:1 Personal Mode ambiguity rejection
    res_personal = matcher.match(query_emb, gallery_ambiguous, target_student_id="STU_001")
    assert res_personal["status"] == "UNCERTAIN"
    assert res_personal["recognized"] is False
    assert res_personal["margin"] < 0.08
    assert "ambiguity" in res_personal["message"].lower()

    # 2. 1:N Kiosk Mode ambiguity rejection
    res_kiosk = matcher.match(query_emb, gallery_ambiguous)
    assert res_kiosk["status"] == "UNCERTAIN"
    assert res_kiosk["recognized"] is False
    assert res_kiosk["margin"] < 0.08
    assert "ambiguous" in res_kiosk["message"].lower()

    # 3. Sufficient margin (S1 = 0.85, S2 = 0.70 -> margin = 0.15 >= 0.08) must succeed
    cos_theta3 = 0.70
    sin_theta3 = np.sqrt(1.0 - cos_theta3 ** 2)
    s2_distant = (cos_theta3 * e0 + sin_theta3 * e2).astype(np.float32)

    gallery_clear = {
        "STU_001": {"name": "Alice", "department": "CSE", "embeddings": [s1_emb]},
        "STU_002": {"name": "Bob", "department": "ECE", "embeddings": [s2_distant]}
    }

    res_clear = matcher.match(query_emb, gallery_clear)
    assert res_clear["status"] == "KNOWN"
    assert res_clear["recognized"] is True
    assert res_clear["student_id"] == "STU_001"
    assert res_clear["margin"] >= 0.08
