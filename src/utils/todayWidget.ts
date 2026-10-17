import type { Meeting } from '../types/meeting';

export interface TodayWidgetProps {
  ready: boolean;
  dateLabel: string;
  total: number;
  remaining: number;
  nextTime: string;
  nextTitle: string;
  rows: { id: string; time: string; title: string; past: boolean }[];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Publish transitions for every known meeting day, followed by an undated empty state.
 * Nothing runs in the background: WidgetKit receives these dates ahead of time.
 */
export function buildTodayWidgetTimeline(meetings: Meeting[], now = new Date()) {
  const nowTime = now.getTime();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = new Map<string, { meeting: Meeting; date: Date }[]>();
  const transitions = new Set<number>([nowTime]);

  for (const meeting of meetings) {
    const date = new Date(meeting.meetingTime);
    const time = date.getTime();
    if (!Number.isFinite(time) || time < startToday) continue;
    const key = dayKey(date);
    const list = days.get(key) ?? [];
    list.push({ meeting, date });
    days.set(key, list);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    if (midnight > nowTime) transitions.add(midnight);
    transitions.add(nextMidnight);
    // Keep the appointment visible as "next" throughout its starting minute.
    const afterStartMinute = time - (time % 60_000) + 60_000;
    if (afterStartMinute > nowTime) transitions.add(afterStartMinute);
  }
  for (const list of days.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());

  return [...transitions].sort((a, b) => a - b).map((timestamp) => {
    const date = new Date(timestamp);
    const list = days.get(dayKey(date)) ?? [];
    const minuteStart = timestamp - (timestamp % 60_000);
    // Binary search avoids scanning a busy day's entire agenda for every entry.
    let low = 0;
    let high = list.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (list[middle].date.getTime() < minuteStart) low = middle + 1;
      else high = middle;
    }
    const next = list[low];
    const start = Math.max(0, Math.min(low, list.length - 6));
    const props: TodayWidgetProps = {
      ready: true,
      // Empty entries deliberately have no fixed date, even after the final event.
      dateLabel: list.length ? `${date.getDate()}/${date.getMonth() + 1}` : '',
      total: list.length,
      remaining: list.length - low,
      nextTime: next ? clock(next.date) : '',
      nextTitle: next ? next.meeting.title.trim().slice(0, 120) || 'Lịch hẹn' : '',
      rows: list.slice(start, start + 6).map(({ meeting, date: meetingDate }) => ({
        id: meeting.id,
        time: clock(meetingDate),
        title: meeting.title.trim().slice(0, 120) || 'Lịch hẹn',
        past: meetingDate.getTime() < minuteStart,
      })),
    };
    return { date, props };
  });
}
