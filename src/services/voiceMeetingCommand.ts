import type { Meeting } from '../types/meeting';
import { normalizeVietnameseVoiceText } from './vietnameseNormalizer';
import { parseVietnameseVoiceMeeting } from './nlpParser';
import { meetingEditFields, type MeetingEditFields } from '../utils/meetingEdit';

const verb = /^(?:thay đổi|cập nhật|điều chỉnh|đổi lại|sửa lại|sửa|đổi|dời|chuyển|lùi|hoãn|đẩy)(?!\p{L})\s*/u;
const timePattern = /(?<![\p{L}\p{N}])(\d{1,3})\s*(?:giờ|h|:)\s*(?:(kém)\s*)?(\d{1,3})?\s*(?:phút|p)?(?![\p{L}\p{N}])/gu;
const tidy = (text: string) => text.replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '').trim();

// Match a complete duration so an unrecognized second instruction is not lost.
function durationMinutes(text: string): number | null {
  const value = tidy(text).replace(/\s+và\s+/g, ' ');
  const hours = value.match(/^(\d+(?:[.,]\d+)?)\s*(?:giờ|tiếng|h)(?:\s*(\d+)\s*(?:phút|p)?)?$/u);
  const single = value.match(/^(\d+)\s*(phút|p|ngày|tuần)$/u);
  const minutes = hours ? Number(hours[1].replace(',', '.')) * 60 + Number(hours[2] ?? 0)
    : single ? Number(single[1]) * (single[2] === 'tuần' ? 10080 : single[2] === 'ngày' ? 1440 : 1) : NaN;
  return Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 525600 ? minutes : null;
}

function validateTime(text: string) {
  const times = [...text.matchAll(timePattern)];
  if (times.length > 1) throw new Error('Có nhiều giờ trong yêu cầu. Vui lòng chỉ rõ một giờ cần đổi.');
  if (times.some(time => Number(time[1]) > 23 || Number(time[3] ?? 0) > 59)) {
    throw new Error('Giờ không hợp lệ. Vui lòng nói lại giờ và phút.');
  }
}

function validateDate(text: string, date: Date) {
  if (/\d{1,2}[/-]\d{1,2}[/-]\d{4}|năm\s+\d{4}/u.test(text)) {
    throw new Error('Chưa hỗ trợ đổi năm bằng giọng nói. Bạn có thể sửa ngày bằng bàn phím.');
  }
  const match = text.match(/(?:ngày\s*)?(\d{1,2})\s*(?:tháng|\/|-)\s*(\d{1,2})/u);
  if (match && (date.getDate() !== Number(match[1]) || date.getMonth() + 1 !== Number(match[2]))) {
    throw new Error('Ngày không hợp lệ. Vui lòng kiểm tra lại ngày và tháng.');
  }
  const singleDay = !match && text.match(/(?:ngày|mùng)\s+(\d{1,2})(?!\d)/u);
  if (singleDay && !/\d+\s+(?:ngày|tuần)\s+nữa/u.test(text) && date.getDate() !== Number(singleDay[1])) {
    throw new Error('Ngày không tồn tại trong tháng. Vui lòng nói rõ ngày và tháng.');
  }
}

