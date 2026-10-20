export interface MeetingRecurrence {
  frequency: 'daily' | 'weekly' | 'monthly';
  weekdays?: number[];
  intervalWeeks?: number;
  monthDay?: number;
  until: Date;
  defaultEnd: boolean;
}

export function meetingRecurrenceLabel(recurrence: MeetingRecurrence): string {
  if (recurrence.frequency === 'monthly') return `Ngày ${recurrence.monthDay} hằng tháng`;
  if (recurrence.frequency === 'daily') {
    return recurrence.weekdays?.length === 5 && recurrence.weekdays.every((day, index) => day === index + 1)
      ? 'Thứ 2 đến thứ 6' : 'Hằng ngày';
  }
  const days = (recurrence.weekdays ?? []).map(day => day === 0 ? 'CN' : `thứ ${day + 1}`).join(', ');
  return `${recurrence.intervalWeeks && recurrence.intervalWeeks > 1 ? `Cứ ${recurrence.intervalWeeks} tuần` : 'Hằng tuần'}${days ? ` · ${days}` : ''}`;
}

/** Expand local calendar dates so a daylight-saving change keeps the spoken clock time. */
export function expandMeetingRecurrence(first: Date, recurrence: MeetingRecurrence): Date[] {
  const dates: Date[] = [];
  const lastDay = new Date(recurrence.until.getFullYear(), recurrence.until.getMonth(), recurrence.until.getDate(), 23, 59, 59, 999);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(lastDay.getTime())) return dates;

  if (recurrence.frequency === 'monthly') {
    const monthDay = recurrence.monthDay ?? first.getDate();
    for (let offset = 0; offset <= 1200; offset++) {
      const day = new Date(first.getFullYear(), first.getMonth() + offset, monthDay, first.getHours(), first.getMinutes());
      if (day > lastDay) break;
      if (day >= first && day.getDate() === monthDay) dates.push(day);
      if (dates.length > 1000) return [];
    }
    return dates;
  }

  const startWeek = (Date.UTC(first.getFullYear(), first.getMonth(), first.getDate()) / 86_400_000)
    - (first.getDay() + 6) % 7;
  for (let day = new Date(first); day <= lastDay; day = new Date(
    day.getFullYear(), day.getMonth(), day.getDate() + 1, first.getHours(), first.getMinutes(), 0, 0,
  )) {
    const weekday = day.getDay();
    if (recurrence.frequency === 'daily' && recurrence.weekdays?.length && !recurrence.weekdays.includes(weekday)) continue;
    if (recurrence.frequency === 'weekly') {
      if (!(recurrence.weekdays ?? [first.getDay()]).includes(weekday)) continue;
      const dayWeek = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000)
        - (weekday + 6) % 7;
      if ((dayWeek - startWeek) / 7 % (recurrence.intervalWeeks ?? 1) !== 0) continue;
    }
    dates.push(day);
    if (dates.length > 1000) return [];
  }
  return dates;
}
