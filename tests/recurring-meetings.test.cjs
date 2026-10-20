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

test('workday schedules skip Saturday and Sunday', () => {
  const result = parse('17h50 từ thứ 2 đến thứ 6 chấm công về', new Date(2026, 9, 23, 18));
  const dates = expand(result.datetime, result.recurrence);
  assert.equal(result.title, 'Chấm công về');
  assert.deepEqual(parts(dates[0]), [2026, 10, 26, 17, 50]);
  assert.ok(dates.every(date => date.getDay() >= 1 && date.getDay() <= 5));
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
