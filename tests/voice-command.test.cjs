const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const load = createLoader();
const { voiceEditCommand: command, voiceEditFields: fields, voiceDeleteCommand: deleteCommand } = load('src/services/voiceMeetingCommand.ts');
const { applyMeetingEdit } = load('src/utils/meetingEdit.ts');
const now = new Date(2026, 9, 16, 8);
const meeting = { id: 'one', title: 'Họp với khách hàng', meetingTime: new Date(2026, 9, 16, 10).toISOString(), advanceNoticeMinutes: 15, repeatIntervalMinutes: 5, status: 'UPCOMING', nagCount: 0, createdAt: now.toISOString() };
function edit(text) {
  const parsed = command(text, [meeting], now);
  assert.equal(parsed.candidates.length, 1, text);
  return applyMeetingEdit(meeting, fields(parsed, meeting, now), now);
}
test('ordinary create requests stay in the create flow', () => {
  assert.equal(command('Đặt lịch họp 10h ngày mai', [meeting], now), null);
});

test('voice deletion selects an existing meeting and never becomes a create request', () => {
  const candidates = [meeting, { ...meeting, id: 'two', meetingTime: new Date(2026, 9, 17, 10).toISOString() }];
  assert.equal(deleteCommand('xóa lịch họp với khách hàng', candidates, now).candidates.length, 2);
  assert.equal(deleteCommand('hủy lịch họp với khách hàng lúc 10h hôm nay', candidates, now).candidates[0].id, 'one');
  assert.equal(deleteCommand('xóa giúp tôi lịch họp với khách hàng hôm nay', candidates, now).candidates[0]?.id, 'one');
  assert.equal(deleteCommand('xóa lịch họp không tồn tại', candidates, now).candidates.length, 0);
  assert.ok(deleteCommand('xóa lịch họp không tồn tại', candidates, now));
  assert.equal(deleteCommand('đừng xóa lịch họp với khách hàng', candidates, now).error, 'Yêu cầu có phủ định. Chưa xóa lịch nào.');
  assert.equal(deleteCommand('tôi không muốn xóa lịch họp với khách hàng', candidates, now).error, 'Yêu cầu có phủ định. Chưa xóa lịch nào.');
  assert.equal(deleteCommand('thôi đừng xóa lịch họp với khách hàng', candidates, now).error, 'Yêu cầu có phủ định. Chưa xóa lịch nào.');
  assert.equal(deleteCommand('chưa xóa lịch họp với khách hàng', candidates, now).error, 'Yêu cầu có phủ định. Chưa xóa lịch nào.');
  assert.ok(deleteCommand('xóa tất cả lịch', candidates, now).error);
});

test('voice deletion can select a meeting in a future year', () => {
  const future = { ...meeting, id: 'future', meetingTime: new Date(2030, 9, 20, 10).toISOString() };
  const parsed = deleteCommand('xóa lịch họp với khách hàng ngày 20 tháng 10 năm 2030 lúc 10h', [meeting, future], now);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].id, 'future');
  assert.equal(deleteCommand('xóa lịch họp với khách hàng 20.10.2030 lúc 10h', [meeting, future], now).candidates[0]?.id, 'future');
  assert.equal(command('dời lịch họp với khách hàng 20.10.2030 sang 11h', [meeting, future], now).candidates[0]?.id, 'future');
});

test('date without a spoken year offers matching future years for safe selection', () => {
  const future = { ...meeting, id: 'future', meetingTime: new Date(2030, 9, 20, 10).toISOString() };
  const selector = 'họp với khách hàng ngày 20 tháng 10';
  assert.equal(deleteCommand(`xóa lịch ${selector}`, [future], now).candidates[0]?.id, 'future');
  const editCommand = command(`dời lịch ${selector} sang 11h`, [future], now);
  assert.equal(editCommand.candidates[0]?.id, 'future');
  assert.equal(fields(editCommand, future, now).time, '11:00');
});

test('voice edit and delete can locate past meetings by relative day or weekday', () => {
  const reference = new Date(2026, 9, 20, 8);
  const yesterday = { ...meeting, id: 'yesterday', meetingTime: new Date(2026, 9, 19, 10).toISOString() };
  const lastWednesday = { ...meeting, id: 'last-week', meetingTime: new Date(2026, 9, 14, 10).toISOString() };
  assert.equal(deleteCommand('xóa lịch họp với khách hàng lúc 10h hôm qua', [yesterday, lastWednesday], reference).candidates[0]?.id, 'yesterday');
  assert.equal(command('dời lịch họp với khách hàng thứ 4 tuần trước sang 11h ngày mai', [yesterday, lastWednesday], reference).candidates[0]?.id, 'last-week');
});

test('deletion does not mistake an ordinary word beginning with bỏ for a command', () => {
  assert.equal(deleteCommand('bỏng tay ngày mai', [meeting], now), null);
});

test('customer meeting with a spoken day is still editable', () => {
  const parsed = command('dời lịch họp với khách hàng ngày 16 tháng 10 sang 11h', [meeting], now);
  assert.equal(parsed.error, null);
  assert.equal(parsed.candidates[0]?.id, meeting.id);
});

