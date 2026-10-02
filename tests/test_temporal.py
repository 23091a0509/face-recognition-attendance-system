import time
import pytest
from attendance_service.recognition.temporal import TemporalVerifier, TemporalSmoother

def test_temporal_verifier_three_consecutive_frames():
    verifier = TemporalVerifier(required_consistent_frames=3, max_interval_seconds=3.0)
    sid = "STU_101"

    # Frame 1
    v1, c1 = verifier.record_match(sid)
    assert v1 is False
    assert c1 == 1

    # Frame 2
    v2, c2 = verifier.record_match(sid)
    assert v2 is False
    assert c2 == 2

    # Frame 3 (consecutive requirement met)
    v3, c3 = verifier.record_match(sid)
    assert v3 is True
    assert c3 == 3

    # Subsequent frame continues verified status
    v4, c4 = verifier.record_match(sid)
    assert v4 is True
    assert c4 == 4

def test_temporal_verifier_interrupted_streak_resets():
    verifier = TemporalVerifier(required_consistent_frames=3, max_interval_seconds=3.0)
    sid = "STU_102"

    verifier.record_match(sid)
    _, c2 = verifier.record_match(sid)
    assert c2 == 2

    # Explicit reset on interruption (e.g. unknown face, proxy mismatch, or face lost)
    verifier.reset_student(sid)
    assert verifier.get_streak(sid) == 0

    # Next match must restart at frame 1, not 3
    v_restart, c_restart = verifier.record_match(sid)
    assert v_restart is False
    assert c_restart == 1

def test_temporal_verifier_gap_timeout_resets_streak():
    # Use small max_interval for testing gap timeout
    verifier = TemporalVerifier(required_consistent_frames=3, max_interval_seconds=0.15)
    sid = "STU_103"

    verifier.record_match(sid)
    _, c2 = verifier.record_match(sid)
    assert c2 == 2

    # Wait longer than max_interval_seconds
    time.sleep(0.2)

    # Next match arrives after timeout -> streak must reset to 1
    v_after_gap, c_after_gap = verifier.record_match(sid)
    assert v_after_gap is False
    assert c_after_gap == 1

def test_temporal_verifier_multiple_students_isolated():
    verifier = TemporalVerifier(required_consistent_frames=3, max_interval_seconds=3.0)
    s1, s2 = "ALICE", "BOB"

    verifier.record_match(s1)
    verifier.record_match(s1)

    verifier.record_match(s2)

    assert verifier.get_streak(s1) == 2
    assert verifier.get_streak(s2) == 1

    v1, c1 = verifier.record_match(s1)
    assert v1 is True
    assert c1 == 3
    assert verifier.get_streak(s2) == 1

def test_temporal_smoother():
    smoother = TemporalSmoother(window_size=5)
    assert smoother.update(None) == (None, 0.0)
    smoother.reset()

    smoother.update("ALICE")
    smoother.update("ALICE")
    dominant, stab = smoother.update("ALICE")
    assert dominant == "ALICE"
    assert stab == 1.0

    smoother.reset()
    assert smoother.update(None) == (None, 0.0)
