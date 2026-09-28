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
    consistently and reliably recognized across multiple frames within
    a defined time window.
    """

    def __init__(
        self,
        required_consistent_frames: int = 4,
        time_window_seconds: float = 2.0
    ):
        self.required_consistent_frames = required_consistent_frames
        self.time_window_seconds = time_window_seconds
        # student_id -> list of timestamps where valid recognition occurred
        self.match_timestamps: Dict[str, deque] = {}

    def record_match(self, student_id: str) -> Tuple[bool, int]:
        """
        Records a valid recognition frame for student_id.
        Returns:
            (is_verified, consistent_frame_count)
        """
        now = time.time()
        if student_id not in self.match_timestamps:
            self.match_timestamps[student_id] = deque(maxlen=self.required_consistent_frames * 2)

        q = self.match_timestamps[student_id]
        q.append(now)

        # Evict timestamps older than time_window_seconds
        cutoff = now - self.time_window_seconds
        recent = [t for t in q if t >= cutoff]
        self.match_timestamps[student_id] = deque(recent, maxlen=self.required_consistent_frames * 2)

        count = len(recent)
        is_verified = count >= self.required_consistent_frames
        return is_verified, count

    def reset_student(self, student_id: str):
        if student_id in self.match_timestamps:
            del self.match_timestamps[student_id]

    def reset_all(self):
        self.match_timestamps.clear()
