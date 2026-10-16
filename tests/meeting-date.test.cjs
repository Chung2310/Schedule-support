const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const parse = createLoader()('src/services/nlpParser.ts').parseVietnameseVoiceMeeting;
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

test('relative dates handle year boundaries using the device day', () => {
  assert.deepEqual(localDate(parse('10h ngày mai họp', new Date(2026, 11, 31, 20), selectedTomorrow)), [2027, 1, 1, 10, 0]);
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