for (const wording of ['Rời lịch lúc 12h sang 13h', 'Dời lịch lúc 12h sang 13h', 'Hãy rời cuộc họp lúc 12 giờ sang 13 giờ']) {
  test(`${wording} selects the original hour and preserves the meeting day`, () => {
    const target = { ...meeting, meetingTime: new Date(2026, 9, 18, 12).toISOString() };
    const parsed = command(wording, [target, { ...meeting, id: 'unrelated' }], now);
    assert.ok(parsed);
    assert.equal(parsed.candidates.length, 1);
    assert.equal(parsed.candidates[0].id, target.id);
    const edited = applyMeetingEdit(target, fields(parsed, target, now), now);
    assert.equal(edited.meetingTime, new Date(2026, 9, 18, 13).toISOString());
    assert.equal(edited.title, target.title);
  });
}

test('hour-only requests retain all same-hour candidates until the user chooses', () => {
  const first = { ...meeting, meetingTime: new Date(2026, 9, 16, 12).toISOString() };
  const second = { ...first, id: 'two', meetingTime: new Date(2026, 9, 17, 12).toISOString() };
  assert.equal(command('Rời lịch lúc 12h sang 13h', [first, second], now).candidates.length, 2);
  const specific = command('Rời lịch lúc 12h hôm nay sang 13h', [first, second], now);
  assert.equal(specific.candidates.length, 1);
  assert.equal(specific.candidates[0].id, first.id);
  assert.equal(command('Rời lịch lúc 12h sang 13h', [meeting], now).candidates.length, 0);
});
test('moving a named meeting preserves its title and reminder settings', () => {
  const edited = edit('Dời lịch họp với khách hàng sang 10h sáng mai');
  assert.equal(new Date(edited.meetingTime).getDate(), 17);
  assert.equal(edited.title, meeting.title);
  assert.equal(edited.id, meeting.id);
  assert.equal(edited.advanceNoticeMinutes, 15);
});
test('date-only move preserves the original hour', () => {
  const edited = edit('Dời lịch họp với khách hàng sang ngày mai');
  assert.equal(new Date(edited.meetingTime).getHours(), 10);
  assert.equal(new Date(edited.meetingTime).getDate(), 17);
});

test('voice edit can move a meeting into an explicitly spoken future year', () => {
  const edited = edit('Dời lịch họp với khách hàng sang ngày 20 tháng 10 năm 2030');
  assert.equal(new Date(edited.meetingTime).getFullYear(), 2030);
  assert.equal(new Date(edited.meetingTime).getDate(), 20);
});
test('relative shift uses old meeting time, while after uses now', () => {
  assert.equal(new Date(edit('Dời lịch họp với khách hàng thêm 30 phút').meetingTime).getHours(), 10);
  assert.equal(new Date(edit('Dời lịch họp với khách hàng thêm 30 phút').meetingTime).getMinutes(), 30);
  assert.equal(new Date(edit('Dời lịch họp với khách hàng sang sau 30 phút').meetingTime).getHours(), 8);
  assert.equal(new Date(edit('Dời lịch họp với khách hàng sau 30 phút').meetingTime).getHours(), 8);
});
test('rename preserves date and time', () => {
  const edited = edit('Đổi tên lịch họp với khách hàng thành họp dự án');
  assert.equal(edited.title, 'họp dự án');
  assert.equal(edited.meetingTime, meeting.meetingTime);
});
test('reminder changes preserve unrelated fields, including zero advance', () => {
  assert.equal(edit('Sửa lịch họp với khách hàng báo trước 0 phút').advanceNoticeMinutes, 0);
  assert.equal(edit('Sửa lịch họp với khách hàng nhắc lại 10 phút').repeatIntervalMinutes, 10);
});
test('duplicate matches remain ambiguous; source hour and day narrow matches', () => {
  const other = { ...meeting, id: 'two', meetingTime: new Date(2026, 9, 17, 11).toISOString() };
  assert.equal(command('Dời họp với khách hàng sang 15h', [meeting, other], now).candidates.length, 2);
  assert.equal(command('Dời họp 10h hôm nay sang 15h', [meeting, other], now).candidates[0].id, 'one');
});
test('unknown or incomplete edit never becomes a new appointment', () => {
  assert.equal(command('Sửa họp không tồn tại sang 15h', [meeting], now).candidates.length, 0);
  assert.throws(() => fields(command('Sửa lịch họp với khách hàng', [meeting], now), meeting, now));
  assert.throws(() => edit('Dời lịch họp với khách hàng sang nơi khác'));
});

