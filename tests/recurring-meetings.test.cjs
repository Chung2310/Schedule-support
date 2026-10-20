const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const load = createLoader();
const { parseVietnameseVoiceMeeting: parse, parseVietnameseVoiceSchedule: parseSchedule } = load('src/services/nlpParser.ts');
const { expandMeetingRecurrence: expand } = load('src/utils/recurringMeetings.ts');

function parts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

test('daily voice request starts at the next occurrence and ignores the selected calendar date', () => {
  const now = new Date(2026, 9, 20, 18);
  const result = parse('đặt lịch 17h50 hàng ngày chấm công về', now, new Date(2026, 11, 1));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Chấm công về');
  assert.deepEqual(parts(dates[0]), [2026, 10, 21, 17, 50]);
  assert.deepEqual(parts(dates[1]), [2026, 10, 22, 17, 50]);
  assert.equal(result.recurrence.defaultEnd, true);
  assert.deepEqual(parts(dates.at(-1)), [2027, 10, 20, 17, 50]);
});

test('weekly voice request uses the spoken weekday and includes the final month', () => {
  const result = parse('đặt lịch họp thứ 4 hàng tuần đến hết tháng 11', new Date(2026, 9, 20, 9));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Họp');
  assert.equal(result.confidence.timeConfidence, 'INFERRED');
  assert.deepEqual(parts(dates[0]), [2026, 10, 21, 9, 0]);
  assert.deepEqual(parts(dates.at(-1)), [2026, 11, 25, 9, 0]);
  assert.equal(dates.length, 6);
});

test('local clock time stays fixed while expanding calendar dates', () => {
  const first = new Date(2026, 2, 7, 17, 50);
  const dates = expand(first, { frequency: 'daily', until: new Date(2026, 2, 10), defaultEnd: false });
  assert.equal(dates.length, 4);
  assert.ok(dates.every(date => date.getHours() === 17 && date.getMinutes() === 50));
});

test('a weekly meeting later today starts today, then repeats seven days later', () => {
  const result = parse('đặt lịch họp thứ 4 hàng tuần lúc 17h50 đến hết tháng 11', new Date(2026, 9, 21, 9));
  const dates = expand(result.datetime, result.recurrence);
  assert.deepEqual(parts(dates[0]), [2026, 10, 21, 17, 50]);
  assert.deepEqual(parts(dates[1]), [2026, 10, 28, 17, 50]);
});

test('a month without a stated year rolls into the next year when needed', () => {
  const result = parse('đặt lịch họp thứ 4 hàng tuần đến hết tháng 11', new Date(2026, 11, 20, 9));
  assert.equal(result.recurrence.until.getFullYear(), 2027);
});

test('a recurring request in a future year starts in that year, while an end year does not move its start', () => {
  const now = new Date(2026, 9, 20, 8);
  const future = parse('đặt lịch họp thứ 4 hàng tuần năm 2030', now);
  assert.equal(future.datetime.getFullYear(), 2030);
  assert.equal(future.datetime.getDay(), 3);
  assert.equal(future.recurrence.until.getFullYear(), 2031);
  const ending = parse('đặt lịch họp thứ 4 hàng tuần đến hết tháng 11 năm 2030', now);
  assert.deepEqual(parts(ending.datetime), [2026, 10, 21, 9, 0]);
  assert.equal(ending.recurrence.until.getFullYear(), 2030);
});

test('workday schedules skip Saturday and Sunday', () => {
  const result = parse('17h50 từ thứ 2 đến thứ 6 chấm công về', new Date(2026, 9, 23, 18));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Chấm công về');
  assert.deepEqual(parts(dates[0]), [2026, 10, 26, 17, 50]);
  assert.ok(dates.every(date => date.getDay() >= 1 && date.getDay() <= 5));
});

