const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

function load(native, platform = 'android', version = 34) {
  return createLoader({
    expo: { requireOptionalNativeModule: () => native },
    'expo-speech': { getAvailableVoicesAsync: async () => [] },
    'react-native': { Platform: { OS: platform, Version: version } },
  })('src/services/meetingVoice.ts');
}
const meeting = { voiceText: '10 giờ. Họp: kinh doanh', title: 'kinh doanh' };
const settings = { speechRate: 0.95, speechPitch: 1.1 };

test('legacy voice labels are removed without deleting words in the meeting title', () => {
  const { meetingVoiceText } = load(null);
  assert.equal(meetingVoiceText({ voiceText: '10 giờ 30 phút. Họp: Họp với đối tác' }), '10 giờ 30 phút. Họp với đối tác');
  assert.equal(meetingVoiceText({ voiceText: '10 giờ. Họp với đối tác' }), '10 giờ. Họp với đối tác');
  assert.equal(meetingVoiceText({ title: 'Họp: nội dung cần bàn' }), 'Họp: nội dung cần bàn');
});

test('voice generation forwards the meeting content, pitch and rate to the device', async () => {
  const asset = { key: 'key', sound: 'voice.wav', channelId: 'voice' };
  const { MeetingVoice } = load({ prepare: async (...args) => {
    assert.deepEqual(args, ['10 giờ. kinh doanh', 0.95, 1.1, 'vi-VN.voice1']);
    return asset;
  } });
  assert.equal(await MeetingVoice.prepare(meeting, { ...settings, speechVoice: 'vi-VN.voice1' }), asset);
});

test('available voice list only includes Vietnamese voices supported by the device', async () => {
  const { MeetingVoice } = load({
    getAvailableVoices: async () => [
      { identifier: 'vi-VN.voice1', name: 'Voice 1', language: 'vi-VN' },
      { identifier: 'en-US.voice1', name: 'Voice 2', language: 'en-US' },
    ],
  });
  const voices = await MeetingVoice.getAvailableVoices();
  assert.deepEqual(voices.map((voice) => voice.identifier), ['vi-VN.voice1']);
});

test('missing native module, unsupported platforms and failed TTS return a chime fallback', async () => {
  assert.equal(await load(null).MeetingVoice.prepare(meeting, settings), null);
  const shouldNotRun = { prepare() { assert.fail('Unsupported platform must not synthesize'); } };
  assert.equal(await load(shouldNotRun, 'web').MeetingVoice.prepare(meeting, settings), null);
  assert.equal(await load(shouldNotRun, 'android', 25).MeetingVoice.prepare(meeting, settings), null);
  assert.equal(await load({ prepare: async () => { throw new Error('No Vietnamese voice'); } }).MeetingVoice.prepare(meeting, settings), null);
});

test('long titles produce a bounded voice preview without altering stored meeting content', () => {
  const { meetingVoiceText } = load(null);
  const original = '10 giờ. Họp: ' + 'kinh doanh '.repeat(100);
  const result = meetingVoiceText({ voiceText: original });
  assert.ok(result.length <= 180);
  assert.ok(result.startsWith('10 giờ. kinh doanh'));
  assert.ok(result.endsWith('Xem thêm trong lịch.'));
  assert.equal(meetingVoiceText(meeting), '10 giờ. kinh doanh');
});
