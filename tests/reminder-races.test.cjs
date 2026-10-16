const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const load = createLoader();
const settings = load('src/types/settings.ts').DEFAULT_SETTINGS;
const { buildReminderPlan } = load('src/utils/reminderPlan.ts');
const now = new Date(2026, 9, 16, 12).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
function meeting(minutes = 5) {
  return {
    id: 'nearby', title: 'Nearby', meetingTime: new Date(now + minutes * 60_000).toISOString(),
    firstReminderTime: new Date(now + (minutes - 15) * 60_000).toISOString(),
    advanceNoticeMinutes: 15, repeatIntervalMinutes: 5, status: 'UPCOMING',
    nagCount: 0, voiceText: 'Reminder', createdAt: new Date(now).toISOString(),
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function storageHarness() {
  let rows = [meeting(60)];
  const database = {
    getMeetings: async () => structuredClone(rows),
    getSettings: async () => settings,
    addMeeting: async (value) => { rows.push({ ...value }); return structuredClone(rows); },
    // Match native SQLite's upsert, including the possibility of recreating rows.
    updateMeeting: async (value) => {
      rows = rows.filter((row) => row.id !== value.id).concat({ ...value });
      return structuredClone(rows);
    },
    deleteMeeting: async (id) => { rows = rows.filter((row) => row.id !== id); return structuredClone(rows); },
  };
  const storage = createLoader({ './database': { DatabaseService: database } })('src/services/storage.ts').StorageService;
  return { storage, database };
}
function alarmHarness() {
  const { storage } = storageHarness();
  const enteredSpeech = deferred();
  const finishSpeech = deferred();
  const timers = new Set();
  const events = { alarms: 0, haptics: 0, speech: 0 };
  const manager = createLoader({
    'expo-notifications': { setNotificationHandler() {} },
    'react-native': { Platform: { OS: 'web' }, AppState: { currentState: 'active' } },
    './storage': { StorageService: storage },
    './meetingVoice': { MeetingVoice: { prepare: async () => null } },
    './speechService': { SpeechService: {
      stop: async () => {},
      speakVoiceReminder: async () => { events.speech++; enteredSpeech.resolve(); await finishSpeech.promise; },
      triggerAlarmHaptics: async () => { events.haptics++; },
    } },
  }, {
    Date: FixedDate,
    setTimeout: (callback) => { timers.add(callback); return callback; },
    clearTimeout: (timer) => timers.delete(timer),
  })('src/services/alarmManager.ts').AlarmManager;
  return { manager, storage, enteredSpeech, finishSpeech, timers, events };
}

test('a meeting saved inside its notice window still gets an initial notification', () => {
  for (const nagMaxCount of [0, 1, 3]) {
    const plan = buildReminderPlan([meeting()], { ...settings, nagMaxCount }, now);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].repeatIndex, 0);
    assert.equal(plan[0].date.getTime(), now + 1_000);
    assert.ok(plan[0].date.getTime() < new Date(meeting().meetingTime).getTime());
  }
});

test('catch-up scheduling keeps stable IDs and does not restart acknowledged or active reminders', () => {
  const active = meeting();
  const first = buildReminderPlan([active], settings, now);
  const second = buildReminderPlan([active], settings, now + 100);
  assert.equal(first[0].identifier, second[0].identifier);
  for (const status of ['REMINDING', 'ACKNOWLEDGED']) {
    assert.equal(buildReminderPlan([{ ...active, status }], settings, now).length, 0);
  }
  assert.equal(buildReminderPlan([meeting(-1)], settings, now).length, 0);
  const future = buildReminderPlan([meeting(60)], settings, now);
  assert.ok(future.every((entry) => !entry.identifier.endsWith('catch-up')));
  assert.ok(first.length <= 5);
});

