/**
 * Utility hàm xử lý ngày tháng cho giao diện Lịch phong cách iPhone
 */

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dateKey: string;
}

export function generateMonthDays(year: number, month: number, today = new Date()): CalendarDay[] {
  const days: CalendarDay[] = [];

  // Ngày đầu tiên của tháng
  const firstDay = new Date(year, month, 1);
  // Thứ trong tuần của ngày 1 (0 = CN, 1 = T2 ... 6 = T7). Đổi sang tuần bắt đầu bằng T2 (0 = T2 ... 6 = CN)
  let startOffset = firstDay.getDay() - 1;
  if (startOffset === -1) startOffset = 6;

  // Lấy các ngày cuối của tháng trước để điền cho đủ hàng đầu
  const prevMonthDaysCount = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDaysCount - i);
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, today),
      dateKey: formatDateKey(d),
    });
  }

  // Các ngày trong tháng hiện tại
  const currentMonthDaysCount = getDaysInMonth(year, month);
  for (let i = 1; i <= currentMonthDaysCount; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: d,
      isCurrentMonth: true,
      isToday: isSameDay(d, today),
      dateKey: formatDateKey(d),
    });
  }

  // Điền các ngày đầu của tháng sau cho đủ tròn tuần (bội số của 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, today),
      dateKey: formatDateKey(d),
    });
  }

  return days;
}