export function voiceEditCommand(input: string, meetings: Meeting[], now: Date) {
  let text = normalizeVietnameseVoiceText(input).toLowerCase();
  text = text.replace(/^(?:(?:tôi|mình|em)\s+(?:muốn|cần|nhờ bạn)|bạn có thể|làm ơn|vui lòng|giúp tôi|giúp mình|hãy)\s+/u, '')
    .replace(/^(?:hãy|giúp tôi|giúp mình)\s+/u, '')
    .replace(/\s+(?:giúp tôi|giúp mình|cho tôi|cho mình|nhé|nhá|ạ)[.!?]*$/u, '');
  text = tidy(text).replace(/^rời(?=\s+(?:lịch|cuộc họp|họp)(?!\p{L}))/u, 'dời');
  const reminderFirst = /^(?:báo trước|nhắc trước|nhắc lại)(?!\p{L})/u.test(text);
  const negative = /^(?:(?:tôi|mình)\s+)?(?:đừng|không|không cần|không muốn|đừng có)\s+(?:sửa|đổi|dời|rời|chuyển|lùi|hoãn)/u.test(text);
  if (!verb.test(text) && !reminderFirst && !negative) return null;
  let error: string | null = negative ? 'Yêu cầu có phủ định. Chưa áp dụng thay đổi nào.' : null;
  if (/tất cả|toàn bộ|các cuộc họp|các lịch|mỗi ngày|hàng ngày|hàng tuần/u.test(text)) {
    error = 'Hiện chỉ sửa từng cuộc họp. Vui lòng chọn một lịch cụ thể.';
  }
  const rename = /^(?:đổi|sửa|thay đổi|cập nhật)(?: lại)?\s+(?:tên|nội dung)(?!\p{L})/u.test(text);
  let body = text.replace(verb, '').replace(/^(?:giờ|thời gian|tên|nội dung)\s+(?:của\s+)?/u, '')
    .replace(/^(?:giúp tôi|giúp mình|cho tôi|cho mình)\s+/u, '');
  const reminders: { advance?: string; repeat?: string } = {};
  if (reminderFirst) {
    const match = body.match(/^(báo trước|nhắc trước|nhắc lại)\s+(.+?)\s+(?:cho|của)\s+(.+)$/u);
    if (match) {
      reminders[match[1] === 'nhắc lại' ? 'repeat' : 'advance'] = match[2];
      body = match[3];
    } else error = 'Vui lòng nói số phút và cuộc họp cần đổi nhắc lịch.';
  }
  const reminderStart = body.search(/\s+(?:và\s+)?(?:báo trước|nhắc trước|nhắc lại)(?!\p{L})/u);
  if (!rename && reminderStart >= 0) {
    const suffix = body.slice(reminderStart).trim().replace(/^và\s+/u, '');
    body = body.slice(0, reminderStart);
    for (const clause of suffix.split(/\s+(?:và\s+)?(?=báo trước|nhắc trước|nhắc lại)/u)) {
      const match = clause.replace(/^và\s+/u, '').match(/^(báo trước|nhắc trước|nhắc lại)\s+(.+)$/u);
      if (!match) { error = 'Chưa hiểu phần thay đổi nhắc lịch.'; continue; }
      const key = match[1] === 'nhắc lại' ? 'repeat' : 'advance';
      if (reminders[key] !== undefined) error = 'Có nhiều giá trị nhắc lịch khác nhau. Vui lòng nói lại.';
      reminders[key] = match[2];
    }
  }
  const split = body.match(/\s+(sớm hơn|sớm lên|muộn hơn|trễ hơn|lùi lại|sang|thành|thêm|đến|(?<!tuần\s)tới|lên|xuống|(?<!tuần\s)sau)\s+/u);
  const selector = tidy(split ? body.slice(0, split.index) : body).replace(/\s+từ\s+/gu, ' ');
  let operation = split?.[1] ?? '';
  let replacement = split ? tidy(body.slice((split.index ?? 0) + split[0].length)) : '';
  let source = selector;
  if (!split && /^(?:lùi|hoãn)\s/u.test(text)) {
    const tail = selector.match(/\s+(\d+\s*(?:giờ|tiếng|h|phút|p|ngày|tuần)(?:\s*\d+\s*(?:phút|p))?)$/u);
    if (tail && !/(?:lúc|từ|vào)\s*$/u.test(selector.slice(0, tail.index))) {
      operation = 'thêm'; replacement = tail[1]; source = selector.slice(0, tail.index);
    }
  }
  const old = parseVietnameseVoiceMeeting(source, now);
  try { validateTime(source); validateDate(source, old.datetime); } catch (issue) { error = (issue as Error).message; }
  const query = tidy(old.title.toLowerCase())
    .replace(/^(?:lịch\s*(?:hẹn\s*)?)?(?:cuộc\s*)?(?:họp\s*)?/u, '')
    .replace(/^(?:của\s+)?(?:cuộc\s+)?họp\s*/u, '').trim();
  const candidates = meetings.filter(meeting => {
    const date = new Date(meeting.meetingTime);
    const title = normalizeVietnameseVoiceText(meeting.title).toLowerCase();
    return (!query || title.includes(query))
      && (old.confidence.timeConfidence !== 'HIGH' || (date.getHours() === old.datetime.getHours() && date.getMinutes() === old.datetime.getMinutes()))
      && (old.confidence.dateConfidence !== 'EXPLICIT' || (date.getFullYear() === old.datetime.getFullYear() && date.getMonth() === old.datetime.getMonth() && date.getDate() === old.datetime.getDate()));
  }).sort((a, b) => a.meetingTime.localeCompare(b.meetingTime));
  return { text, operation, replacement, candidates, rename, reminders, error };
}