test('serialized storage prevents a late alarm from undoing acknowledgement or deletion', async () => {
  const { storage } = storageHarness();
  const original = (await storage.getMeetings())[0];
  await Promise.all([
    storage.updateMeeting({ ...original, status: 'ACKNOWLEDGED' }),
    storage.updateMeeting({ ...original, status: 'REMINDING', nagCount: 1 }),
  ]);
  assert.equal((await storage.getMeetings())[0].status, 'ACKNOWLEDGED');
  await Promise.all([
    storage.deleteMeeting(original.id),
    storage.updateMeeting({ ...original, status: 'REMINDING' }),
  ]);
  assert.equal((await storage.getMeetings()).length, 0);
});

test('a failed storage mutation does not block later saves', async () => {
  const { storage, database } = storageHarness();
  const original = (await storage.getMeetings())[0];
  database.updateMeeting = async () => { throw new Error('Disk unavailable'); };
  await assert.rejects(storage.updateMeeting({ ...original, status: 'REMINDING' }), /Disk unavailable/);
  assert.equal((await storage.deleteMeeting(original.id)).length, 0);
});

for (const action of ['acknowledge', 'delete', 'background']) {
  test(`${action} while speech is starting cancels late alarm effects`, async () => {
    const h = alarmHarness();
    await h.manager.init({ onAlarm() { h.events.alarms++; }, onAcknowledged() {}, onNotificationOpen() {} });
    const original = (await h.storage.getMeetings())[0];
    const running = h.manager.triggerAlarm(original, settings);
    await h.enteredSpeech.promise;
    if (action === 'acknowledge') await h.manager.acknowledgeAndDismiss(original.id);
    if (action === 'delete') {
      await h.storage.deleteMeeting(original.id);
      await h.manager.cancelAlarm(original.id);
    }
    if (action === 'background') h.manager.pauseForegroundReminders();
    h.finishSpeech.resolve();
    await running;
    const rows = await h.storage.getMeetings();
    if (action === 'acknowledge') assert.equal(rows[0].status, 'ACKNOWLEDGED');
    if (action === 'delete') assert.equal(rows.length, 0);
    if (action === 'background') assert.equal(rows[0].status, 'UPCOMING');
    assert.equal(h.events.alarms, 0);
    assert.equal(h.events.haptics, 0);
    assert.equal(h.timers.size, 0);
  });
}

test('overlapping foreground checks produce one alarm and one repeat timer', async () => {
  const h = alarmHarness();
  await h.manager.init({ onAlarm() { h.events.alarms++; }, onAcknowledged() {}, onNotificationOpen() {} });
  const original = (await h.storage.getMeetings())[0];
  const first = h.manager.triggerAlarm(original, settings);
  await h.enteredSpeech.promise;
  await h.manager.triggerAlarm(original, settings);
  h.finishSpeech.resolve();
  await first;
  assert.equal(h.events.speech, 1);
  assert.equal(h.events.alarms, 1);
  assert.equal((await h.storage.getMeetings())[0].nagCount, 1);
  assert.equal(h.timers.size, 1);
  h.manager.pauseForegroundReminders();
});

test('stopping speech during native preparation prevents a late utterance', async () => {
  const prepared = deferred();
  let stopCalls = 0;
  let utterances = 0;
  const service = createLoader({
    'expo-speech': {
      stop: async () => { if (++stopCalls === 1) await prepared.promise; },
      speak: () => { utterances++; },
    },
    'expo-haptics': {},
    'react-native': { Platform: { OS: 'ios' } },
  })('src/services/speechService.ts').SpeechService;
  const starting = service.speakVoiceReminder('Do not start after dismissal');
  await service.stop();
  prepared.resolve();
  await starting;
  assert.equal(utterances, 0);
  assert.equal(service.isSpeaking, false);
});

test('stale speech completion cannot clear the state of a newer utterance', async () => {
  const utterances = [];
  const service = createLoader({
    'expo-speech': { stop: async () => {}, speak: (_text, options) => utterances.push(options) },
    'expo-haptics': {},
    'react-native': { Platform: { OS: 'ios' } },
  })('src/services/speechService.ts').SpeechService;
  await service.speakVoiceReminder('First');
  await service.speakVoiceReminder('Second');
  utterances[0].onStopped();
  assert.equal(service.isSpeaking, true);
  utterances[1].onDone();
  assert.equal(service.isSpeaking, false);
});
