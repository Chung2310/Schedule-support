import type { Meeting } from '../types/meeting';
import { assertFutureMeetingTime } from './futureMeetingTime';

export interface MeetingEditFields {
  title: string;
  date: string;
  time: string;
  advance: string;
  repeat: string;
}

/** Start a reschedule draft on a future minute, different from the old slot. */
export function suggestRescheduleTime(meeting: Meeting, now = new Date()): Date {
  const nextMinute = Math.ceil((now.getTime() + 30 * 60_000) / 60_000) * 60_000;
  const suggestion = new Date(nextMinute);
  if (Math.floor(suggestion.getTime() / 60_000) === Math.floor(new Date(meeting.meetingTime).getTime() / 60_000)) {
    suggestion.setTime(suggestion.getTime() + 15 * 60_000);
  }
  return suggestion;
}

export function meetingEditFields(meeting: Meeting): MeetingEditFields {
  const date = new Date(meeting.meetingTime);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    title: meeting.title,
    date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    advance: String(meeting.advanceNoticeMinutes),
    repeat: String(meeting.repeatIntervalMinutes),
  };
}

export function applyMeetingEdit(meeting: Meeting, fields: MeetingEditFields, now = new Date()): Meeting {
  const title = fields.title.trim();
  if (!title) throw new Error('Vui lòng nhập nội dung cuộc họp.');
  const dateMatch = fields.date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = fields.time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch) throw new Error('Ngày cần có dạng DD/MM/YYYY.');
  if (!timeMatch) throw new Error('Giờ cần có dạng HH:mm.');
  const [, day, month, year] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (year < 1900 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Ngày không hợp lệ.');
  }
  if (hour > 23 || minute > 59 || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error('Giờ không hợp lệ.');
  }
  if (date.getTime() !== new Date(meeting.meetingTime).getTime()) {
    assertFutureMeetingTime(date, now);
  }
  if (!/^\d+$/.test(fields.advance.trim()) || Number(fields.advance) > 10080) {
    throw new Error('Báo trước phải từ 0 đến 10080 phút.');
  }
  if (!/^\d+$/.test(fields.repeat.trim()) || Number(fields.repeat) < 1 || Number(fields.repeat) > 1440) {
    throw new Error('Nhắc lại phải từ 1 đến 1440 phút.');
  }
  const advance = Number(fields.advance);
  const repeat = Number(fields.repeat);
  const timingChanged = date.getTime() !== new Date(meeting.meetingTime).getTime()
    || advance !== meeting.advanceNoticeMinutes || repeat !== meeting.repeatIntervalMinutes;
  return {
    ...meeting,
    title,
    meetingTime: date.toISOString(),
    advanceNoticeMinutes: advance,
    repeatIntervalMinutes: repeat,
    firstReminderTime: new Date(date.getTime() - advance * 60000).toISOString(),
    voiceText: `${hour} giờ${minute ? ` ${minute} phút` : ''}. ${title}`,
    ...(timingChanged ? {
      status: date.getTime() > now.getTime() ? 'UPCOMING' as const : 'EXPIRED' as const,
      nagCount: 0,
      acknowledgedAt: undefined,
    } : {}),
  };
}
