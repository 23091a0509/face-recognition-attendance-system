import api from "./api";

export interface Student {
    student_id: string;
    name: string;
    department: string;
    has_face?: boolean;
    face_status?: "registered" | "needs_update" | "not_registered";
    total_present?: number;
    attendance_rate?: number;
    year?: string;
    email?: string;
}

export async function getAllStudents(): Promise<Student[]> {
    const response = await api.get("/students/all");
    return response.data;
}

export async function registerStudent(formData: FormData) {
    const res = await api.post("/students/register", formData, {
        headers: {
            "Content-Type": "multipart/form-data"
        }
    });
    return res.data;
}

export async function deleteStudent(studentId: string) {
    const res = await api.delete(`/students/${studentId}`);
    return res.data;
}

export async function updateStudentFace(studentId: string, formData: FormData) {
    const res = await api.post(`/students/${studentId}/update-face`, formData, {
        headers: {
            "Content-Type": "multipart/form-data"
        }
    });
    return res.data;
}