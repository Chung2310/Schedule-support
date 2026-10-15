const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createLoader } = require('./load-typescript.cjs');

const baseLoader = createLoader();
const settings = baseLoader('src/types/settings.ts').DEFAULT_SETTINGS;
const now = new Date(2026, 9, 15, 12).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
function meeting(id = 'meeting-a', date = new Date(2026, 9, 16, 10)) {
  return {
    id, title: id, meetingTime: date.toISOString(), advanceNoticeMinutes: 15,
    repeatIntervalMinutes: 5, firstReminderTime: new Date(date.getTime() - 15 * 60_000).toISOString(),
    status: 'UPCOMING', nagCount: 0, voiceText: `Nhắc ${id}`, createdAt: new Date(now).toISOString(),
  };
}

function notificationHarness(platform = 'ios', initialMeetings = [meeting()]) {
  let rows = structuredClone(initialMeetings);
  const pending = new Map();
  const presented = new Map();
  const listeners = [];
  const state = { granted: true, lastResponse: null, failRead: false };
  const platformApi = { OS: platform, select: (values) => values[platform] ?? values.default };
  const parse = createLoader({
    expo: {},
    'expo-modules-core': { Platform: platformApi },
    './NotificationScheduler': {},
  })('node_modules/expo-notifications/src/scheduleNotificationAsync.ts').parseTrigger;
  const notifications = {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    SchedulableTriggerInputTypes: { DATE: 'date' },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler() {},
    getPermissionsAsync: async () => ({ granted: state.granted, canAskAgain: false }),
    requestPermissionsAsync: async () => { throw new Error('Must not request denied permissions again'); },
    setNotificationChannelAsync: async () => {},
    setNotificationCategoryAsync: async () => {},
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    scheduleNotificationAsync: async (request) => {
      const nativeTrigger = parse(request.trigger);
      if (request.trigger !== null && request.trigger.type === 'date') assert.equal(nativeTrigger.type, 'date');
      const identifier = request.identifier ?? 'instant';
      pending.set(identifier, { ...request, identifier });
      return identifier;
    },
    cancelScheduledNotificationAsync: async (identifier) => { pending.delete(identifier); },
    getPresentedNotificationsAsync: async () => [...presented.values()],
    dismissNotificationAsync: async (identifier) => { presented.delete(identifier); },
    addNotificationResponseReceivedListener(callback) { listeners.push(callback); return { remove() {} }; },
    getLastNotificationResponse: () => state.lastResponse,
    clearLastNotificationResponse: () => { state.lastResponse = null; },
  };
  const storage = {
    getMeetings: async () => { if (state.failRead) throw new Error('Storage temporarily unavailable'); return structuredClone(rows); },
    getSettings: async () => settings,
    updateMeeting: async (updated) => { rows = rows.map((row) => row.id === updated.id ? { ...updated } : row); return rows; },
  };
  function restart() {
    return createLoader({
      'expo-notifications': notifications,
      'react-native': { Platform: platformApi, AppState: { currentState: 'active' } },
      './storage': { StorageService: storage },
      './speechService': { SpeechService: { stop: async () => {}, speakVoiceReminder: async () => {}, triggerAlarmHaptics: async () => {} } },
    }, { Date: FixedDate })('src/services/alarmManager.ts').AlarmManager;
  }
  return { restart, pending, presented, state, listeners, get rows() { return rows; } };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: SDK parser accepts scheduled dates and restarting does not duplicate reminders`, async () => {
    const harness = notificationHarness(platform);
    assert.equal(await harness.restart().syncNotifications(settings), true);
    const firstIds = [...harness.pending.keys()].sort();
    assert.ok(firstIds.length > 1);
    const initial = harness.pending.get('ceo-meeting-meeting-a-0');
    assert.equal(initial.trigger.date.getTime(), new Date(harness.rows[0].firstReminderTime).getTime());
    assert.equal(await harness.restart().syncNotifications(settings), true);
    assert.deepEqual([...harness.pending.keys()].sort(), firstIds);
  });
}

test('acknowledging after restart removes legacy scheduled and presented notifications', async () => {
  const harness = notificationHarness('ios', [meeting('a'), meeting('b')]);
  await harness.restart().syncNotifications(settings);
  const oldRequest = { identifier: 'legacy-random-id', content: { data: { meetingId: 'a' } } };
  harness.pending.set(oldRequest.identifier, oldRequest);
  harness.presented.set(oldRequest.identifier, { request: oldRequest });
  await harness.restart().acknowledgeAndDismiss('a');
  assert.equal(harness.rows.find((row) => row.id === 'a').status, 'ACKNOWLEDGED');
  assert.equal([...harness.pending.values()].some((request) => request.content.data?.meetingId === 'a'), false);
  assert.equal(harness.presented.size, 0);
  assert.ok([...harness.pending.values()].some((request) => request.content.data?.meetingId === 'b'));
});

test('cold-start acknowledgement is consumed before syncing reminders', async () => {
  const harness = notificationHarness();
  harness.state.lastResponse = {
    actionIdentifier: 'DISMISS_ACTION',
    notification: { request: { identifier: 'old-id', content: { data: { meetingId: 'meeting-a' } } } },
  };
  let acknowledged = 0;
  await harness.restart().init({ onAlarm() {}, onAcknowledged() { acknowledged++; }, onNotificationOpen() {} });
  assert.equal(acknowledged, 1);
  assert.equal(harness.state.lastResponse, null);
  assert.equal(harness.rows[0].status, 'ACKNOWLEDGED');
  assert.equal([...harness.pending.values()].some((request) => request.content.data?.meetingId), false);
});

test('tapping a notification opens its meeting without acknowledging it', async () => {
  const harness = notificationHarness();
  harness.state.lastResponse = {
    actionIdentifier: 'default',
    notification: { request: { identifier: 'tap-id', content: { data: { meetingId: 'meeting-a' } } } },
  };
  let opened;
  await harness.restart().init({ onAlarm() {}, onAcknowledged() { throw new Error('Must not acknowledge a regular tap'); }, onNotificationOpen(value) { opened = value; } });
  assert.equal(opened.id, 'meeting-a');
  assert.equal(harness.rows[0].status, 'UPCOMING');
});

test('after 07:00, briefing content and date both belong to tomorrow', async () => {
  const harness = notificationHarness('ios', [meeting('today-only', new Date(2026, 9, 15, 14)), meeting('tomorrow-only')]);
  await harness.restart().syncNotifications(settings);
  const briefing = harness.pending.get('ceo_daily_schedule_briefing');
  assert.equal(briefing.trigger.date.getDate(), 16);
  assert.equal(briefing.trigger.date.getHours(), 7);
  assert.match(briefing.content.title, /16\/10/);
  assert.match(briefing.content.body, /tomorrow-only/);
  assert.doesNotMatch(briefing.content.body, /today-only/);
});

test('denied notifications do not prevent local meeting data from being retained', async () => {
  const harness = notificationHarness();
  harness.state.granted = false;
  const manager = harness.restart();
  await manager.init({ onAlarm() {}, onAcknowledged() {}, onNotificationOpen() {} });
  assert.equal(await manager.syncNotifications(settings), false);
  assert.equal(harness.pending.size, 0);
  assert.equal(harness.rows.length, 1);
});

test('a local database read failure leaves existing OS reminders intact', async () => {
  const harness = notificationHarness();
  const manager = harness.restart();
  await manager.syncNotifications(settings);
  const before = [...harness.pending.keys()];
  harness.state.failRead = true;
  assert.equal(await manager.syncNotifications(settings), false);
  assert.deepEqual([...harness.pending.keys()], before);
});

test('reminder planning skips acknowledged and expired meetings and respects stop time', () => {
  const { buildReminderPlan } = baseLoader('src/utils/reminderPlan.ts');
  const active = meeting('active', new Date(now + 60 * 60_000));
  const acknowledged = { ...meeting('done'), status: 'ACKNOWLEDGED' };
  const expired = meeting('expired', new Date(now - 60_000));
  const plan = buildReminderPlan([active, acknowledged, expired], settings, now);
  assert.ok(plan.length > 0);
  assert.ok(plan.every((entry) => entry.meeting.id === 'active'));
  assert.ok(plan.every((entry) => entry.date.getTime() < new Date(active.meetingTime).getTime()));
});

test('repeat limit and nearest-first ordering apply to the combined reminder plan', () => {
  const { buildReminderPlan } = baseLoader('src/utils/reminderPlan.ts');
  const plan = buildReminderPlan([meeting('later'), meeting('earlier', new Date(now + 60 * 60_000))], { ...settings, nagMaxCount: 1 }, now);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].meeting.id, 'earlier');
  assert.ok(plan.every((entry) => entry.repeatIndex === 0));
});

test('native SQLite stays empty after deleting the last meeting and initializes once', async (context) => {
  const db = new DatabaseSync(':memory:');
  context.after(() => db.close());
  let schemaRuns = 0;
  let opens = 0;
  const sqlite = { openDatabaseAsync: async () => {
    opens++;
    return {
      execAsync: async (sql) => { schemaRuns++; db.exec(sql); },
      getFirstAsync: async (sql, args = []) => db.prepare(sql).get(...args),
      getAllAsync: async (sql, args = []) => db.prepare(sql).all(...args),
      runAsync: async (sql, args = []) => db.prepare(sql).run(...args),
    };
  } };
  const service = createLoader({ 'expo-sqlite': sqlite })('src/services/database.ts').DatabaseService;
  await Promise.all([service.getMeetings(), service.getSettings(), service.getMeetings()]);
  assert.equal((await service.getMeetings()).length, 0);
  await service.addMeeting(meeting());
  assert.equal((await service.getMeetings()).length, 1);
  assert.equal((await service.deleteMeeting('meeting-a')).length, 0);
  assert.equal((await service.getMeetings()).length, 0);
  assert.equal(opens, 1);
  assert.equal(schemaRuns, 1);
});

test('web storage does not insert sample meetings on first launch or after deletion', async () => {
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
  const service = createLoader({ '@react-native-async-storage/async-storage': storage })('src/services/database.web.ts').DatabaseService;
  assert.equal((await service.getMeetings()).length, 0);
  await service.addMeeting(meeting());
  assert.equal((await service.deleteMeeting('meeting-a')).length, 0);
  assert.equal((await service.getMeetings()).length, 0);
});

test('closing voice input during the permission prompt prevents a late microphone start', async () => {
  let resolvePermission;
  let starts = 0;
  const native = {
    requestPermissionsAsync: () => new Promise((resolve) => { resolvePermission = resolve; }),
    addListener: () => ({ remove() {} }), start: async () => { starts++; }, stop: async () => {},
  };
  const service = createLoader({ 'react-native': { Platform: { OS: 'ios' } }, 'expo-speech-recognition': { ExpoSpeechRecognitionModule: native } })('src/services/sttService.ts').STTService;
  const pending = service.startListening({});
  service.stopListening();
  resolvePermission({ granted: true });
  assert.equal(await pending, false);
  assert.equal(starts, 0);
});

test('closing voice input during native startup stops it and ignores late events', async () => {
  let completeStart;
  let enteredStart;
  const started = new Promise((resolve) => { enteredStart = resolve; });
  const events = new Map();
  const actions = [];
  let callbacks = 0;
  const native = {
    requestPermissionsAsync: async () => ({ granted: true }),
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    start: () => { actions.push('start'); enteredStart(); return new Promise((resolve) => { completeStart = resolve; }); },
    stop: async () => { actions.push('stop'); },
  };
  const service = createLoader({ 'react-native': { Platform: { OS: 'ios' } }, 'expo-speech-recognition': { ExpoSpeechRecognitionModule: native } })('src/services/sttService.ts').STTService;
  const pending = service.startListening({ onStart() { callbacks++; } });
  await started;
  service.stopListening();
  events.get('start')();
  completeStart();
  assert.equal(await pending, false);
  assert.equal(actions.at(-1), 'stop');
  assert.equal(callbacks, 0);
});

test('iOS preserves unrelated notifications and reserves room for the morning briefing', async () => {
  const harness = notificationHarness('ios', Array.from({ length: 50 }, (_, index) => meeting(`meeting-${index}`)));
  harness.pending.set('other-feature', { identifier: 'other-feature', content: { data: {} } });
  assert.equal(await harness.restart().syncNotifications(settings), true);
  assert.equal(harness.pending.size, 64);
  assert.ok(harness.pending.has('other-feature'));
  assert.ok(harness.pending.has('ceo_daily_schedule_briefing'));
});
