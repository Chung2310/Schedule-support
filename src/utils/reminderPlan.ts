import type { Meeting } from '../types/meeting';
import type { AppSettings } from '../types/settings';

export interface PlannedReminder {
  identifier: string;
  meeting: Meeting;
  date: Date;
  repeatIndex: number;
}

/** Only future requests are scheduled; their IDs remain stable across app launches. */
export function buildReminderPlan(
  meetings: Meeting[],
  settings: AppSettings,
  now = Date.now()
): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const repeatCount = settings.nagMaxCount > 0
    ? Math.min(4, Math.max(0, settings.nagMaxCount - 1))
    : 4;

  for (const meeting of meetings) {
    if (meeting.status !== 'UPCOMING' && meeting.status !== 'REMINDING') continue;
    const firstReminder = new Date(meeting.firstReminderTime).getTime();
    const meetingStart = new Date(meeting.meetingTime).getTime();
    if (!Number.isFinite(firstReminder) || !Number.isFinite(meetingStart)) continue;
    if (settings.stopOnMeetingStart && meetingStart <= now) continue;

    // A newly saved meeting may already be inside its advance-notice window.
    // Keep an initial reminder even when all original reminder times have passed.
    const catchUpTime = now + 1_000;
    if (meeting.status === 'UPCOMING' && firstReminder <= now &&
        (!settings.stopOnMeetingStart || catchUpTime < meetingStart)) {
      plan.push({
        identifier: `ceo-meeting-${meeting.id}-catch-up`,
        meeting,
        date: new Date(catchUpTime),
        repeatIndex: 0,
      });
    }

    const interval = meeting.repeatIntervalMinutes || settings.defaultRepeatIntervalMinutes || 5;
    for (let repeatIndex = 0; repeatIndex <= repeatCount; repeatIndex++) {
      const timestamp = firstReminder + repeatIndex * Math.max(1, interval) * 60_000;
      if (timestamp <= now) continue;
      if (repeatIndex > 0 && settings.stopOnMeetingStart && timestamp >= meetingStart) break;
      plan.push({
        identifier: `ceo-meeting-${meeting.id}-${repeatIndex}`,
        meeting,
        date: new Date(timestamp),
        repeatIndex,
      });
    }
  }

  return plan.sort((a, b) => a.date.getTime() - b.date.getTime() || a.repeatIndex - b.repeatIndex);
}
