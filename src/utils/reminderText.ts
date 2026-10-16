// Strip only the old generated label after the time, preserving the user's title.
export function cleanReminderText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
    .replace(/^(\d{1,2} giờ(?: \d{1,2} phút)?\.) Họp:\s*/i, '$1 ');
}
