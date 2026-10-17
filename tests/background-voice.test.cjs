const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

const settings = createLoader()('src/types/settings.ts').DEFAULT_SETTINGS;
const previewId = 'ceo_background_voice_preview';

function harness(platform = 'ios') {
  const pending = new Map();
  const prepared = [];
  const channels = new Map();
  const state = {
    now: new Date(2026, 9, 17, 12).getTime(),
    permission: { granted: true, ios: { status: 2, allowsSound: true } },
    prepareError: null, scheduleError: null, onPrepare: null,
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const platformApi = { OS: platform, Version: 34 };
  const native = {
    async prepare(...args) {
      prepared.push(args);
      await state.onPrepare?.();
      if (state.prepareError) throw state.prepareError;
      channels.set('voice-channel', { sound: 'runtime-voice.wav' });
      return { key: 'voice-key', sound: 'runtime-voice.caf', channelId: 'voice-channel' };
    },
    async scheduleIOS(input) {
      if (state.scheduleError) throw state.scheduleError;
      pending.set(input.identifier, input);
    },
  };
  const voice = createLoader({
    expo: { requireOptionalNativeModule: () => native },
    'expo-speech': {},
    'react-native': { Platform: platformApi },
  })('src/services/meetingVoice.ts');
  const notifications = {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler() {},
    getPermissionsAsync: async () => state.permission,
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    setNotificationChannelAsync: async (id, options) => channels.set(id, options),
    async scheduleNotificationAsync(input) {
      assert.ok(channels.has(input.trigger.channelId));
      pending.set(input.identifier, input);
      return input.identifier;
    },
  };
  const manager = createLoader({
    'expo-notifications': notifications,
    'react-native': { Platform: platformApi, AppState: { currentState: 'background' } },
    './meetingVoice': voice,
    './speechService': { SpeechService: {} },
    './storage': { StorageService: {} },
  }, { Date: Clock })('src/services/alarmManager.ts').AlarmManager;
  return { manager, state, pending, prepared };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: voice preview starts its 15-second countdown after the audio file is ready`, async () => {
    const h = harness(platform);
    h.state.onPrepare = () => { h.state.now += 120_000; };
    await h.manager.scheduleVoicePreview({ ...settings, speechVoice: 'vi-VN-selected' });
    assert.equal(h.prepared.length, 1);
    assert.equal(h.prepared[0][3], 'vi-VN-selected');
    const request = h.pending.get(previewId);
    assert.ok(request.title?.includes('Thử giọng') || request.content.title.includes('Thử giọng'));
    if (platform === 'ios') {
      assert.equal(request.fireAt, h.state.now + 15_000);
      assert.equal(request.sound, 'runtime-voice.caf');
      assert.equal(request.meetingId, undefined);
    } else {
      assert.equal(request.trigger.date.getTime(), h.state.now + 15_000);
      assert.equal(request.trigger.channelId, 'voice-channel');
    }
  });
}

for (const [name, permission, message] of [
  ['denied', { granted: false }, /Cho phép thông báo/],
  ['provisional', { granted: false, ios: { status: 3 } }, /Cho phép thông báo/],
  ['sound disabled', { granted: true, ios: { status: 2, allowsSound: false } }, /Âm thanh thông báo đang tắt/],
]) {
  test(`iOS voice preview reports ${name} before generating audio`, async () => {
    const h = harness();
    h.state.permission = permission;
    await assert.rejects(h.manager.scheduleVoicePreview(settings), message);
    assert.equal(h.prepared.length, 0);
    assert.equal(h.pending.size, 0);
  });
}

test('failed voice preview schedules no substitute chime and does not block a later attempt', async () => {
  const h = harness();
  h.state.prepareError = { code: 'VOICE_UNAVAILABLE' };
  await assert.rejects(h.manager.scheduleVoicePreview(settings), /Chưa có giọng tiếng Việt/);
  assert.equal(h.pending.size, 0);
  h.state.prepareError = null;
  await h.manager.scheduleVoicePreview(settings);
  assert.equal(h.pending.size, 1);
});

test('a missing voice file prevents an iOS preview from reporting successful scheduling', async () => {
  const h = harness();
  h.state.scheduleError = { code: 'SOUND_UNAVAILABLE' };
  await assert.rejects(h.manager.scheduleVoicePreview(settings), /chưa đọc được tệp/);
  assert.equal(h.pending.size, 0);
});

test('overlapping previews serialize native generation and replace the same preview identifier', async () => {
  const h = harness();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.state.onPrepare = () => gate;
  const first = h.manager.scheduleVoicePreview(settings);
  const second = h.manager.scheduleVoicePreview(settings);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.prepared.length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(h.prepared.length, 2);
  assert.equal(h.pending.size, 1);
});

test('iOS preview preserves a full queue of existing meeting notifications', async () => {
  const h = harness();
  for (let i = 0; i < 64; i++) h.pending.set(`meeting-${i}`, { identifier: `meeting-${i}` });
  await assert.rejects(h.manager.scheduleVoicePreview(settings), /nhiều thông báo chờ/);
  assert.equal(h.prepared.length, 0);
  assert.equal(h.pending.size, 64);
});

test('an existing preview can be replaced even when the iOS queue is full', async () => {
  const h = harness();
  for (let i = 0; i < 63; i++) h.pending.set(`meeting-${i}`, { identifier: `meeting-${i}` });
  h.pending.set(previewId, { identifier: previewId });
  await h.manager.scheduleVoicePreview(settings);
  assert.equal(h.pending.size, 64);
  assert.equal(h.pending.get(previewId).sound, 'runtime-voice.caf');
});
