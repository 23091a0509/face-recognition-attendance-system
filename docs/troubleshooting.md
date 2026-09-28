# Troubleshooting & Operations FAQ

## 1. Camera & Video Issues

### "Camera access denied or webcam not available"
- **Cause**: Browser permissions blocked, or another application (e.g. Zoom, Teams) has exclusive lock on the camera device.
- **Resolution**:
  1. Open browser site settings and allow Camera permissions.
  2. In Windows: Go to **Settings > Privacy & Security > Camera** and ensure *Let desktop apps access your camera* is turned ON.
  3. Close any background video conferencing apps.

### "Lighting too dark, please face a light source"
- **Cause**: The mean pixel luminance across the detected face patch is below $30.0 / 255$.
- **Resolution**: Move toward ambient light or turn on indoor lighting. Avoid strong backlights behind the student's head.

### "Image is blurry, please hold still"
- **Cause**: Camera motion blur caused Laplacian variance to drop below $22.0$.
- **Resolution**: Hold the camera or phone steady for 0.5 seconds while facing the sensor.

---

## 2. Recognition & Attendance Issues

### "Proxy Attendance Blocked!"
- **Cause**: The student attempting to mark attendance matched a different student's registered face in the database with $\ge 0.70$ similarity.
- **Resolution**: The system strictly enforces 1:1 self-attendance. Log in with the account corresponding to the individual present.

### "Multiple faces detected in frame"
- **Cause**: More than one person is visible in the camera view during student personal attendance mode.
- **Resolution**: Ensure only the logged-in student is in frame. Friends or bystanders must step out of camera range.

### "Face match is XX% (72% required)"
- **Cause**: Similarity is below calibrated operating threshold ($0.72$).
- **Resolution**: Ensure direct forward-facing pose, remove heavy tinted eyewear or masks, and adjust lighting. If appearance has changed significantly, re-enroll face profile in Admin or Student portal.

---

## 3. Backend & Database Issues

### "Database locked" or "IntegrityError: UNIQUE constraint failed"
- **Cause**: Concurrent requests tried to mark attendance at the exact same millisecond.
- **Resolution**: The system gracefully handles this race condition by catching `sqlite3.IntegrityError` and returning status `already_marked` without crashing.

### Database Tables Migration
- To re-run automatic database migrations (e.g. creating `face_embeddings` or unique indexes):
```bash
python -c "from backend.database import create_tables; create_tables()"
```
