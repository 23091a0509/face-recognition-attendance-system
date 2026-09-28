"""
Biometric Threshold Calibration Tool
Calculates False Accept Rate (FAR), False Reject Rate (FRR), EER, and F1 across a threshold sweep
using authentic vs impostor pairs generated from enrolled database samples and perturbed variants.
"""

import sys
import os
import sqlite3
import pickle
import numpy as np

# Ensure project root is in path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from attendance_service.recognition.normalization import normalize_embedding, cosine_similarity
from backend.database import get_connection

def load_enrolled_embeddings():
    try:
        conn = get_connection()
    except Exception as e:
        print(f"[ERROR] Could not connect to database: {e}")
        return {}
    cursor = conn.cursor()

    gallery = {}
    # Fetch multi-embeddings
    try:
        cursor.execute("SELECT student_id, embedding FROM face_embeddings WHERE student_id != 'admin'")
        for sid, blob in cursor.fetchall():
            if not blob:
                continue
            emb = pickle.loads(blob)
            arr = np.asarray(emb, dtype=np.float32)
            if sid not in gallery:
                gallery[sid] = []
            if arr.ndim == 1:
                gallery[sid].append(normalize_embedding(arr))
            elif arr.ndim == 2:
                for row in arr:
                    gallery[sid].append(normalize_embedding(row))
    except Exception as e:
        print(f"[WARN] Error reading face_embeddings: {e}")

    # Fetch legacy embeddings
    try:
        cursor.execute("SELECT student_id, embedding FROM students WHERE student_id != 'admin' AND embedding IS NOT NULL")
        for sid, blob in cursor.fetchall():
            if sid not in gallery or len(gallery[sid]) == 0:
                emb = pickle.loads(blob)
                arr = np.asarray(emb, dtype=np.float32)
                gallery[sid] = [normalize_embedding(arr)]
    except Exception as e:
        print(f"[WARN] Error reading students: {e}")

    conn.close()
    return gallery

def generate_pairs(gallery):
    """
    Generates genuine (same identity) and impostor (different identity) comparison pairs.
    If multiple real samples exist per student, compares across samples.
    Also augments with slight Gaussian noise perturbations (simulating camera sensor noise)
    to build a statistically representative distribution.
    """
    genuine_scores = []
    impostor_scores = []

    sids = list(gallery.keys())
    if len(sids) == 0:
        print("[WARN] No students found in database. Using synthetic evaluation pairs.")
        # Generate 20 distinct random unit vectors representing different synthetic identities
        np.random.seed(42)
        sids = [f"SYNTH_{i}" for i in range(25)]
        gallery = {}
        for sid in sids:
            base_vec = np.random.randn(512).astype(np.float32)
            base_vec = normalize_embedding(base_vec)
            # Create 3-5 noisy observations per person
            samples = [base_vec]
            for _ in range(4):
                noisy = base_vec + np.random.normal(0, 0.08, 512).astype(np.float32)
                samples.append(normalize_embedding(noisy))
            gallery[sid] = samples

    # 1. Genuine comparisons
    for sid, samples in gallery.items():
        if len(samples) > 1:
            for i in range(len(samples)):
                for j in range(i + 1, len(samples)):
                    sim = float(np.dot(samples[i], samples[j]))
                    genuine_scores.append(sim)
        else:
            # Augment single sample with simulated frame noise (simulates real-world webcam variance)
            base = samples[0]
            for _ in range(5):
                noisy = normalize_embedding(base + np.random.normal(0, 0.06, 512).astype(np.float32))
                sim = float(np.dot(base, noisy))
                genuine_scores.append(sim)

    # 2. Impostor comparisons (between different individuals)
    for i in range(len(sids)):
        for j in range(i + 1, len(sids)):
            sid1 = sids[i]
            sid2 = sids[j]
            samp1 = gallery[sid1][0]
            samp2 = gallery[sid2][0]
            sim = float(np.dot(samp1, samp2))
            impostor_scores.append(sim)

    return np.array(genuine_scores), np.array(impostor_scores)

def calibrate():
    print("=" * 70)
    print("BIOMETRIC RECOGNITION THRESHOLD CALIBRATION")
    print("=" * 70)

    gallery = load_enrolled_embeddings()
    print(f"Loaded {len(gallery)} identity galleries from database.")

    genuine, impostor = generate_pairs(gallery)
    print(f"Generated {len(genuine)} genuine comparisons and {len(impostor)} impostor comparisons.")
    print(f"Genuine Scores: mean={np.mean(genuine):.4f}, std={np.std(genuine):.4f}, min={np.min(genuine):.4f}, max={np.max(genuine):.4f}")
    print(f"Impostor Scores: mean={np.mean(impostor):.4f}, std={np.std(impostor):.4f}, min={np.min(impostor):.4f}, max={np.max(impostor):.4f}")
    print("-" * 70)

    # Sweep thresholds
    thresholds = np.arange(0.50, 0.88, 0.02)
    best_f1 = -1.0
    optimal_thresh = 0.72
    eer_thresh = 0.72
    min_eer_diff = 999.0

    print(f"{'Threshold':<11} | {'FAR (%)':<10} | {'FRR (%)':<10} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10}")
    print("-" * 70)

    for th in thresholds:
        # False Accept: Impostor >= th
        fa = np.sum(impostor >= th)
        far = (fa / len(impostor)) * 100.0 if len(impostor) > 0 else 0.0

        # False Reject: Genuine < th
        fr = np.sum(genuine < th)
        frr = (fr / len(genuine)) * 100.0 if len(genuine) > 0 else 0.0

        tp = np.sum(genuine >= th)
        fp = fa
        fn = fr

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        diff = abs(far - frr)
        if diff < min_eer_diff:
            min_eer_diff = diff
            eer_thresh = th

        if f1 > best_f1:
            best_f1 = f1
            optimal_thresh = th

        print(f"{th:<11.2f} | {far:<10.2f} | {frr:<10.2f} | {precision:<10.4f} | {recall:<10.4f} | {f1:<10.4f}")

    print("=" * 70)
    print(f"CALIBRATION RECOMMENDATIONS:")
    print(f"  • Equal Error Rate (EER) Threshold : {eer_thresh:.2f}")
    print(f"  • Optimal F1-Max Threshold         : {optimal_thresh:.2f} (F1 = {best_f1:.4f})")
    print(f"  • Production Default Recommended   : 0.72 (Balancing strict anti-proxy security & classroom ease)")
    print("=" * 70)

if __name__ == "__main__":
    calibrate()
