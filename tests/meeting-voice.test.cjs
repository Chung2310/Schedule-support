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

test('iOS voice preview reports a missing or outdated native module instead of substituting a chime', async () => {
  await assert.rejects(load(null, 'ios').MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), /TestFlight/);
  await assert.rejects(load({ prepare: async () => ({}) }, 'ios').MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), /TestFlight/);
});

for (const [code, message, expected] of [
  ['VOICE_UNAVAILABLE', 'No installed Vietnamese voice', /Chưa có giọng tiếng Việt/],
  ['INVALID_REQUEST', 'Another request is in progress', /đang chuẩn bị/],
  ['VOICE_FAILED', 'Speech generation timed out', /quá lâu/],
  ['VOICE_FAILED', 'Voice notification must be shorter than 30 seconds', /dài quá giới hạn/],
  ['VOICE_FAILED', 'Speech synthesis produced no audio', /chưa tạo được tệp âm thanh/],
]) {
  test(`voice preview explains ${code}: ${message}`, async () => {
    const { MeetingVoice } = load({
      prepare: async () => { throw Object.assign(new Error(message), { code }); },
      scheduleIOS: async () => {},
    }, 'ios');
    await assert.rejects(MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), expected);
    assert.equal(await MeetingVoice.prepareText('Nhắc lịch', settings), null);
  });
}

test('invalid native assets cannot be reported as a successful voice preview', async () => {
  for (const [platform, asset] of [['ios', {}], ['android', { sound: 'voice.wav' }]]) {
    const { MeetingVoice } = load({ prepare: async () => asset, scheduleIOS: async () => {} }, platform);
    await assert.rejects(MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), /chưa tạo được tệp âm thanh/);
  }
});

for (const [code, expected] of [['SOUND_UNAVAILABLE', /chưa đọc được tệp/], ['SCHEDULE_EXPIRED', /Giờ nhắc đã qua/]]) {
  test(`iOS voice scheduling explains ${code}`, async () => {
    const { MeetingVoice } = load({ scheduleIOS: async () => { throw { code }; } }, 'ios');
    await assert.rejects(MeetingVoice.scheduleIOS({}), expected);
  });
}

test('Android voice errors use Android installation and offline TTS instructions', async () => {
  await assert.rejects(load(null).MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), error => {
    assert.match(error.message, /Android/);
    assert.doesNotMatch(error.message, /TestFlight/);
    return true;
  });
  const { MeetingVoice } = load({ prepare: async () => {
    throw { code: 'VOICE_FAILED', message: 'No installed offline Vietnamese voice' };
  } });
  await assert.rejects(MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), error => {
    assert.match(error.message, /chuyển văn bản thành giọng nói của Android/);
    assert.doesNotMatch(error.message, /Trợ năng/);
    return true;
  });
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: a removed selected voice is reported without claiming to use that voice`, async () => {
    const { MeetingVoice } = load({
      prepare: async () => { throw {
        code: platform === 'ios' ? 'VOICE_NOT_FOUND' : 'VOICE_FAILED',
        message: 'Selected Vietnamese voice is not installed',
      }; },
      scheduleIOS: async () => {},
    }, platform);
    await assert.rejects(MeetingVoice.prepareTextOrThrow('Nhắc lịch', settings), /chọn lại giọng đọc/);
  });
}