for (const wording of [
  'Tôi muốn dời lịch họp với khách hàng từ 10h sang 13h',
  'Giúp tôi chuyển cuộc họp với khách hàng từ 10h đến 13h',
  'Làm ơn đổi giờ cuộc họp với khách hàng sang 13h nhé',
  'Bạn có thể sửa lịch họp với khách hàng sang 13h',
  'Điều chỉnh thời gian của cuộc họp với khách hàng tới 13h',
  'Thay đổi lịch họp với khách hàng sang 13h',
  'Dời giúp tôi lịch họp với khách hàng sang 13h',
]) {
  test(`polite and alternative wording: ${wording}`, () => {
    const edited = edit(wording);
    assert.equal(new Date(edited.meetingTime).getHours(), 13);
    assert.equal(edited.title, meeting.title);
  });
}

for (const [wording, minutes] of [
  ['sớm hơn 20 phút', -20], ['sớm lên nửa tiếng', -30],
  ['muộn hơn 1 giờ', 60], ['trễ hơn một tiếng rưỡi', 90],
  ['thêm 1 giờ và 15 phút', 75], ['thêm 2 ngày', 2880],
  ['thêm một tuần', 10080], ['thêm 1,5 giờ', 90],
]) {
  test(`relative change ${wording} is measured from the existing appointment`, () => {
    const edited = edit(`Dời họp với khách hàng ${wording}`);
    assert.equal(Date.parse(edited.meetingTime), Date.parse(meeting.meetingTime) + minutes * 60000);
  });
}

for (const wording of ['Hoãn họp với khách hàng 30 phút', 'Lùi họp với khách hàng nửa tiếng']) {
  test(`implicit delay: ${wording}`, () => {
    assert.equal(new Date(edit(wording).meetingTime).getMinutes(), 30);
  });
}

test('reminder-first requests and combined edits preserve unspecified values', () => {
  assert.equal(edit('Báo trước 20 phút cho cuộc họp với khách hàng').advanceNoticeMinutes, 20);
  assert.equal(edit('Nhắc lại nửa tiếng cho cuộc họp với khách hàng').repeatIntervalMinutes, 30);
  const edited = edit('Dời họp với khách hàng sang 14h và báo trước 20 phút và nhắc lại 10 phút');
  assert.equal(new Date(edited.meetingTime).getHours(), 14);
  assert.equal(edited.advanceNoticeMinutes, 20);
  assert.equal(edited.repeatIntervalMinutes, 10);
});

test('time-only changes keep day; date-only changes keep time', () => {
  assert.equal(new Date(edit('Dời họp với khách hàng sang 10h tối').meetingTime).getHours(), 22);
  assert.equal(new Date(edit('Dời họp với khách hàng sang ngày 20 tháng 10').meetingTime).getHours(), 10);
});

for (const wording of [
  'Dời lịch lúc 10h', 'Dời họp với khách hàng sang 25h',
  'Dời họp với khách hàng sang 10h 75 phút',
  'Dời họp với khách hàng sang ngày 31 tháng 2',
  'Dời họp với khách hàng sang 13h hoặc 14h',
  'Dời họp với khách hàng sang 13h và đổi địa điểm',
  'Dời họp với khách hàng thêm 30 phút và 2 ngày',
  'Đừng dời họp với khách hàng sang 13h',
  'Tôi không muốn dời họp với khách hàng sang 13h',
  'Dời tất cả cuộc họp sang 13h',
  'Sửa họp với khách hàng nhắc lại 0 phút',
  'Sửa họp với khách hàng báo trước 20 phút và báo trước 30 phút',
]) {
  test(`unclear or invalid change is blocked: ${wording}`, () => {
    const parsed = command(wording, [meeting], now);
    assert.ok(parsed, 'must never fall into the create flow');
    assert.throws(() => applyMeetingEdit(meeting, fields(parsed, meeting, now), now));
  });
}

test('moving earlier across midnight preserves the exact offset', () => {
  const target = { ...meeting, meetingTime: new Date(2027, 0, 1, 0, 10).toISOString() };
  const parsed = command('Dời họp với khách hàng sớm hơn 30 phút', [target], now);
  const edited = applyMeetingEdit(target, fields(parsed, target, now), now);
  assert.equal(edited.meetingTime, new Date(2026, 11, 31, 23, 40).toISOString());
});

test('next week in the selector is not mistaken for the destination separator', () => {
  const target = { ...meeting, meetingTime: new Date(2026, 9, 19, 10).toISOString() };
  const parsed = command('Dời họp với khách hàng thứ hai tuần tới 10h sang 15h', [target], now);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(new Date(applyMeetingEdit(target, fields(parsed, target, now), now).meetingTime).getHours(), 15);
});

test('changing content and reminder wording use the same existing meeting', () => {
  assert.equal(edit('Thay đổi nội dung cuộc họp với khách hàng thành họp nội bộ').title, 'họp nội bộ');
  assert.equal(edit('Sửa cuộc họp với khách hàng nhắc trước nửa tiếng').advanceNoticeMinutes, 30);
});

test('a day that does not exist in the current month is not silently rolled over', () => {
  const april = new Date(2026, 3, 16, 8);
  const target = { ...meeting, meetingTime: new Date(2026, 3, 20, 10).toISOString() };
  const parsed = command('Dời họp với khách hàng sang ngày 31', [target], april);
  assert.throws(() => fields(parsed, target, april));
});
