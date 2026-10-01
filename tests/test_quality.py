import pytest
import numpy as np
from attendance_service.recognition.quality import FaceQualityChecker

def test_quality_rejects_dark_image():
    checker = FaceQualityChecker()
    # Dark black image
    dark_img = np.zeros((480, 640, 3), dtype=np.uint8)
    box = np.array([200, 150, 440, 390])
    res = checker.evaluate(dark_img, box)
    assert not res["valid"]
    assert "dark" in res["message"].lower()

def test_quality_rejects_overexposed_image():
    checker = FaceQualityChecker()
    # Overexposed white image
    bright_img = np.full((480, 640, 3), 250, dtype=np.uint8)
    box = np.array([200, 150, 440, 390])
    res = checker.evaluate(bright_img, box)
    assert not res["valid"]
    assert "bright" in res["message"].lower() or "overexposed" in res["message"].lower()

def test_quality_rejects_tiny_face():
    checker = FaceQualityChecker(min_face_size=70)
    img = np.full((480, 640, 3), 128, dtype=np.uint8)
    # Tiny 30x30 bounding box
    box = np.array([100, 100, 130, 130])
    res = checker.evaluate(img, box)
    assert not res["valid"]
    assert "small" in res["message"].lower() or "closer" in res["message"].lower()

def test_quality_accepts_good_synthetic_face():
    checker = FaceQualityChecker()
    # Good image with realistic variance and dimensions
    np.random.seed(42)
    img = np.random.randint(90, 160, (480, 640, 3), dtype=np.uint8)
    # Centered 200x200 face
    box = np.array([220, 140, 420, 340])
    res = checker.evaluate(img, box)
    assert res["valid"] is True
    assert res["message"] == "Quality optimal"
    assert res["quality_score"] >= 0.50
