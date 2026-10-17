const DIGITS: Record<string, number> = {
  không: 0, một: 1, mốt: 1, hai: 2, ba: 3, bốn: 4, tư: 4,
  năm: 5, lăm: 5, sáu: 6, bảy: 7, bẩy: 7, tám: 8, chín: 9,
};
export function wordsToNumber(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  const words = value.split(/\s+/);
  if (words.length === 1) return DIGITS[value] ?? (value === 'mười' ? 10 : value === 'hăm' ? 20 : null);
  if (words.length === 2 && (words[0] === 'mười' || words[0] === 'hăm') && DIGITS[words[1]] !== undefined) {
    return (words[0] === 'mười' ? 10 : 20) + DIGITS[words[1]];
  }
  if (DIGITS[words[0]] !== undefined && words[1] === 'mươi' && words.length <= 3) {
    const unit = words.length === 2 ? 0 : DIGITS[words[2]];
    return unit === undefined ? null : DIGITS[words[0]] * 10 + unit;
  }
  if (words.length === 2 && DIGITS[words[0]] !== undefined && /^(lăm|năm)$/.test(words[1])) return DIGITS[words[0]] * 10 + 5;
  return null;
}
// Convert numbers only beside date/time units, preserving words in the title.
const digit = Object.keys(DIGITS).join('|');
const numberWords = `(?:(?:${digit})\\s+mươi(?:\\s+(?:${digit}))?|(?:mười|hăm)(?:\\s+(?:${digit}))?|(?:${digit})(?:\\s+lăm)?)`;
const number = `(?:\\d{1,2}|${numberWords})`;
const start = '(?<![\\p{L}\\p{N}])';
const end = '(?![\\p{L}\\p{N}])';

// Speech recognition can transcribe a clock time as HH.MM or HH,MM. Normalize it once
// for both creating meetings and editing them by voice. Two minute digits and
// token boundaries avoid treating versions, dates or decimal durations as times.
function normalizeClockSeparators(text: string): string {
  return text.replace(
    /(?<![\p{L}\p{N}.,/])(\d{1,2})\s*[.,]\s*(\d{2})(?:\s*(?:giờ|h)(?![\p{L}\p{N}]))?(?![\p{L}\p{N}]|\s*[.,/]\s*\d)/gu,
    (match: string, hour: string, minute: string, offset: number, source: string) => {
      if (Number(hour) > 23 || Number(minute) > 59) return match;
      const before = source.slice(0, offset);
      const after = source.slice(offset + match.length);
      if (/(?:ngày|mùng|tháng|phiên bản|version|mã|giá|doanh số|doanh thu)\s*$/u.test(before)) return match;
      if (/^\s*(?:phút|p|tiếng|triệu|tỷ|tỉ|nghìn|ngàn|đồng|vnd|usd|kg|km|mét|lít|độ|gb|mb|%)(?![\p{L}\p{N}])/u.test(after)) return match;
      // "15.30 ngày mai" is a clock followed by a date, whereas
      // "thêm 1.50 ngày" is a decimal duration.
      const dateFollows = /^\s*(?:ngày\s+(?:mai|mốt|kia|\d{1,2}|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|hăm)|tuần\s+(?:sau|tới|này))(?![\p{L}\p{N}])/u.test(after);
      if (/^\s*(?:ngày|tuần)(?![\p{L}\p{N}])/u.test(after) && !dateFollows) return match;
      if (/(?:sau|trước|thêm|bớt|sớm hơn|sớm lên|muộn hơn|trễ hơn|lùi lại|nhắc lại)\s*$/u.test(before) && /(?:giờ|h)$/u.test(match)) return match;
      return `${hour.padStart(2, '0')}:${minute}`;
    }
  );
}

export function normalizeVietnameseVoiceText(raw: string): string {
  let text = raw.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/(^|\s)hôm này(?=$|[\s,.!?;:])/g, '$1hôm nay');
  text = normalizeClockSeparators(text);
  for (const [pattern, replacement] of [
    ['ai ti|i t|ai-ti', 'IT'], ['hđqt|hội đồng quản trị', 'Hội đồng Quản trị'],
    ['ceo|xi i ô', 'CEO'], ['marketing|mác két tinh', 'Marketing'],
  ]) text = text.replace(new RegExp(`${start}(?:${pattern})${end}`, 'giu'), replacement);
  text = text.replace(new RegExp(`${start}(${number})\\s*(?:giờ|h)${end}`, 'gu'), (_, n: string) => `${wordsToNumber(n)} giờ`);
  text = text.replace(new RegExp(`(giờ\\s*(?:kém\\s*)?)(${number})${end}`, 'gu'), (_, prefix: string, n: string) => `${prefix}${wordsToNumber(n)}`);
  text = text.replace(new RegExp(`${start}(${number})\\s*(?:giờ\\s*)?rưỡi${end}`, 'gu'), (_, n: string) => `${wordsToNumber(n)} giờ 30 phút`);
  text = text.replace(new RegExp(`${start}(ngày|mùng|tháng)\\s+(${numberWords})${end}`, 'gu'),
    (match, unit: string, n: string) => n === 'mốt' && unit === 'ngày' ? match : `${unit} ${wordsToNumber(n)}`);
  text = text.replace(new RegExp(`${start}(${numberWords})(?=\\s+(?:ngày|tuần)${end})`, 'gu'), (_, n: string) => String(wordsToNumber(n)));
  text = text.replace(new RegExp(`${start}(${numberWords})(?=\\s+(?:phút|tiếng)${end})`, 'gu'), (_, n: string) => String(wordsToNumber(n)));
  text = text.replace(/nửa\s+(?:giờ|tiếng)(?!\p{L})/gu, '30 phút')
    .replace(/(\d+)\s+tiếng\s+rưỡi(?!\p{L})/gu, '$1 giờ 30 phút');
  return text.replace(/\s+/g, ' ').trim();
}
