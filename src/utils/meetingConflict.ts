import type { Meeting } from '../types/meeting';

/** Calendar input has minute precision; seconds must not bypass collision checks. */
export function meetingMinute(meetingTime: string): number {
  return Math.floor(new Date(meetingTime).getTime() / 60_000);
}

export function findMeetingTimeConflict(
  meetings: Meeting[],
  meetingTime: string,
  excludeId?: string,
): Meeting | undefined {
  const minute = meetingMinute(meetingTime);
  if (!Number.isFinite(minute)) return undefined;
  // Acknowledging a reminder does not cancel the appointment or free its time.
  return meetings.find((meeting) => meeting.id !== excludeId && meetingMinute(meeting.meetingTime) === minute);
}

export function meetingConflictMessage(meeting: Meeting): string {
  const date = new Date(meeting.meetingTime);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())} ngày ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const title = meeting.title.trim().slice(0, 120) || 'Lịch hẹn';
  return `Trùng lịch với “${title}” lúc ${time}. Hãy chọn giờ khác hoặc sửa lịch đã có.`;
}

export class MeetingConflictError extends Error {
  constructor(public readonly conflict: Meeting) {
    super(meetingConflictMessage(conflict));
    this.name = 'MeetingConflictError';
  }
}

export function assertMeetingTimeAvailable(meetings: Meeting[], meetingTime: string, excludeId?: string): void {
  if (!Number.isFinite(meetingMinute(meetingTime))) throw new Error('Ngày giờ lịch hẹn không hợp lệ.');
  const conflict = findMeetingTimeConflict(meetings, meetingTime, excludeId);
  if (conflict) throw new MeetingConflictError(conflict);
}
