export function formatAdvanceNotice(minutes: number, compact = false): string {
  if (minutes > 0 && minutes % 1440 === 0) return `${minutes / 1440} ngày`;
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60}${compact ? 'h' : ' giờ'}`;
  return `${minutes}${compact ? 'p' : ' phút'}`;
}
