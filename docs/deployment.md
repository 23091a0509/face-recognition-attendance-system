# Production Deployment & Operations Guide

## 1. Prerequisites & Environment

- **Python**: 3.10, 3.11, or 3.12 (with PyTorch and Torchvision).
- **Node.js**: v18+ or v20+ with npm.
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 recommended) or Windows Server.
- **Hardware**: Minimum 4-core CPU, 4 GB RAM. Optional: NVIDIA GPU with CUDA for ultra-low latency kiosk recognition (< 10 ms).

---

## 2. Environment Configuration (`.env`)

Create a `.env` file in the project root:

```env
# Application Environment (production / development)
ENV=production
PORT=8000

# Security Secrets (Must be set to strong cryptographically random strings)
JWT_SECRET_KEY=generate-a-secure-64-char-random-key-here
SERVICE_API_KEY=generate-a-secure-32-char-service-key-here

# Institutional Timezone (Indian Standard Time)
TIMEZONE=Asia/Kolkata
ATTENDANCE_LATE_AFTER=09:15

# Calibrated Biometric Recognition Parameters
FACE_RECOGNITION_THRESHOLD=0.72
MIN_MATCH_MARGIN=0.06
REQUIRED_CONSISTENT_FRAMES=3

# CORS & Frontend Origins
FRONTEND_URL=https://attendance.institution.edu
ALLOWED_ORIGINS=https://attendance.institution.edu,http://localhost:5173
```

---

## 3. Backend Deployment (Systemd Service on Linux)

Create `/etc/systemd/system/attendance-backend.service`:

```ini
[Unit]
Description=Face Recognition Attendance Backend API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/face-recognition-attendance-system
ExecStart=/opt/face-recognition-attendance-system/venv/bin/python -m uvicorn backend_api.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5
EnvironmentFile=/opt/face-recognition-attendance-system/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now attendance-backend
```

---

## 4. Frontend Deployment (Nginx Reverse Proxy)

1. Build production static bundle:
```bash
cd frontend
npm install
npm run build
```

2. Configure Nginx site (`/etc/nginx/sites-available/attendance`):
```nginx
server {
    listen 80;
    server_name attendance.institution.edu;

    root /opt/face-recognition-attendance-system/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Standalone Kiosk Edge Deployment

For dedicated campus entrance kiosks:
```bash
cd attendance_service
../venv/bin/python cache_builder.py   # Synchronizes enrolled biometric profiles
../venv/bin/python main.py            # Launches live video recognition loop
```
