import { normalizeVietnameseVoiceText } from './vietnameseNormalizer';
import { DEFAULT_SETTINGS, type DaypartTimeSettings } from '../types/settings';
import { normalizeClockTime } from '../utils/clockTime';
import type { MeetingRecurrence } from '../utils/recurringMeetings';

export interface ParsedMeetingResult {
  title: string;
  datetime: Date;
  rawText: string;
  normalizedText: string;
  voiceText: string;
  extractedDateStr: string;
  extractedTimeStr: string;
  defaultTimePeriod?: 'morning' | 'afternoon';
  recurrence?: MeetingRecurrence;
  confidence: {
    overall: number; // 0.0 - 1.0
    timeConfidence: 'HIGH' | 'MEDIUM' | 'INFERRED';
    dateConfidence: 'EXPLICIT' | 'TODAY_DEFAULT' | 'TOMORROW_DEFAULT' | 'SELECTED_DATE';
  };
}

const DAY_OF_WEEK_MAP: Record<string, number> = {
  'hai': 1,
  '2': 1,
  'ba': 2,
  '3': 2,
  'tư': 3,
  'bốn': 3,
  '4': 3,
  'năm': 4,
  '5': 4,
  'sáu': 5,
  '6': 5,
  'bảy': 6,
  '7': 6,
  'chủ nhật': 0,
  'cn': 0,
};

