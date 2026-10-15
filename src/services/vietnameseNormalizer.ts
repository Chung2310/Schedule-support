/**
 * Bộ chuẩn hóa tiếng Việt cho giọng nói (Vietnamese Speech Normalizer)
 * Giải quyết triệt để vấn đề Speech-to-Text trả về số dạng chữ (ví dụ: "mười bốn giờ", "chín rưỡi", "ba giờ chiều")
 */

const VN_DIGITS: Record<string, number> = {
  'không': 0,
  'một': 1,
  'mốt': 1,
  'hai': 2,
  'hăm': 20,
  'ba': 3,
  'bốn': 4,
  'tư': 4,
  'năm': 5,
  'lăm': 5,
  'sáu': 6,
  'bảy': 7,
  'bẩy': 7,
  'tám': 8,
  'chín': 9,
  'mười': 10,
};

/**
 * Chuyển đổi chuỗi số bằng chữ tiếng Việt sang số nguyên
 * Ví dụ: "mười lăm" -> 15, "hai mươi" -> 20, "hai mươi lăm" -> 25, "ba mươi" -> 30, "bốn lăm" -> 45
 */
export function wordsToNumber(text: string): number | null {
  const words = text.trim().toLowerCase().split(/\s+/);
  if (words.length === 0) return null;

  // Nếu đã là số nguyên
  if (/^\d+$/.test(text.trim())) {
    return parseInt(text.trim(), 10);
  }

  // Đơn vị đặc biệt
  if (words.length === 1) {
    if (words[0] === 'mười') return 10;
    if (words[0] === 'hăm') return 20;
    if (VN_DIGITS[words[0]] !== undefined) return VN_DIGITS[words[0]];
    return null;
  }

  let total = 0;
  if (words[0] === 'mười') {
    // mười một -> 11, mười lăm -> 15...
    const unit = words[1] === 'năm' || words[1] === 'lăm' ? 5 : (VN_DIGITS[words[1]] ?? 0);
    return 10 + unit;
  }

  if (words[0] === 'hăm') {
    // hăm mốt -> 21, hăm lăm -> 25...
    const unit = words[1] === 'mốt' ? 1 : words[1] === 'lăm' ? 5 : (VN_DIGITS[words[1]] ?? 0);
    return 20 + unit;
  }

  // Chục + đơn vị: hai mươi, hai mươi lăm, ba mươi, bốn mươi lăm...
  if (words.length >= 2) {
    const tensDigit = VN_DIGITS[words[0]];
    if (tensDigit !== undefined) {
      if (words[1] === 'mươi') {
        total = tensDigit * 10;
        if (words[2]) {
          const unit = words[2] === 'mốt' ? 1 : words[2] === 'lăm' || words[2] === 'năm' ? 5 : (VN_DIGITS[words[2]] ?? 0);
          total += unit;
        }
        return total;
      }
      // Dạng nói tắt: "hai lăm" -> 25, "ba lăm" -> 35
      if (words[1] === 'lăm' || words[1] === 'năm') {
        return tensDigit * 10 + 5;
      }
    }
  }

  return null;
}

/**
 * Chuẩn hóa toàn bộ câu nói bằng cách biến đổi các cụm từ số thành chữ số
 */
