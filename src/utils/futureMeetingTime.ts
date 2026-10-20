/** A meeting must start strictly after the instant it is saved. */
export function isFutureMeetingTime(meetingTime: Date | string, now = new Date()): boolean {
  const timestamp = new Date(meetingTime).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export class PastMeetingTimeError extends Error {
  constructor() {
    super('Không thể đặt lịch vào thời điểm đã qua. Hãy chọn ngày giờ trong tương lai.');
    this.name = 'PastMeetingTimeError';
  }
}

export function assertFutureMeetingTime(meetingTime: Date | string, now = new Date()): void {
  if (!isFutureMeetingTime(meetingTime, now)) throw new PastMeetingTimeError();
}
