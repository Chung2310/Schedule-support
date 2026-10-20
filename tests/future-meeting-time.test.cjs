const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const { assertFutureMeetingTime, isFutureMeetingTime } = createLoader()('src/utils/futureMeetingTime.ts');

test('only instants strictly after now can be scheduled', () => {
  const now = new Date('2027-02-01T12:00:30.000Z');
  assert.equal(isFutureMeetingTime('2027-02-01T12:00:00.000Z', now), false);
  assert.equal(isFutureMeetingTime(now, now), false);
  assert.equal(isFutureMeetingTime('2027-02-01T12:01:00.000Z', now), true);
  assert.throws(() => assertFutureMeetingTime('invalid', now), /thời điểm đã qua/);
});

test('storage rejects past single and batch creation before any write', async () => {
  let writes = 0;
  const database = {
    getMeetings: async () => [],
    addMeeting: async () => { writes++; return []; },
    addMeetings: async () => { writes++; return []; },
  };
  const { StorageService } = createLoader({ './database': { DatabaseService: database } })('src/services/storage.ts');
  const past = { id: 'past', meetingTime: new Date(Date.now() - 60_000).toISOString() };
  const future = { id: 'future', meetingTime: new Date(Date.now() + 3_600_000).toISOString() };
  await assert.rejects(StorageService.addMeeting(past), /thời điểm đã qua/);
  await assert.rejects(StorageService.addMeetings([future, past]), /thời điểm đã qua/);
  assert.equal(writes, 0);
});

test('storage rejects moving a meeting into the past but allows edits to historical records', async () => {
  const original = { id: 'existing', title: 'Original', meetingTime: new Date(Date.now() - 120_000).toISOString() };
  let current = original;
  const database = {
    getMeetings: async () => [current],
    updateMeeting: async meeting => { current = meeting; return [meeting]; },
  };
  const { StorageService } = createLoader({ './database': { DatabaseService: database } })('src/services/storage.ts');
  await assert.rejects(StorageService.updateMeeting({ ...original, meetingTime: new Date(Date.now() - 60_000).toISOString() }), /thời điểm đã qua/);
  assert.equal(current, original);
  await StorageService.updateMeeting({ ...original, title: 'Updated' });
  assert.equal(current.title, 'Updated');
});