export function voiceEditFields(command: NonNullable<ReturnType<typeof voiceEditCommand>>, meeting: Meeting, now: Date): MeetingEditFields {
  const fields = meetingEditFields(meeting);
  const { operation, replacement, rename, reminders, error } = command;
  if (error) throw new Error(error);
  for (const key of ['advance', 'repeat'] as const) {
    if (reminders[key] === undefined) continue;
    const minutes = durationMinutes(reminders[key]);
    if (minutes === null) throw new Error('Chưa nhận được khoảng thời gian nhắc lịch hợp lệ.');
    fields[key] = String(minutes);
  }
  if (!replacement) {
    if (Object.keys(reminders).length && !operation) return fields;
    throw new Error('Chưa nhận được nội dung cần sửa.');
  }
  if (rename) {
    if (!['thành', 'sang'].includes(operation)) throw new Error('Vui lòng nói tên mới sau từ “thành”.');
    return { ...fields, title: replacement };
  }
  const originalDate = new Date(meeting.meetingTime);
  let next: Date;
  if (['thêm', 'sớm hơn', 'sớm lên', 'muộn hơn', 'trễ hơn', 'lùi lại', 'sau'].includes(operation)) {
    const minutes = durationMinutes(replacement);
    if (minutes === null || minutes === 0) throw new Error('Vui lòng nói rõ khoảng thời gian cần dời.');
    const base = operation === 'sau' ? now : originalDate;
    next = new Date(base.getTime() + (operation === 'sớm hơn' || operation === 'sớm lên' ? -1 : 1) * minutes * 60000);
  } else {
    const relative = replacement.match(/^sau\s+(.+?)(?:\s+nữa)?$|^(.+?)\s+nữa$/u);
    const minutes = relative ? durationMinutes(relative[1] ?? relative[2]) : null;
    if (relative && minutes !== null) next = new Date(now.getTime() + minutes * 60000);
    else {
      validateTime(replacement);
      const parsed = parseVietnameseVoiceMeeting(replacement, now, originalDate);
      validateDate(replacement, parsed.datetime);
      const residual = parsed.title.toLowerCase().replace(/cuộc họp quan trọng/g, '').replace(/^\d{1,2}$/u, '').trim();
      if (residual || (parsed.confidence.timeConfidence !== 'HIGH' && parsed.confidence.dateConfidence !== 'EXPLICIT')) {
        throw new Error('Chưa hiểu đầy đủ thời gian mới. Vui lòng nói rõ giờ hoặc ngày cần chuyển.');
      }
      next = parsed.datetime;
      if (parsed.confidence.timeConfidence !== 'HIGH') next.setHours(originalDate.getHours(), originalDate.getMinutes());
    }
  }
  if (!Number.isFinite(next.getTime())) throw new Error('Thời gian mới không hợp lệ.');
  const dateFields = meetingEditFields({ ...meeting, meetingTime: next.toISOString() });
  return { ...fields, date: dateFields.date, time: dateFields.time };
}
