import time
from collections import deque, Counter
from typing import Dict, Optional, Tuple, Any

class TemporalSmoother:
    """
    Maintains a rolling window of recent frame predictions to eliminate
    jitter, flicker, and instantaneous misclassifications.
    """

    def __init__(self, window_size: int = 7):
        self.window_size = window_size
        self.history = deque(maxlen=window_size)

    def update(self, prediction: Optional[str]) -> Tuple[Optional[str], float]:
        """
        Appends prediction (student_id or 'UNKNOWN' or None) and returns
        the dominant smoothed identity and its stability fraction [0.0, 1.0].
        """
        self.history.append(prediction)
        valid_items = [p for p in self.history if p is not None]
        if not valid_items:
            return None, 0.0

        counts = Counter(valid_items)
        dominant, freq = counts.most_common(1)[0]
        stability = freq / len(self.history)
        return dominant, round(stability, 2)

    def reset(self):
        self.history.clear()


class TemporalVerifier:
    """
    Guarantees that attendance is marked ONLY after a student has been
    consistently and reliably recognized across at least 3 consecutive frames
    within a reasonable inter-frame time interval.
    """

    def __init__(
        self,
        required_consistent_frames: int = 3,
        max_interval_seconds: float = 3.0,
        time_window_seconds: float = 10.0
    ):
        self.required_consistent_frames = required_consistent_frames
        self.max_interval_seconds = max_interval_seconds
        self.time_window_seconds = time_window_seconds
        # student_id -> dict: {"count": int, "last_time": float}
        self._student_streaks: Dict[str, Dict[str, Any]] = {}

    def record_match(self, student_id: str) -> Tuple[bool, int]:
        """
        Records a valid recognition frame for student_id.
        Increments consecutive streak if within max_interval_seconds;
        resets streak to 1 if inter-frame gap was exceeded.
        Returns:
            (is_verified, consecutive_frame_count)
        """
        now = time.time()
        sid = str(student_id).strip().upper()

        if sid in self._student_streaks:
            last_time = self._student_streaks[sid]["last_time"]
            gap = now - last_time
            if 0 <= gap <= self.max_interval_seconds:
                self._student_streaks[sid]["count"] += 1
            else:
                # Interrupted streak (gap too long)
                self._student_streaks[sid]["count"] = 1
        else:
            self._student_streaks[sid] = {"count": 1, "last_time": now}

        self._student_streaks[sid]["last_time"] = now
        count = self._student_streaks[sid]["count"]
        is_verified = count >= self.required_consistent_frames
        return is_verified, count

    def get_streak(self, student_id: str) -> int:
        """Returns the current consecutive streak for student_id if still active."""
        sid = str(student_id).strip().upper()
        if sid in self._student_streaks:
            now = time.time()
            if now - self._student_streaks[sid]["last_time"] <= self.max_interval_seconds:
                return self._student_streaks[sid]["count"]
        return 0

    def reset_student(self, student_id: str):
        """Resets the consecutive streak for a specific student."""
        sid = str(student_id).strip().upper()
        if sid in self._student_streaks:
            del self._student_streaks[sid]

    def reset_all(self):
        """Resets all active verification streaks."""
        self._student_streaks.clear()