export function normalizeVietnameseVoiceText(raw: string): string {
  let text = raw.toLowerCase().trim();

  // 1. Chuẩn hóa lỗi nhận diện phổ biến của Google/Apple Speech
  text = text
    .replace(/\b(ai ti|i t|ai-ti)\b/gi, 'IT')
    .replace(/\b(hđqt|hội đồng quản trị)\b/gi, 'Hội đồng Quản trị')
    .replace(/\b(ceo|xi i ô)\b/gi, 'CEO')
    .replace(/\b(marketing|mác két tinh)\b/gi, 'Marketing');

  // 2. Xử lý "rưỡi" -> "30 phút"
  text = text.replace(/(\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mười một|mười hai)\s*(?:giờ|h)?\s*rưỡi/g, (match, p1) => {
    return `${p1} giờ 30 phút`;
  });

  // 3. Xử lý "giờ kém" (ví dụ: "3 giờ kém 15" -> "2 giờ 45", "10 giờ kém 10" -> "9 giờ 50")
  text = text.replace(/(\d{1,2})\s*(?:giờ|h)\s*kém\s*(\d{1,2}|mười|mười lăm|hai mươi)/g, (match, hStr, mStr) => {
    let h = parseInt(hStr, 10);
    let m = wordsToNumber(mStr) || parseInt(mStr, 10) || 15;
    let targetH = (h - 1 + 24) % 24;
    let targetM = 60 - m;
    return `${targetH} giờ ${targetM} phút`;
  });

  // 4. Chuyển đổi "ngày [số bằng chữ] tháng [số bằng chữ]"
  text = text.replace(/ngày\s+([a-zà-ỹ\s]+)\s+tháng\s+([a-zà-ỹ\s]+)/gi, (match, dWords, mWords) => {
    const d = wordsToNumber(dWords);
    const m = wordsToNumber(mWords);
    if (d && m) {
      return `ngày ${d} tháng ${m}`;
    }
    return match;
  });

  // 5. Chuyển đổi "[số bằng chữ] giờ [số bằng chữ]"
  // Ví dụ: "mười bốn giờ ba mươi" -> "14 giờ 30"
  text = text.replace(/([a-zà-ỹ\s]+)\s*(?:giờ|h)\s*([a-zà-ỹ\s]+)?/gi, (match, hWords, mWords) => {
    const h = wordsToNumber(hWords.trim());
    if (h !== null && h >= 0 && h <= 24) {
      if (mWords && mWords.trim()) {
        const m = wordsToNumber(mWords.trim());
        if (m !== null && m >= 0 && m < 60) {
          return `${h} giờ ${m} phút `;
        }
      }
      return `${h} giờ `;
    }
    return match;
  });

  // 6. Xử lý buổi chiều/tối sau giờ: "3 giờ chiều" -> "15 giờ", "8 giờ tối" -> "20 giờ"
  text = text.replace(/(\d{1,2})\s*(?:giờ|h)?\s*(?:phút\s*)?(\d{1,2})?\s*(?:buổi\s*)?(chiều|tối)/gi, (match, hStr, mStr) => {
    let h = parseInt(hStr, 10);
    const m = mStr ? parseInt(mStr, 10) : 0;
    if (h < 12) h += 12;
    return `${h} giờ ${m > 0 ? `${m} phút` : ''} `;
  });

  // 7. Xử lý buổi chiều/tối/sáng đặt trước giờ: "chiều mai 3h" -> "15h chiều mai", "tối 8h30" -> "20h30 tối"
  text = text.replace(/(?:buổi\s*)?(chiều|tối)\s*(?:lúc\s*)?(\d{1,2})\s*(?:giờ|h)?(?:\s*(\d{1,2}))?/gi, (match, period, hStr, mStr) => {
    let h = parseInt(hStr, 10);
    const m = mStr ? parseInt(mStr, 10) : 0;
    if (h < 12) h += 12;
    return `${h} giờ ${m > 0 ? `${m} phút` : ''} ${period} `;
  });

  // 8. Xử lý "sáng 9h" / "sáng lúc 8h30"
  text = text.replace(/(?:buổi\s*)?(sáng)\s*(?:lúc\s*)?(\d{1,2})\s*(?:giờ|h)?(?:\s*(\d{1,2}))?/gi, (match, period, hStr, mStr) => {
    let h = parseInt(hStr, 10);
    const m = mStr ? parseInt(mStr, 10) : 0;
    return `${h} giờ ${m > 0 ? `${m} phút` : ''} sáng `;
  });

  // Dọn dẹp khoảng trắng kép
  return text.replace(/\s+/g, ' ').trim();
}
