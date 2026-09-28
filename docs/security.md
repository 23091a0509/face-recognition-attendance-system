# Security Architecture & Hardening Specifications

## 1. Authentication & Session Security

- **JWT Algorithm**: HMAC-SHA256 (`HS256`) tokens signed with environment-configured `JWT_SECRET_KEY`.
- **Fail-Secure Startup**: In production (`ENV=production`), the application refuses to launch if default or empty secrets are detected.
- **Expiration Policy**: Access tokens expire in 24 hours. Tokens encode student/admin ID, name, role, and department.

---

## 2. Role-Based Access Control (RBAC)

The system implements strict zero-trust boundary controls:

| Endpoint Pattern | Student Role | Admin Role | Service API Key |
| :--- | :--- | :--- | :--- |
| `GET /students/all` | ❌ 403 Forbidden | ✅ Full Access | ✅ Full Access |
| `POST /students/register` | ❌ 403 Forbidden | ✅ Full Access | ❌ 403 Forbidden |
| `POST /attendance/mark` | ✅ Own ID Only | ✅ Any Student | ❌ 403 Forbidden |
| `POST /attendance/recognize-frame` | ✅ Own ID Only (1:1) | ✅ Multi-student (1:N) | ❌ 403 Forbidden |
| `GET /students/{id}/embedding` | ❌ Vector Redacted | ❌ Vector Redacted | ✅ Raw Vector Transmitted |

> [!IMPORTANT]
> **Biometric Vector Privacy Guard (Phase 32)**:
> Raw 512-dimensional facial embedding vectors are classified as sensitive biometric data. The `GET /students/{id}/embedding` endpoint suppresses the vector field for all standard browser client sessions. Biometric vectors are only transmitted over the wire when authorized with a dedicated internal service header (`X-API-KEY: <SERVICE_API_KEY>`).

---

## 3. Cross-Origin Resource Sharing (CORS) Policy

CORS origins are dynamically bound from `ALLOWED_ORIGINS` environment variables:
- In production, wildcards (`*`) and open regex matches are disallowed.
- Standard allowed origins: configured frontend URL (e.g. `http://localhost:5173`, internal college domain).
- In development mode, localhost and local subnet LAN IPs are permitted to enable multi-device mobile testing across campus Wi-Fi.

---

## 4. Anti-Proxy Attendance Protections

1. **Self-Attendance Identity Lock**: When a student logs into the portal and scans their face, the system compares the face embedding against the logged-in student account.
2. **Cross-Identity Mismatch Detection**: If student A attempts to stand in front of student B's camera, the system detects whether the face matches another enrolled student in the institution. If similarity exceeds $0.70$, a `PROXY_MISMATCH` alert is raised and logged.
3. **Multi-Face Constraint**: In student personal mode, if more than 1 face is visible in the frame, the system refuses to mark attendance and prompts the student that only a single person may be in camera view.
