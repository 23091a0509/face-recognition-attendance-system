"""
Enrollment Data Auditor (Phase 28)
Scans database enrollments, validates multi-embedding shapes, checks quality scores,
and identifies potential duplicate enrollments or cross-identity collisions.
"""

import os
import sys
import sqlite3
import pickle
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from attendance_service.recognition.normalization import normalize_embedding
from backend.database import get_connection

def audit_enrollments():
    try:
        conn = get_connection()
    except Exception as e:
        print(f"[ERROR] Could not connect to database: {e}")
        return
    cursor = conn.cursor()

    print("=" * 70)
    print("BIOMETRIC ENROLLMENT AUDIT REPORT")
    print("=" * 70)

    # 1. Total registered students
    cursor.execute("SELECT student_id, name, department, embedding FROM students WHERE student_id != 'admin'")
    students = cursor.fetchall()
    print(f"Total Enrolled Student Accounts: {len(students)}")

    # 2. Check multi-embeddings table
    cursor.execute("SELECT id, student_id, embedding, quality_score, created_at FROM face_embeddings")
    samples = cursor.fetchall()
    print(f"Total Multi-Sample Face Records: {len(samples)}")
    print("-" * 70)

    issues = []
    gallery_centroids = {}

    for s_id, s_name, s_dept, legacy_emb in students:
        # Check samples for this student
        cursor.execute("SELECT embedding, quality_score FROM face_embeddings WHERE student_id = ?", (s_id,))
        s_samples = cursor.fetchall()

        if len(s_samples) == 0:
            if legacy_emb is None:
                issues.append(f"Student '{s_name}' ({s_id}) has NO face embeddings enrolled!")
                continue
            else:
                # Validate legacy embedding
                try:
                    raw = pickle.loads(legacy_emb)
                    arr = np.asarray(raw, dtype=np.float32)
                    if arr.shape != (512,):
                        issues.append(f"Student '{s_name}' ({s_id}) legacy embedding invalid shape: {arr.shape}")
                    elif np.isnan(arr).any() or np.isinf(arr).any():
                        issues.append(f"Student '{s_name}' ({s_id}) legacy embedding contains NaN or Inf!")
                    else:
                        gallery_centroids[s_id] = (s_name, normalize_embedding(arr))
                except Exception as e:
                    issues.append(f"Student '{s_name}' ({s_id}) failed to deserialize legacy embedding: {e}")
        else:
            # Multi samples validation
            valid_embs = []
            qualities = []
            for s_blob, q_score in s_samples:
                try:
                    raw = pickle.loads(s_blob)
                    arr = np.asarray(raw, dtype=np.float32)
                    if arr.shape != (512,):
                        issues.append(f"Sample for '{s_id}' has invalid shape {arr.shape}")
                    elif np.isnan(arr).any() or np.isinf(arr).any():
                        issues.append(f"Sample for '{s_id}' contains NaN or Inf!")
                    else:
                        valid_embs.append(normalize_embedding(arr))
                        qualities.append(q_score or 0.0)
                except Exception as e:
                    issues.append(f"Failed to deserialize sample for '{s_id}': {e}")

            if len(valid_embs) < 3:
                issues.append(f"[NOTICE] Student '{s_name}' ({s_id}) has only {len(valid_embs)} sample(s). Recommend 3–5 samples for optimal stability.")

            if valid_embs:
                centroid = normalize_embedding(np.mean(valid_embs, axis=0))
                gallery_centroids[s_id] = (s_name, centroid)

    # 3. Check for Identity Collisions / Cross-student duplicate similarity
    print("Auditing Identity Distinctness & Collision Risk...")
    collision_found = False
    sid_list = list(gallery_centroids.keys())
    for i in range(len(sid_list)):
        for j in range(i + 1, len(sid_list)):
            sid1 = sid_list[i]
            sid2 = sid_list[j]
            name1, emb1 = gallery_centroids[sid1]
            name2, emb2 = gallery_centroids[sid2]

            sim = float(np.dot(emb1, emb2))
            if sim >= 0.70:
                collision_found = True
                issues.append(f"[COLLISION RISK] '{name1}' ({sid1}) and '{name2}' ({sid2}) have high similarity: {sim:.4f} (Possible duplicate enrollment!)")

    if not collision_found:
        print("  ✅ All student identity centroids are mutually distinct (< 0.70 cross-similarity).")

    print("-" * 70)
    if issues:
        print("AUDIT FINDINGS & WARNINGS:")
        for idx, item in enumerate(issues, 1):
            print(f"  {idx}. {item}")
    else:
        print("✅ ALL ENROLLMENT DATA PASSED INTEGRITY AUDIT! No corruptions or collisions.")
    print("=" * 70)

    conn.close()

if __name__ == "__main__":
    audit_enrollments()