test('daily work schedule excluding Sunday keeps Monday through Saturday and a clean title', () => {
  const result = parse('đặt lịch đi làm hàng ngày trừ chủ nhật', new Date(2026, 9, 24, 8));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Đi làm');
  assert.deepEqual(Array.from(result.recurrence.weekdays), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parts(dates[0]), [2026, 10, 24, 9, 0]);
  assert.deepEqual(parts(dates[1]), [2026, 10, 26, 9, 0]);
  assert.ok(dates.every(date => date.getDay() !== 0));
});

test('daily exclusions accept a Sunday speech typo and more than one excluded day', () => {
  const now = new Date(2026, 9, 24, 10);
  const typo = parse('đặt lịch đi làm hàng ngày trừ chủ nhất', now);
  const weekendSchedule = parseSchedule('đặt lịch 8h đi làm mỗi ngày trừ thứ 7 và chủ nhật', now);
  assert.equal(weekendSchedule.length, 1);
  const weekend = weekendSchedule[0];
  assert.equal(typo.title, 'Đi làm');
  assert.deepEqual(Array.from(typo.recurrence.weekdays), [1, 2, 3, 4, 5, 6]);
  assert.equal(weekend.title, 'Đi làm');
  assert.deepEqual(Array.from(weekend.recurrence.weekdays), [1, 2, 3, 4, 5]);
  assert.ok(expand(weekend.datetime, weekend.recurrence).every(date => date.getDay() >= 1 && date.getDay() <= 5));
});

test('several weekdays in one weekly rule retain one title and one clock time', () => {
  const result = parseSchedule('9h thứ 2, 4, 6 hàng tuần họp nhóm', new Date(2026, 9, 20, 9));
  assert.equal(result.length, 1);
  const dates = expand(result[0].datetime, result[0].recurrence);
  assert.equal(result[0].title, 'Họp nhóm');
  assert.deepEqual(Array.from(dates.slice(0, 3), date => date.getDay()), [3, 5, 1]);
  assert.ok(dates.every(date => date.getHours() === 9));
});

test('monthly schedules skip months missing the requested day', () => {
  const result = parse('ngày 31 hằng tháng thanh toán', new Date(2027, 0, 30, 9));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Thanh toán');
  assert.deepEqual(parts(dates[0]), [2027, 1, 31, 9, 0]);
  assert.deepEqual(parts(dates[1]), [2027, 3, 31, 9, 0]);
});

test('monthly day 31 spoken in February starts at the next valid month', () => {
  const result = parse('ngày 31 hằng tháng thanh toán', new Date(2027, 1, 15, 9));
  assert.equal(result.validationError, undefined);
  assert.deepEqual(parts(result.datetime), [2027, 3, 31, 9, 0]);
});

test('a future recurring start date does not leak a preposition into its title', () => {
  const result = parse('đặt lịch 10h từ ngày 1 tháng 11 năm 2030 hàng ngày đến hết tháng 11 chấm công', new Date(2026, 9, 20, 8));
  assert.equal(result.title, 'Chấm công');
  assert.deepEqual(parts(result.datetime), [2030, 11, 1, 10, 0]);
});

test('an explicit start day without a year begins recurrence on that day', () => {
  const now = new Date(2026, 9, 20, 8);
  const calendar = parse('đặt lịch 9h từ ngày 20 tháng 11 hàng ngày đi làm đến hết tháng 11', now);
  const relative = parse('đặt lịch 9h từ ngày mai hàng ngày đi làm', now);
  assert.deepEqual(parts(calendar.datetime), [2026, 11, 20, 9, 0]);
  assert.deepEqual(parts(relative.datetime), [2026, 10, 21, 9, 0]);
  const nextYear = parse('đặt lịch 9h từ ngày 1 tháng 9 hàng ngày đi làm', now);
  assert.deepEqual(parts(nextYear.datetime), [2027, 9, 1, 9, 0]);
});