export function parseVietnameseVoiceMeeting(
  input: string,
  now: Date = new Date(),
  selectedDate?: Date,
  daypartTimes: Partial<DaypartTimeSettings> = DEFAULT_SETTINGS,
): ParsedMeetingResult {
  // BƯỚC 1: Chuẩn hóa số bằng chữ và tiếng lóng qua bộ Normalizer
  const normalizedText = normalizeVietnameseVoiceText(input);
  const lower = normalizedText.toLowerCase();

  // Durations require "sau" or "nữa"; a bare "17 phút" must not
  // turn a meeting's stated duration into its start time.
  const duration = String.raw`(?:\d+\s*(?:giờ|tiếng|h)(?:\s*\d+\s*(?:phút|p)?)?|\d+\s*(?:phút|p))(?![\p{L}\p{N}])`;
  const relativeTime = lower.match(new RegExp(`(?<![\\p{L}\\p{N}])(?<!tuần\\s)(?<!ngày\\s)(?:sau\\s+(${duration})(?:\\s+nữa)?|(${duration})\\s+nữa)(?![\\p{L}\\p{N}])`, 'u'));
  let relativeDatetime: Date | undefined;
  if (relativeTime) {
    const value = relativeTime[1] ?? relativeTime[2];
    const hours = value.match(/^(\d+)\s*(?:giờ|tiếng|h)(?:\s*(\d+))?/);
    const minutes = hours ? Number(hours[1]) * 60 + Number(hours[2] ?? 0) : parseInt(value, 10);
    const candidate = new Date(now.getTime() + minutes * 60000);
    if (Number.isFinite(candidate.getTime())) relativeDatetime = candidate;
  }

  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  let targetDate = now.getDate();
  const morningTime = normalizeClockTime(daypartTimes.defaultMorningTime) ?? DEFAULT_SETTINGS.defaultMorningTime;
  const afternoonTime = normalizeClockTime(daypartTimes.defaultAfternoonTime) ?? DEFAULT_SETTINGS.defaultAfternoonTime;
  let [targetHours, targetMinutes] = morningTime.split(':').map(Number);
  let defaultTimePeriod: ParsedMeetingResult['defaultTimePeriod'];

  let timeConfidence: 'HIGH' | 'MEDIUM' | 'INFERRED' = 'INFERRED';
  let dateConfidence: ParsedMeetingResult['confidence']['dateConfidence'] = 'TODAY_DEFAULT';

  let extractedTimeStr = '';
  let extractedDateStr = '';

  // BƯỚC 2: Phân tích Ngày (Date)
  // 2.1. Dạng Ngày DD tháng MM
  const dayMonthMatch = lower.match(/(?:ngày\s*)?(\d{1,2})\s*(?:tháng|\/|-)\s*(\d{1,2})/);
  const relativeMatch = lower.match(/(?:ngày\s+)?(\d{1,2})\s+(ngày|tuần)\s+nữa|sau\s+(\d{1,2})\s+(ngày|tuần)/);
  if (relativeMatch) {
    const count = Number(relativeMatch[1] ?? relativeMatch[3]);
    const unit = relativeMatch[2] ?? relativeMatch[4];
    const date = new Date(now);
    date.setDate(date.getDate() + count * (unit === 'tuần' ? 7 : 1));
    targetYear = date.getFullYear();
    targetMonth = date.getMonth();
    targetDate = date.getDate();
    dateConfidence = 'EXPLICIT';
    extractedDateStr = relativeMatch[0];
  } else if (dayMonthMatch) {
    const d = parseInt(dayMonthMatch[1], 10);
    const m = parseInt(dayMonthMatch[2], 10) - 1;
    if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
      targetDate = d;
      targetMonth = m;
      dateConfidence = 'EXPLICIT';
      extractedDateStr = `Ngày ${d} tháng ${m + 1}`;
    }
  }
  // 2.1.2. Dạng "ngày DD" hoặc "mùng DD" trong tháng
  else if (lower.match(/(?:ngày|mùng)\s*(\d{1,2})(?!\s*(?:tháng|\/|-))/)) {
    const singleMatch = lower.match(/(?:ngày|mùng)\s*(\d{1,2})/);
    if (singleMatch) {
      const d = parseInt(singleMatch[1], 10);
      if (d >= 1 && d <= 31) {
        targetDate = d;
        dateConfidence = 'EXPLICIT';
        extractedDateStr = `Ngày ${d}`;
      }
    }
  }
  // 2.2. Dạng Thứ trong tuần: "thứ 2", "thứ hai", "thứ sáu tuần sau"
  else {
    const dowMatch = lower.match(/(?:vào\s*)?(thứ\s*(?:hai|ba|tư|bốn|năm|sáu|bảy|2|3|4|5|6|7)|chủ nhật)/);
    if (dowMatch) {
      const dowKey = dowMatch[1].replace('thứ', '').trim();
      const targetDow = DAY_OF_WEEK_MAP[dowKey];
      if (targetDow !== undefined) {
        const isNextWeek = lower.includes('tuần sau') || lower.includes('tuần tới');
        const currentDow = now.getDay();
        let daysToAdd = (targetDow - currentDow + 7) % 7;
        if (isNextWeek || lower.includes('tuần này')) {
          daysToAdd = (targetDow + 6) % 7 - (currentDow + 6) % 7 + (isNextWeek ? 7 : 0);
        } else if (daysToAdd === 0) daysToAdd = 7;
        const d = new Date(now);
        d.setDate(d.getDate() + daysToAdd);
        targetDate = d.getDate();
        targetMonth = d.getMonth();
        targetYear = d.getFullYear();
        dateConfidence = 'EXPLICIT';
        extractedDateStr = `${dowMatch[1].toUpperCase()}${isNextWeek ? ' (tuần sau)' : ''}`;
      }
    }
    // 2.3. Dạng tương đối: ngày mai, ngày mốt, hôm nay
    else if (lower.includes('ngày mốt') || lower.includes('ngày kia')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      targetDate = d.getDate();
      targetMonth = d.getMonth();
      targetYear = d.getFullYear();
      dateConfidence = 'EXPLICIT';
      extractedDateStr = 'Ngày mốt';
    } else if (lower.includes('ngày mai') || lower.includes('sáng mai') || lower.includes('trưa mai') || lower.includes('chiều mai') || lower.includes('tối mai')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      targetDate = d.getDate();
      targetMonth = d.getMonth();
      targetYear = d.getFullYear();
      dateConfidence = 'EXPLICIT';
      extractedDateStr = 'Ngày mai';
    } else if (lower.includes('hôm nay') || lower.includes('sáng nay') || lower.includes('chiều nay') || lower.includes('tối nay') || lower.includes('trưa nay')) {
      dateConfidence = 'EXPLICIT';
      extractedDateStr = 'Hôm nay';
    }
  }

  // BƯỚC 3: Phân tích Giờ (Time)
  // Các mẫu: "14 giờ 30", "14 giờ", "14h30", "14:30", "9 giờ"
  const hourMinMatch = relativeDatetime ? null : lower.match(/(\d{1,2})\s*(?:giờ|h(?!\p{L})|:)\s*(?:(kém)\s*)?(\d{1,2})?\s*(?:phút)?/u);

  if (hourMinMatch) {
    let h = parseInt(hourMinMatch[1], 10);
    const m = hourMinMatch[3] ? parseInt(hourMinMatch[3], 10) : 0;
    // A daypart must be adjacent to the time, possibly across a relative day.
    const before = lower.slice(0, hourMinMatch.index);
    const after = lower.slice((hourMinMatch.index ?? 0) + hourMinMatch[0].length);
    const period = after.match(/^\s*(?:buổi\s*)?(sáng|trưa|chiều|tối|đêm)(?!\p{L})/u)?.[1]
      ?? before.match(/(sáng|trưa|chiều|tối|đêm)(?:\s+(?:nay|mai))?\s*(?:lúc\s*)?$/u)?.[1];
    if (period && ['chiều', 'tối'].includes(period) && h < 12) h += 12;
    // Noon spans late morning and early afternoon: 11 stays 11, 12 stays 12,
    // while a small 12-hour clock such as "1 giờ trưa" means 13:00.
    if (period === 'trưa' && h >= 1 && h < 6) h += 12;
    if ((period === 'sáng' || period === 'đêm') && h === 12) h = 0;
    if (period === 'đêm' && h >= 6 && h < 12) h += 12;
    const totalMinutes = (h * 60 + (hourMinMatch[2] ? -m : m) + 1440) % 1440;
    targetHours = Math.floor(totalMinutes / 60);
    targetMinutes = totalMinutes % 60;
    timeConfidence = 'HIGH';
    extractedTimeStr = `${targetHours} giờ` + (targetMinutes > 0 ? ` ${targetMinutes} phút` : '');
  }

  if (relativeDatetime) {
    dateConfidence = 'EXPLICIT';
    timeConfidence = 'HIGH';
    extractedDateStr = `Ngày ${relativeDatetime.getDate()} tháng ${relativeDatetime.getMonth() + 1}`;
    extractedTimeStr = `${relativeDatetime.getHours()} giờ ${relativeDatetime.getMinutes()} phút`;
  }

  // An explicit clock or elapsed duration always wins over a daypart default.
  if (!hourMinMatch && !relativeDatetime) {
    const daypart = lower.match(/(?<!\p{L})(?:buổi\s+)?(sáng|chiều)(?!\p{L})/u)?.[1];
    if (daypart) {
      defaultTimePeriod = daypart === 'sáng' ? 'morning' : 'afternoon';
      const time = defaultTimePeriod === 'morning' ? morningTime : afternoonTime;
      [targetHours, targetMinutes] = time.split(':').map(Number);
      timeConfidence = 'MEDIUM';
      extractedTimeStr = time;
    }
  }

  // Calendar selection is only a fallback. Spoken relative dates always use
  // the real device clock, never the day the user happens to be viewing.
  if (dateConfidence !== 'EXPLICIT' && selectedDate) {
    targetYear = selectedDate.getFullYear();
    targetMonth = selectedDate.getMonth();
    targetDate = selectedDate.getDate();
    dateConfidence = 'SELECTED_DATE';
    extractedDateStr = `Ngày ${targetDate} tháng ${targetMonth + 1} (đang chọn)`;
  }

  // Only infer tomorrow when neither speech nor the calendar specifies a day.
  let finalDate = relativeDatetime ?? new Date(targetYear, targetMonth, targetDate, targetHours, targetMinutes, 0);
  if (dateConfidence !== 'EXPLICIT' && dateConfidence !== 'SELECTED_DATE') {
    if (finalDate.getTime() < now.getTime()) {
      finalDate.setDate(finalDate.getDate() + 1);
      dateConfidence = 'TOMORROW_DEFAULT';
      extractedDateStr = 'Ngày mai (Mặc định do giờ hôm nay đã qua)';
    } else {
      dateConfidence = 'TODAY_DEFAULT';
      extractedDateStr = 'Hôm nay';
    }
  }

  const workdays = /(?:từ\s+)?thứ\s*(?:2|hai)\s+đến\s+thứ\s*(?:6|sáu)|ngày\s+làm\s+việc|các\s+ngày\s+trong\s+tuần/u.test(lower);
  const daily = workdays || /(?<!\p{L})(?:hàng|hằng|mỗi)\s+ngày(?!\p{L})/u.test(lower);
  const intervalMatch = lower.match(/cứ\s+(\d{1,2})\s+tuần(?:\s+một\s+lần)?|(?:mỗi|cách)\s+(\d{1,2})\s+tuần/u);
  const weekly = !daily && (/((?:hàng|hằng|mỗi)\s+tuần)(?!\p{L})/u.test(lower) || !!intervalMatch);
  const monthly = !daily && !weekly && /(?<!\p{L})(?:hàng|hằng|mỗi)\s+tháng(?!\p{L})/u.test(lower);
  let recurrence: MeetingRecurrence | undefined;
  if (daily || weekly || monthly) {
    const weekdayTokens = [...lower.matchAll(/(?:thứ\s*(?:hai|ba|tư|bốn|năm|sáu|bảy|2|3|4|5|6|7)|chủ nhật)/gu)];
    const weekdays = [...new Set(weekdayTokens.map(match => DAY_OF_WEEK_MAP[match[0].replace('thứ', '').trim()]))];
    const numericList = lower.match(/thứ\s*[2-7](?:(?:\s*,\s*|\s+và\s+)(?:thứ\s*)?[2-7])+/u)?.[0];
    if (numericList) {
      for (const digit of numericList.match(/[2-7]/g) ?? []) weekdays.push(Number(digit) - 1);
    }
    const selectedWeekdays = workdays ? [1, 2, 3, 4, 5] : [...new Set(weekdays)].sort((a, b) => a - b);
    if (weekly && !selectedWeekdays.length) selectedWeekdays.push(now.getDay());
    const monthDay = monthly ? Number(lower.match(/ngày\s+(\d{1,2})(?!\s*tháng)/u)?.[1] ?? now.getDate()) : undefined;
    let first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHours, targetMinutes, 0, 0);
    if (monthly) {
      for (let offset = 0; offset <= 12; offset++) {
        const candidate = new Date(now.getFullYear(), now.getMonth() + offset, monthDay, targetHours, targetMinutes);
        if (candidate.getDate() === monthDay && candidate > now) { first = candidate; break; }
      }
    } else {
      while (first <= now || (selectedWeekdays.length && !selectedWeekdays.includes(first.getDay()))) {
        first = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1, targetHours, targetMinutes);
      }
    }
    finalDate = first;
    dateConfidence = 'EXPLICIT';
    extractedDateStr = monthly ? `Ngày ${monthDay} hàng tháng`
      : workdays ? 'Thứ 2 đến thứ 6'
        : daily ? 'Hàng ngày' : `${weekdayTokens[0]?.[0] ?? 'Cùng thứ'} hàng tuần`;

    const endMatch = lower.match(/(?:đến|tới)\s+(?:hết\s+)?(?:ngày\s+(\d{1,2})\s+)?tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/u);
    const defaultEnd = !endMatch;
    let until: Date;
    if (endMatch) {
      const month = Number(endMatch[2]);
      const year = endMatch[3] ? Number(endMatch[3]) : first.getFullYear();
      until = endMatch[1]
        ? new Date(year, month - 1, Number(endMatch[1]), 23, 59, 59, 999)
        : new Date(year, month, 0, 23, 59, 59, 999);
      if (!endMatch[3] && until < first) until.setFullYear(until.getFullYear() + 1);
      if (month < 1 || month > 12 || (endMatch[1] && (Number(endMatch[1]) < 1 || until.getDate() !== Number(endMatch[1])))) {
        until = new Date(0);
      }
    } else {
      until = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }
    recurrence = {
      frequency: monthly ? 'monthly' : daily ? 'daily' : 'weekly',
      weekdays: selectedWeekdays.length ? selectedWeekdays : undefined,
      intervalWeeks: weekly ? Number(intervalMatch?.[1] ?? intervalMatch?.[2] ?? 1) : undefined,
      monthDay,
      until,
      defaultEnd,
    };
  }

  // BƯỚC 4: Phân tích Tiêu đề cuộc họp (Meeting Title)
  let cleaned = normalizedText;
  if (relativeDatetime && relativeTime) cleaned = cleaned.replace(relativeTime[0], '');

  // Lọc các tiền tố thường gặp
  const prefixes = [
    /^(?:hãy\s*)?(?:đặt|tạo|nhắc|lên|ghi)\s*(?:lịch|lịch họp|cuộc hẹn|hẹn)?(?:\s*cho\s*tôi|\s*tôi)?\s*/i,
    /^(?:nhắc\s*tôi|nhắc\s*lịch)\s*/i,
    /^(?:tôi\s*muốn\s*đặt\s*lịch|tôi\s*cần\s*họp)\s*/i,
  ];

  for (const regex of prefixes) {
    cleaned = cleaned.replace(regex, '');
  }

  // Xóa các cụm ngày giờ đã nhận diện khỏi tiêu đề
  cleaned = cleaned
    .replace(/(?:đến|tới)\s+(?:hết\s+)?(?:ngày\s+\d{1,2}\s+)?tháng\s+\d{1,2}(?:\s+năm\s+\d{4})?/giu, '')
    .replace(/(?:từ\s+)?thứ\s*(?:2|hai)\s+đến\s+thứ\s*(?:6|sáu)|ngày\s+làm\s+việc|các\s+ngày\s+trong\s+tuần/giu, '')
    .replace(/(?:thứ\s*(?:hai|ba|tư|bốn|năm|sáu|bảy|[2-7])|chủ nhật)(?:\s*(?:,|và)\s*(?:thứ\s*)?(?:hai|ba|tư|bốn|năm|sáu|bảy|[2-7]))+/giu, '')
    .replace(/cứ\s+\d{1,2}\s+tuần(?:\s+một\s+lần)?|(?:mỗi|cách)\s+\d{1,2}\s+tuần/giu, '')
    .replace(/(?<!\p{L})(?:hàng|hằng|mỗi)\s+(?:ngày|tuần|tháng)(?!\p{L})/giu, '')
    .replace(monthly ? /ngày\s+\d{1,2}(?!\s*tháng)/giu : /$^/g, '')
    .replace(/(?:ngày\s+)?\d{1,2}\s+(?:ngày|tuần)\s+nữa|sau\s+\d{1,2}\s+(?:ngày|tuần)/gi, '')
    .replace(/(?:vào\s*)?(?:lúc\s*)?\d{1,2}\s*(?:giờ|h(?!\p{L})|:)\s*(?:kém\s*)?\d{0,2}\s*(?:phút)?/giu, '')
    .replace(/(?:vào\s*)?(?:ngày\s*)?\d{1,2}\s*(?:tháng|\/|-)\s*\d{1,2}/gi, '')
    .replace(/(?:vào\s*)?(?:ngày\s*)?(?:hôm nay|ngày mai|ngày mốt|ngày kia)/gi, '')
    .replace(/(?:thứ\s*(?:hai|ba|tư|bốn|năm|sáu|bảy|2|3|4|5|6|7)|chủ nhật)(?:\s*tuần\s*(?:sau|tới|này))?/gi, '')
    .replace(/(?<!\p{L})(?:buổi\s*)?(?:sáng|trưa|chiều|tối|đêm)(?:\s*nay|\s*mai)?(?!\p{L})/giu, '')
    .replace(/\b(?:vào lúc|lúc|vào ngày|vào|ngày)\b/gi, ' ')
    .trim();

  // Dọn dẹp khoảng trắng kép và dấu câu
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[,.-]+|[,.-]+$/g, '').trim();

  let title = cleaned;
  if (!title || title.length < 2) {
    title = 'Cuộc họp quan trọng';
  } else {
    // Viết hoa chữ cái đầu
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // BƯỚC 5: Tối ưu câu đọc Text-to-Speech (TTS) rõ ràng, ngắt nhịp tự nhiên
  // Dấu chấm câu tạo khoảng nghỉ tự nhiên 0.4 giây giữa thời gian và nội dung
  const hourDisplay = finalDate.getHours();
  const minDisplay = finalDate.getMinutes();
  const timeVoice = minDisplay > 0 ? `${hourDisplay} giờ ${minDisplay} phút` : `${hourDisplay} giờ`;
  const voiceText = `${timeVoice}. ${title}`;

  // Tính toán điểm tin cậy tổng thể
  let overallScore = 0.5;
  if (timeConfidence === 'HIGH') overallScore += 0.35;
  if (dateConfidence === 'EXPLICIT') overallScore += 0.15;

  return {
    title,
    datetime: finalDate,
    rawText: input,
    normalizedText,
    voiceText,
    extractedDateStr,
    extractedTimeStr: extractedTimeStr || `${hourDisplay}:${minDisplay.toString().padStart(2, '0')}`,
    defaultTimePeriod,
    recurrence,
    confidence: {
      overall: Math.min(1.0, overallScore),
      timeConfidence,
      dateConfidence,
    },
  };
}

/** Split separate appointments only when every clause has its own spoken day and clock time. */
export function parseVietnameseVoiceSchedule(
  input: string,
  now: Date = new Date(),
  selectedDate?: Date,
  daypartTimes: Partial<DaypartTimeSettings> = DEFAULT_SETTINGS,
): ParsedMeetingResult[] {
  const normalized = normalizeVietnameseVoiceText(input);
  const clauses = normalized.split(/\s*[,;]\s*|\s+và\s+/u).map(clause => clause.trim()).filter(Boolean);
  if (clauses.length > 1) {
    const items = clauses.map(clause => parseVietnameseVoiceMeeting(clause, now, selectedDate, daypartTimes));
    if (items.every(item => !item.recurrence && item.confidence.timeConfidence === 'HIGH'
      && item.confidence.dateConfidence === 'EXPLICIT')) return items;
  }
  return [parseVietnameseVoiceMeeting(input, now, selectedDate, daypartTimes)];
}
