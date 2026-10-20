const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const { applyMeetingEdit, meetingEditFields, suggestRescheduleTime } = createLoader()('src/utils/meetingEdit.ts');
const now = new Date(2026, 9, 16, 12);
const meeting = {
  id: 'existing', title: 'Họp cũ', meetingTime: new Date(2026, 9, 17, 10).toISOString(),
  advanceNoticeMinutes: 15, repeatIntervalMinutes: 5, firstReminderTime: new Date(2026, 9, 17, 9, 45).toISOString(),
  status: 'ACKNOWLEDGED', nagCount: 2, acknowledgedAt: now.toISOString(), createdAt: now.toISOString(), voiceText: '10 giờ. Họp: Họp cũ',
};

test('editing date and time keeps identity, rebuilds spoken content and rearms reminders', () => {
  const changed = applyMeetingEdit(meeting, {
    ...meetingEditFields(meeting), title: 'Họp mới', date: '18/10/2026', time: '22:30', advance: '0', repeat: '10',
  }, now);
  assert.equal(changed.id, meeting.id);
  assert.equal(changed.createdAt, meeting.createdAt);
  assert.equal(changed.meetingTime, new Date(2026, 9, 18, 22, 30).toISOString());
  assert.equal(changed.firstReminderTime, changed.meetingTime);
  assert.equal(changed.repeatIntervalMinutes, 10);
  assert.equal(changed.voiceText, '22 giờ 30 phút. Họp mới');
  assert.equal(changed.status, 'UPCOMING');
  assert.equal(changed.nagCount, 0);
  assert.equal(changed.acknowledgedAt, undefined);
  assert.equal(meeting.title, 'Họp cũ');
});

test('title-only edits do not reactivate an acknowledged meeting', () => {
  const changed = applyMeetingEdit(meeting, { ...meetingEditFields(meeting), title: 'Nội dung mới' }, now);
  assert.equal(changed.status, 'ACKNOWLEDGED');
  assert.equal(changed.acknowledgedAt, meeting.acknowledgedAt);
  assert.equal(changed.nagCount, 2);
});

test('editing a meeting into the past is rejected', () => {
  assert.throws(() => applyMeetingEdit(meeting, { ...meetingEditFields(meeting), date: '15/10/2026' }, now), /thời điểm đã qua/);
});

test('reschedule starts 30 minutes ahead and never reuses the old minute', () => {
  const original = { ...meeting, meetingTime: new Date(2026, 9, 16, 12, 31).toISOString() };
  const suggested = suggestRescheduleTime(original, new Date(2026, 9, 16, 12, 0, 10));
  assert.equal(suggested.getHours(), 12);
  assert.equal(suggested.getMinutes(), 46);
  const edited = applyMeetingEdit(original, {
    ...meetingEditFields(original),
    date: `${String(suggested.getDate()).padStart(2, '0')}/${String(suggested.getMonth() + 1).padStart(2, '0')}/${suggested.getFullYear()}`,
    time: `${String(suggested.getHours()).padStart(2, '0')}:${String(suggested.getMinutes()).padStart(2, '0')}`,
  }, new Date(2026, 9, 16, 12, 0, 10));
  assert.equal(edited.status, 'UPCOMING');
  assert.equal(edited.nagCount, 0);
  assert.equal(edited.acknowledgedAt, undefined);
});

for (const [field, value] of [
  ['title', '  '], ['date', '31/02/2026'], ['date', '29/02/2026'], ['date', '01/13/2026'],
  ['date', '2026-10-17'], ['time', '24:00'], ['time', '10:60'], ['advance', '-1'], ['repeat', '0'], ['repeat', '1.5'],
]) {
  test(`invalid edit ${field}=${value} is rejected`, () => {
    assert.throws(() => applyMeetingEdit(meeting, { ...meetingEditFields(meeting), [field]: value }, now));
  });
}

test('leap day and midnight are accepted in local time', () => {
  const changed = applyMeetingEdit(meeting, { ...meetingEditFields(meeting), date: '29/02/2028', time: '00:00' }, now);
  assert.equal(changed.meetingTime, new Date(2028, 1, 29, 0, 0).toISOString());
  assert.equal(changed.firstReminderTime, new Date(2028, 1, 28, 23, 45).toISOString());
});
