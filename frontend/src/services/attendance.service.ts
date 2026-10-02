import api from "./api";

export interface AttendanceRecord {
    student_id: string;
    date: string;
    time: string;
    name?: string;
    department?: string;
    status?: "Present" | "Late" | "Absent" | "Half Day" | "Full Day" | string;
    method?: string;
    minutes_attended?: number;
    reason?: string;
    confidence?: number;
}

export interface AttendanceSession {
    id: number;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    full_day_threshold: number;
    half_day_threshold: number;
    status: "active" | "ended";
    seconds_remaining: number;
    is_ended: boolean;
}

export interface SessionStudentStatus {
    status: "Full Day" | "Half Day" | "Absent";
    minutes_attended: number;
    total_minutes: number;
    attendance_percentage: number;
    reason: string;
    halves_attended?: { first_half: boolean; second_half: boolean };
    first_seen?: string;
    last_seen?: string;
    final_recorded_status?: string | null;
    is_recorded?: boolean;
}

export interface CurrentSessionResponse {
    session: AttendanceSession;
    student_status: SessionStudentStatus | null;
    now: string;
}

export interface CreateSessionData {
    title?: string;
    date?: string;
    start_time: string;
    end_time: string;
    full_day_threshold?: number;
    half_day_threshold?: number;
}

export interface AttendanceStats {
    student_id: string;
    present: number;
    total_classes: number;
    attendance_percentage: number;
}

// Stats for dashboard
export async function getStudentAttendanceStats(studentId: string): Promise<AttendanceStats> {
    const res = await api.get(`/attendance/student/${studentId}`);
    return res.data;
}

export interface TodayAttendance {
    date: string;
    total_students?: number;
    total_present: number;
    total_full_day?: number;
    total_half_day?: number;
    total_absent?: number;
    total_late?: number;
    records: AttendanceRecord[];
}

// Records for attendance history table
export async function getStudentAttendanceRecords(
    studentId: string
): Promise<AttendanceRecord[]> {
    const res = await api.get(`/attendance/student/${studentId}/records`);
    return res.data;
}

/* ========= API ========= */

export async function getTodayAttendance(): Promise<TodayAttendance> {
    const res = await api.get("/attendance/today");
    return res.data;
}

export async function getAttendanceHistory(): Promise<AttendanceRecord[]> {
    const res = await api.get("/attendance/history");
    return res.data;
}

export async function markAttendance(studentId: string): Promise<{ status: string; student_id: string; date: string }> {
    const res = await api.post("/attendance/mark", { student_id: studentId });
    return res.data;
}

export interface DetectedFaceInfo {
    recognized: boolean;
    student_id?: string;
    name?: string;
    department?: string;
    confidence?: number;
    box?: [number, number, number, number];
    already_marked?: boolean;
    marked_time?: string;
    status?: string;
}

export interface FrameRecognitionResult {
    success: boolean;
    face_detected: boolean;
    recognized: boolean;
    face_count?: number;
    recognized_count?: number;
    detected_faces?: DetectedFaceInfo[];
    student_id?: string;
    name?: string;
    department?: string;
    confidence?: number;
    box?: [number, number, number, number];
    already_marked?: boolean;
    marked_time?: string;
    mismatch?: boolean;
    liveness_passed?: boolean;
    quality_warning?: string;
    enrolled?: boolean;
    message?: string;
    verifying?: boolean;
    consecutive_frames?: number;
    required_frames?: number;
}

export interface AdminSettingsData {
    ip_restriction_enabled: boolean;
    allowed_ips: string;
    client_ip?: string;
    face_threshold?: number;
    min_margin?: number;
    duplicate_protection?: boolean;
    duplicate_window_minutes?: number;
    late_after_time?: string;
}

export async function recognizeFrame(
    image: string,
    confidenceThreshold?: number,
    targetStudentId?: string
): Promise<FrameRecognitionResult> {
    const payload: { image: string; confidence_threshold?: number; target_student_id?: string } = { image };
    if (confidenceThreshold !== undefined) {
        payload.confidence_threshold = confidenceThreshold;
    }
    if (targetStudentId && targetStudentId !== "AUTO") {
        payload.target_student_id = targetStudentId;
    }
    const res = await api.post("/attendance/recognize-frame", payload);
    return res.data;
}

export async function getAdminSettings(): Promise<AdminSettingsData> {
    const res = await api.get("/admin/settings");
    return res.data;
}

export async function saveAdminSettings(data: AdminSettingsData): Promise<any> {
    const res = await api.post("/admin/settings", data);
    return res.data;
}

export async function getCurrentSession(): Promise<CurrentSessionResponse> {
    const res = await api.get("/attendance/session/current");
    return res.data;
}

export async function createSession(data: CreateSessionData) {
    const res = await api.post("/attendance/session/create", data);
    return res.data;
}

export async function endSession(sessionId: number) {
    const res = await api.post(`/attendance/session/${sessionId}/end`);
    return res.data;
}

export async function sendSessionHeartbeat(sessionId: number, confidence: number = 98.0, livenessPassed: boolean = true) {
    const res = await api.post(`/attendance/session/${sessionId}/heartbeat`, {
        confidence,
        liveness_passed: livenessPassed
    });
    return res.data;
}