test('weekly and monthly rules inherit the weekday or day from their spoken start date', () => {
  const now = new Date(2026, 9, 15, 8);
  const weekly = parse('đặt lịch 9h từ ngày 20 tháng 11 hàng tuần họp', now);
  const monthly = parse('đặt lịch 9h từ ngày 20 tháng 11 hàng tháng thanh toán', now);
  assert.deepEqual(parts(weekly.datetime), [2026, 11, 20, 9, 0]);
  assert.deepEqual(Array.from(weekly.recurrence.weekdays), [5]);
  assert.deepEqual(parts(monthly.datetime), [2026, 11, 20, 9, 0]);
  assert.equal(monthly.recurrence.monthDay, 20);
});

test('weekly recurrence explicitly starting next week does not create this week', () => {
  const result = parse('đặt lịch 9h thứ 4 tuần sau hàng tuần họp', new Date(2026, 9, 20, 8));
  assert.deepEqual(parts(result.datetime), [2026, 10, 28, 9, 0]);
});

test('unsupported repetition and exclusions fail instead of silently making a different schedule', () => {
  const now = new Date(2026, 9, 20, 8);
  for (const wording of [
    '9h họp hàng năm', '9h họp mỗi 2 ngày', '9h họp cách ngày',
    '9h họp hàng ngày trừ ngày lễ', '9h họp hàng ngày đến hết năm 2030',
    '9h họp hàng ngày trong 2 tuần', '9h họp hàng ngày trừ thứ 2 thứ 4',
  ]) assert.ok(parse(wording, now).validationError, wording);
});

test('every two weeks repeats on alternating Wednesdays', () => {
  const result = parse('cứ 2 tuần một lần vào thứ 4 lúc 9h họp nhóm', new Date(2026, 9, 20, 9));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Họp nhóm');
  assert.deepEqual(parts(dates[0]), [2026, 10, 21, 9, 0]);
  assert.deepEqual(parts(dates[1]), [2026, 11, 4, 9, 0]);
});

test('one sentence can create separate meetings with different titles and times', () => {
  const items = parseSchedule('thứ 2 họp lúc 9h, thứ 5 báo cáo lúc 15h', new Date(2026, 9, 20, 9));
  assert.equal(items.length, 2);
  assert.deepEqual(Array.from(items, item => item.title), ['Họp', 'Báo cáo']);
  assert.deepEqual(parts(items[0].datetime), [2026, 10, 26, 9, 0]);
  assert.deepEqual(parts(items[1].datetime), [2026, 10, 22, 15, 0]);
  assert.equal(parseSchedule('9h thứ 2 họp với An và Bình', new Date(2026, 9, 20, 9)).length, 1);
});

test('batch save rejects a collision before writing any occurrence', async () => {
  const existing = [{ id: 'existing', title: 'Lịch cũ', meetingTime: new Date(2026, 9, 22, 17, 50).toISOString() }];
  let writes = 0;
  const database = {
    getMeetings: async () => existing,
    addMeetings: async () => { writes += 1; return existing; },
  };
  const { StorageService } = createLoader({ './database': { DatabaseService: database } })('src/services/storage.ts');
  const dates = [new Date(2026, 9, 21, 17, 50), new Date(2026, 9, 22, 17, 50)];
  await assert.rejects(StorageService.addMeetings(dates.map((date, index) => ({ id: String(index), meetingTime: date.toISOString() }))), /Trùng lịch/);
  assert.equal(writes, 0);
});

test('batch save checks collisions within the new items and writes a valid batch once', async () => {
  const batches = [];
  const database = {
    getMeetings: async () => [],
    addMeetings: async meetings => { batches.push(meetings); return meetings; },
  };
  const { StorageService } = createLoader({ './database': { DatabaseService: database } })('src/services/storage.ts');
  const meeting = (id, hour) => ({ id, title: id, meetingTime: new Date(2026, 9, 22, hour).toISOString() });
  await assert.rejects(StorageService.addMeetings([meeting('one', 9), meeting('two', 9)]), /Trùng lịch/);
  assert.equal(batches.length, 0);
  await StorageService.addMeetings([meeting('one', 9), meeting('two', 15)]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
});
