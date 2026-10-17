export const COLOR_STORAGE_KEY = 'notes.calendarColor';

export const CALENDAR_COLORS = ['#FFFFFF', '#00ADFC', '#F5B400', '#31B66A', '#2875E8', '#E74C3C', '#F58220', '#7651D6'];

export function getCalendarCardBackground(color: string): string {
  const value = Number.parseInt(color.slice(1), 16);
  const mixWithWhite = (channel: number) => Math.round(channel * 0.16 + 255 * 0.84);
  const red = mixWithWhite((value >> 16) & 255);
  const green = mixWithWhite((value >> 8) & 255);
  const blue = mixWithWhite(value & 255);
  return `rgb(${red}, ${green}, ${blue})`;
}
