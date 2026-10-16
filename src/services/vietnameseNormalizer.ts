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
export function normalizeVietnameseVoiceText(raw: string): string {
  let text = raw.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/(^|\s)hôm này(?=$|[\s,.!?;:])/g, '$1hôm nay');
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
