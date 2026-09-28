# Testing & Verification Guide

## 1. Automated Test Suite

The automated test suite validates:
- **Mathematical Accuracy**: L2 vector normalization onto $\mathbb{S}^{511}$, cosine distance invariants.
- **Quality Pipeline**: Luminance thresholding, Laplacian blur estimation, minimum face resolution.
- **Biometric Matching**: Top-1 vs Top-2 margin gating, proxy mismatch detection, unknown vs uncertain triage.
- **Database Engine**: Unique constraints on `(student_id, date)` and foreign keys pragma enforcement.
- **API & RBAC**: Unauthorized route access denial, health status and timezone reporting.

### Running Pytest Suite
```bash
# Activate virtual environment
.\venv\Scripts\activate   # Windows
source venv/bin/activate  # Linux / macOS

# Run all automated tests with verbose output
python -m pytest tests -v
```

---

## 2. Threshold Calibration Tool

Calculates False Accept Rate (FAR), False Reject Rate (FRR), Equal Error Rate (EER), and optimal F1 threshold:

```bash
python tools/calibrate_threshold.py
```

Outputs a calibration table sweeping thresholds from `0.50` to `0.86`.

---

## 3. Enrollment Data Quality Audit

Audits registered student biometric vectors in SQLite:

```bash
python tools/check_enrollment_data.py
```

Validates:
- Embedding dimensionality (`512` floats).
- Absence of `NaN` or `Inf` values.
- Cross-student pairwise similarity to detect accidental duplicate enrollments.

---

## 4. End-to-End Pipeline Latency Benchmark

Benchmarks pipeline frame processing latency and writes `docs/recognition-evaluation.md`:

```bash
python tools/evaluate_recognition.py
```

---

## 5. Frontend Build Verification

```bash
cd frontend
npm run build
```
Verifies TypeScript type-checking and bundling with zero errors.
