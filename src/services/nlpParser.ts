import { normalizeVietnameseVoiceText } from './vietnameseNormalizer';

export interface ParsedMeetingResult {
  title: string;
  datetime: Date;
  rawText: string;
  normalizedText: string;
  voiceText: string;
  extractedDateStr: string;
  extractedTimeStr: string;
  confidence: {
    overall: number; // 0.0 - 1.0
    timeConfidence: 'HIGH' | 'MEDIUM' | 'INFERRED';
    dateConfidence: 'EXPLICIT' | 'TODAY_DEFAULT' | 'TOMORROW_DEFAULT';
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
  now: Date = new Date()
): ParsedMeetingResult {
  // BƯỚC 1: Chuẩn hóa số bằng chữ và tiếng lóng qua bộ Normalizer
  const normalizedText = normalizeVietnameseVoiceText(input);
  const lower = normalizedText.toLowerCase();

  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  let targetDate = now.getDate();
  let targetHours = 9; // Giờ mặc định
  let targetMinutes = 0;

  let timeConfidence: 'HIGH' | 'MEDIUM' | 'INFERRED' = 'INFERRED';
  let dateConfidence: 'EXPLICIT' | 'TODAY_DEFAULT' | 'TOMORROW_DEFAULT' = 'TODAY_DEFAULT';

  let extractedTimeStr = '';
  let extractedDateStr = '';

  // BƯỚC 2: Phân tích Ngày (Date)
  // 2.1. Dạng Ngày DD tháng MM
  const dayMonthMatch = lower.match(/(?:ngày\s*)?(\d{1,2})\s*(?:tháng|\/|-)\s*(\d{1,2})/);
  if (dayMonthMatch) {
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
        if (daysToAdd === 0 || isNextWeek) {
          daysToAdd += isNextWeek ? 7 : (daysToAdd === 0 ? 7 : 0);
        }
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
    } else if (lower.includes('ngày mai') || lower.includes('sáng mai') || lower.includes('chiều mai') || lower.includes('tối mai')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      targetDate = d.getDate();
      targetMonth = d.getMonth();
      targetYear = d.getFullYear();
      dateConfidence = 'EXPLICIT';
      extractedDateStr = 'Ngày mai';
    } else if (lower.includes('hôm nay') || lower.includes('chiều nay') || lower.includes('tối nay') || lower.includes('trưa nay')) {
      dateConfidence = 'EXPLICIT';
      extractedDateStr = 'Hôm nay';
    }
  }

  // BƯỚC 3: Phân tích Giờ (Time)
  // Các mẫu: "14 giờ 30", "14 giờ", "14h30", "14:30", "9 giờ"
  const hourMinMatch = lower.match(/(\d{1,2})\s*(?:giờ|h|:)\s*(\d{1,2})?/);

  if (hourMinMatch) {
    let h = parseInt(hourMinMatch[1], 10);
    const m = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
    targetHours = h;
    targetMinutes = m;
    timeConfidence = 'HIGH';
    extractedTimeStr = `${targetHours} giờ` + (m > 0 ? ` ${m} phút` : '');
  }

  // Nếu không ghi ngày mà giờ hẹn đã qua trong hôm nay -> tự động chuyển sang ngày mai
  const finalDate = new Date(targetYear, targetMonth, targetDate, targetHours, targetMinutes, 0);
  if (dateConfidence !== 'EXPLICIT') {
    if (finalDate.getTime() < now.getTime()) {
      finalDate.setDate(finalDate.getDate() + 1);
      dateConfidence = 'TOMORROW_DEFAULT';
      extractedDateStr = 'Ngày mai (Mặc định do giờ hôm nay đã qua)';
    } else {
      dateConfidence = 'TODAY_DEFAULT';
      extractedDateStr = 'Hôm nay';
    }
  }

  // BƯỚC 4: Phân tích Tiêu đề cuộc họp (Meeting Title)
  let cleaned = normalizedText;

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
    .replace(/(?:vào\s*)?(?:lúc\s*)?\d{1,2}\s*(?:giờ|h|:)\s*\d{0,2}\s*(?:phút)?/gi, '')
    .replace(/(?:vào\s*)?(?:ngày\s*)?\d{1,2}\s*(?:tháng|\/|-)\s*\d{1,2}/gi, '')
    .replace(/(?:vào\s*)?(?:ngày\s*)?(?:hôm nay|ngày mai|ngày mốt|ngày kia)/gi, '')
    .replace(/(?:thứ\s*(?:hai|ba|tư|bốn|năm|sáu|bảy|2|3|4|5|6|7)|chủ nhật)(?:\s*tuần\s*(?:sau|tới))?/gi, '')
    .replace(/(?:sáng|trưa|chiều|tối)(?:\s*nay|\s*mai)?/gi, '')
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
  const voiceText = `${timeVoice}. Họp: ${title}`;

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
    confidence: {
      overall: Math.min(1.0, overallScore),
      timeConfidence,
      dateConfidence,
    },
  };
}
