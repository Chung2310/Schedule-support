export interface AppSettings {
  dailyBriefingTime: string; // Giờ nhắc lịch tổng thể đầu ngày, định dạng HH:mm
  defaultMorningTime: string; // Giờ khi chỉ nói buổi sáng, định dạng HH:mm
  defaultAfternoonTime: string; // Giờ khi chỉ nói buổi chiều, định dạng HH:mm
  defaultAdvanceNoticeMinutes: number; // Mặc định: 15 phút
  defaultRepeatIntervalMinutes: number; // Mặc định: 5 phút
  speechPitch: number; // Cao độ (0.8 - 1.2, default 1.0)
  speechRate: number; // Tốc độ đọc (0.8 - 1.2, default 0.95)
  speechVoice?: string; // Mã giọng tiếng Việt trên thiết bị
  stopOnMeetingStart: boolean; // Tự động dừng nhắc khi tới giờ họp (mặc định: true)
  hapticEnabled: boolean; // Rung phản hồi báo thức (mặc định: true)
  nagMaxCount: number; // Giới hạn số lần nhắc (0 = không giới hạn, nhắc đến khi bấm Đã nhớ)
}

export const DEFAULT_SETTINGS: AppSettings = {
  dailyBriefingTime: '07:00',
  defaultMorningTime: '09:00',
  defaultAfternoonTime: '15:00',
  defaultAdvanceNoticeMinutes: 15,
  defaultRepeatIntervalMinutes: 5,
  speechPitch: 1.0,
  speechRate: 0.95,
  stopOnMeetingStart: true,
  hapticEnabled: true,
  nagMaxCount: 0,
};

export type DaypartTimeSettings = Pick<AppSettings, 'defaultMorningTime' | 'defaultAfternoonTime'>;
