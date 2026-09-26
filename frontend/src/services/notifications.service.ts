import api from "./api";

export interface NotificationItem {
    id: number;
    student_id: string | null;
    title: string;
    message: string;
    type: "attendance_success" | "low_attendance" | "announcement" | "correction" | string;
    severity: "success" | "warning" | "info" | "alert";
    is_read: boolean;
    created_at: string;
    action_url?: string;
    metadata?: any;
}

export interface NotificationResponse {
    total: number;
    unread_count: number;
    notifications: NotificationItem[];
}

export interface AnnouncementPayload {
    title: string;
    message: string;
    recipient?: string;
    priority?: "normal" | "high";
}

export interface CorrectionPayload {
    student_id: string;
    date: string;
    status: string;
    note?: string;
}

export const getNotifications = async (params?: {
    notif_type?: string;
    unread_only?: boolean;
}): Promise<NotificationResponse> => {
    try {
        const res = await api.get<NotificationResponse>("/notifications", { params });
        return {
            total: res?.data?.total ?? 0,
            unread_count: res?.data?.unread_count ?? 0,
            notifications: Array.isArray(res?.data?.notifications) ? res.data.notifications : [],
        };
    } catch (err) {
        console.error("Failed to fetch notifications:", err);
        return {
            total: 0,
            unread_count: 0,
            notifications: [],
        };
    }
};

export const broadcastAnnouncement = async (payload: AnnouncementPayload) => {
    const res = await api.post("/notifications/announcement", payload);
    return res.data;
};

export const triggerLowAttendanceCheck = async (threshold_percentage: number = 75.0) => {
    const res = await api.post("/notifications/trigger-low-attendance-check", {
        threshold_percentage,
    });
    return res.data;
};

export const sendAttendanceCorrection = async (payload: CorrectionPayload) => {
    const res = await api.post("/notifications/attendance-correction", payload);
    return res.data;
};

export const markNotificationRead = async (id: number) => {
    const res = await api.post(`/notifications/${id}/read`);
    return res.data;
};

export const markAllNotificationsRead = async () => {
    const res = await api.post("/notifications/mark-all-read");
    return res.data;
};

export const deleteNotification = async (id: number) => {
    const res = await api.delete(`/notifications/${id}`);
    return res.data;
};
