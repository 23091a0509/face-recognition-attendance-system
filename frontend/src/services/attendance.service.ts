import api from "./api";

export interface AttendanceRecord {
    student_id: string;
    date: string;
    time: string;
    name?: string;
    department?: string;
    status?: "Present" | "Late" | "Absent";
    method?: string;
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
}

export async function recognizeFrame(image: string, confidenceThreshold: number = 0.65): Promise<FrameRecognitionResult> {
    const res = await api.post("/attendance/recognize-frame", {
        image,
        confidence_threshold: confidenceThreshold
    });
    return res.data;
}