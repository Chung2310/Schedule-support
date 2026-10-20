const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const { parseVietnameseVoiceMeeting: parse, parseVietnameseVoiceSchedule: parseSchedule } = createLoader()('src/services/nlpParser.ts');
const now = new Date(2026, 9, 16, 12, 30);
const selectedTomorrow = new Date(2026, 9, 17);

function localDate(result) {
  const date = result.datetime;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

for (const wording of ['hôm nay', 'hôm này', 'HÔM NÀY.', 'hôm   nay']) {
  test(`10h ${wording} stays on the actual current day even after 10h and while viewing tomorrow`, () => {
    const result = parse(`Đặt lịch họp 10h ${wording}`, now, selectedTomorrow);
    assert.deepEqual(localDate(result), [2026, 10, 16, 10, 0]);
    assert.equal(result.confidence.dateConfidence, 'EXPLICIT');
  });
}

test('tomorrow is relative to the device day, not the calendar selection', () => {
  assert.deepEqual(localDate(parse('10h ngày mai họp', now, new Date(2026, 10, 20))), [2026, 10, 17, 10, 0]);
});

test('a time without a date uses the selected calendar day without moving it forward', () => {
  assert.deepEqual(localDate(parse('10h họp', now, new Date(2026, 9, 15))), [2026, 10, 15, 10, 0]);
  assert.deepEqual(localDate(parse('10h họp', now, new Date(2026, 9, 16))), [2026, 10, 16, 10, 0]);
});

test('explicit calendar date overrides the selected day', () => {
  assert.deepEqual(localDate(parse('10h ngày 20 tháng 10 họp', now, selectedTomorrow)), [2026, 10, 20, 10, 0]);
});

test('spoken future year is kept for full dates, month and year, and year alone', () => {
  for (const wording of ['10h ngày 20 tháng 10 năm 2030 họp', '10h 20/10/2030 họp', '10h 2030-10-20 họp', '10h 20.10.2030 họp', '10h 2030.10.20 họp']) {
    const result = parse(wording, now, selectedTomorrow);
    assert.deepEqual(localDate(result), [2030, 10, 20, 10, 0], wording);
    assert.equal(result.title, 'Họp');
  }
  assert.deepEqual(localDate(parse('đặt lịch họp tháng 5 năm 2030', now)), [2030, 5, 1, 9, 0]);
  assert.deepEqual(localDate(parse('đặt lịch họp vào năm 2030', now)), [2030, 1, 1, 9, 0]);
  assert.deepEqual(localDate(parse('đặt lịch họp 10h năm 2030', now)), [2030, 1, 1, 10, 0]);
});

test('invalid spoken calendar dates cannot silently roll into another month or year', () => {
  for (const wording of [
    '10h ngày 31 tháng 2 năm 2030 họp', '10h 31/02/2030 họp',
    '10h 2030-02-31 họp', '10h ngày 32 tháng 10 họp',
    '10h ngày 31 tháng 13 họp',
    '10h tháng 13 năm 2030 họp', '10h năm 0000 họp',
  ]) {
    assert.ok(parse(wording, now).validationError, wording);
  }
  assert.ok(parse('10h ngày 31 họp', new Date(2026, 1, 15)).validationError);
  assert.equal(parse('10h ngày 29 tháng 2 năm 2028 họp', now).validationError, undefined);
});

test('invalid spoken clocks cannot silently wrap to another hour', () => {
  for (const wording of ['25h họp ngày mai', '10h75 họp ngày mai', '100 giờ họp ngày mai', '0 giờ kém 30 họp ngày mai', 'đặt lịch 25.30 ngày mai', 'đặt lịch 15.75 họp']) {
    assert.ok(parse(wording, now).validationError, wording);
  }
  assert.equal(parse('10h20 ngày 20/10/2030 họp', now).validationError, undefined);
  assert.equal(parse('đặt lịch họp phiên bản 25.30 ngày mai', now).validationError, undefined);
  assert.ok(parse('14h và 15h ngày mai họp', now).validationError);
  assert.ok(parse('14h họp ngày mai lúc 15h', now).validationError);
});

test('Sunday recognition accepts the common speech typo', () => {
  const result = parse('đặt lịch 10h chủ nhất họp', new Date(2026, 9, 20, 8));
  assert.deepEqual(localDate(result), [2026, 10, 25, 10, 0]);
  assert.equal(result.title, 'Họp');
});

test('negated create commands are not turned into appointments', () => {
  for (const wording of ['đừng đặt lịch họp ngày mai', 'không cần tạo lịch họp ngày mai', 'tôi không muốn đặt lịch ngày mai']) {
    assert.ok(parse(wording, now).validationError, wording);
  }
});

test('two spoken days cannot silently become one appointment', () => {
  for (const wording of [
    'đặt lịch 9h ngày mai và ngày kia họp',
    'đặt lịch 9h ngày 20 tháng 10 và ngày 21 tháng 10 họp',
    'đặt lịch 9h thứ 2 và thứ 4 họp',
  ]) assert.ok(parse(wording, now).validationError, wording);
});

test('a malformed date in a bulk command remains visible to validation', () => {
  const items = parseSchedule('10h ngày 20/10/2030 họp, 11h ngày 31/02/2030 gọi khách hàng', now);
  assert.equal(items.length, 2);
  assert.ok(items[1].validationError);
});

test('relative dates handle year boundaries using the device day', () => {
  assert.deepEqual(localDate(parse('10h ngày mai họp', new Date(2026, 11, 31, 20), selectedTomorrow)), [2027, 1, 1, 10, 0]);
  assert.deepEqual(localDate(parse('10h hôm qua họp', now)), [2026, 10, 15, 10, 0]);
});

test('without a calendar selection the existing next-future-time default is preserved', () => {
  assert.deepEqual(localDate(parse('10h họp', now)), [2026, 10, 17, 10, 0]);
});

for (const [wording, minutes] of [
  ['sau 17p', 17], ['sau 17 phút', 17], ['17 phút nữa', 17],
  ['sau mười bảy phút', 17], ['sau 17p nữa', 17],
  ['sau 90 phút', 90], ['sau 120p', 120], ['sau 2 giờ', 120],
  ['hai tiếng nữa', 120], ['sau 1h30p', 90], ['sau 1 giờ 30 phút', 90],
  ['sau một giờ rưỡi', 90], ['sau một tiếng rưỡi', 90],
  ['nửa tiếng nữa', 30], ['sau nửa giờ', 30],
]) {
  test(`${wording} adds elapsed time to now, ignoring the selected calendar date`, () => {
    const reference = new Date(2026, 11, 31, 23, 50, 42);
    const result = parse(`Đặt lịch họp với đối tác ${wording}`, reference, selectedTomorrow);
    assert.equal(result.datetime.getTime(), reference.getTime() + minutes * 60000);
    assert.equal(result.title, 'Họp với đối tác');
    assert.equal(result.confidence.timeConfidence, 'HIGH');
    assert.equal(result.confidence.dateConfidence, 'EXPLICIT');
  });
}

test('a meeting duration without a relative marker does not replace an explicit start time', () => {
  assert.deepEqual(localDate(parse('Đặt lịch họp 10h hôm nay kéo dài 17 phút', now)), [2026, 10, 16, 10, 0]);
});
