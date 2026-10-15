export type MeetingStatus = 'UPCOMING' | 'REMINDING' | 'ACKNOWLEDGED' | 'EXPIRED';

export interface Meeting {
  id: string;
  title: string;
  meetingTime: string; // ISO string
  advanceNoticeMinutes: number; // e.g., 15 (thời gian báo trước cuộc họp)
  repeatIntervalMinutes: number; // e.g., 5 (chu kỳ nhắc lặp nếu chưa bấm 'Đã nhớ')
  firstReminderTime: string; // ISO string: meetingTime - advanceNoticeMinutes
  status: MeetingStatus;
  acknowledgedAt?: string; // ISO string khi người dùng bấm 'Đã nhớ'
  nagCount: number; // Số lần đã phát nhắc nhở
  voiceText: string; // Câu sẽ đọc bằng TTS, ví dụ: "14 giờ, họp với team IT"
  createdAt: string;
}
