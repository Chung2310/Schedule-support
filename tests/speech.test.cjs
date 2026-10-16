const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const { createAppState } = require('./speech-app-state.cjs');

test('tapping stop preserves the final native transcript, closing discards late results', async () => {
  const events = new Map();
  const texts = [];
  let ended = 0;
  const native = {
    requestPermissionsAsync: async () => ({ granted: true }),
    isRecognitionAvailable: () => true,
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    start(options) { assert.equal(options.lang, 'vi-VN'); },
    stop() {},
  };
  const service = createLoader({
    'react-native': { AppState: createAppState(), Platform: { OS: 'ios' } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
  })('src/services/sttService.ts').STTService;
  assert.equal(await service.startListening({ onResult: (text) => texts.push(text), onEnd: () => ended++ }), true);
  events.get('result')({ results: [{ transcript: 'Ngày mai' }] });
  await service.finishListening();
  events.get('result')({ results: [{ transcript: 'Ngày mai 14 giờ 30 họp kinh doanh' }] });
  events.get('end')();
  assert.equal(texts.at(-1), 'Ngày mai 14 giờ 30 họp kinh doanh');
  assert.equal(ended, 1);
  service.stopListening();
  events.get('result')({ results: [{ transcript: 'late result' }] });
  assert.equal(texts.length, 2);
});

test('unavailable native recognition reports a useful error without starting the mic', async () => {
  let error;
  const service = createLoader({
    'react-native': { Platform: { OS: 'android' } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
      isRecognitionAvailable: () => false,
      start() { assert.fail('Must not start unavailable recognition'); },
      stop() {},
    } },
  })('src/services/sttService.ts').STTService;
  assert.equal(await service.startListening({ onError: (value) => { error = value; } }), false);
  assert.equal(error, 'UNAVAILABLE');
});

test('web uses browser recognition and retains its final result after stop', async () => {
  let recognition;
  const texts = [];
  class BrowserRecognition {
    constructor() { recognition = this; }
    start() { this.onstart?.(); }
    stop() {}
  }
  const service = createLoader({
    'react-native': { Platform: { OS: 'web' } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
      start() { assert.fail('Web must use browser recognition'); }, stop() {},
    } },
  }, { window: { webkitSpeechRecognition: BrowserRecognition } })('src/services/sttService.ts').STTService;
  assert.equal(await service.startListening({ onResult: (text) => texts.push(text) }), true);
  assert.equal(recognition.lang, 'vi-VN');
  await service.finishListening();
  recognition.onresult({ results: [[{ transcript: '14 giờ họp' }]] });
  assert.deepEqual(texts, ['14 giờ họp']);
  service.stopListening();
  recognition.onresult({ results: [[{ transcript: 'late result' }]] });
  assert.equal(texts.length, 1);
});

test('first Android mic start does not enqueue an idle stop that ends the new session', async () => {
  const events = new Map();
  const pendingNativeEvents = [];
  let ends = 0;
  const native = {
    requestPermissionsAsync: async () => ({ granted: true }),
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    stop() { pendingNativeEvents.push(() => events.get('end')?.()); },
    start(options) {
      assert.equal(options.continuous, true);
      events.get('start')?.();
    },
  };
  const service = createLoader({
    'react-native': { AppState: createAppState(), Platform: { OS: 'android', Version: 33 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
  })('src/services/sttService.ts').STTService;
  assert.equal(await service.startListening({ onEnd: () => ends++ }), true);
  pendingNativeEvents.forEach((emit) => emit());
  assert.equal(pendingNativeEvents.length, 0);
  assert.equal(ends, 0);
});

test('Android continuous speech retains earlier segments while replacing partial words', async () => {
  const events = new Map();
  const texts = [];
  const native = {
    requestPermissionsAsync: async () => ({ granted: true }),
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    start() {}, stop() {},
  };
  const service = createLoader({
    'react-native': { AppState: createAppState(), Platform: { OS: 'android', Version: 34 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
  })('src/services/sttService.ts').STTService;
  await service.startListening({ onResult: (text) => texts.push(text) });
  const result = (transcript, isFinal) => events.get('result')({ results: [{ transcript }], isFinal });
  result('Ngày', false);
  result('Ngày mai', true);
  result('14 giờ', false);
  result('14 giờ 30', true);
  result('họp kinh doanh', true);
  assert.deepEqual(texts, ['Ngày', 'Ngày mai', 'Ngày mai 14 giờ', 'Ngày mai 14 giờ 30', 'Ngày mai 14 giờ 30 họp kinh doanh']);
  service.stopListening();
});

test('native session ending without speech reports a visible failure instead of silently stopping', async () => {
  const events = new Map();
  const errors = [];
  const native = {
    requestPermissionsAsync: async () => ({ granted: true }),
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    start(options) { assert.equal(options.continuous, false); }, stop() {},
  };
  const service = createLoader({
    'react-native': { AppState: createAppState(), Platform: { OS: 'android', Version: 32 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
  })('src/services/sttService.ts').STTService;
  await service.startListening({ onError: (error) => errors.push(error) });
  events.get('end')();
  assert.deepEqual(errors, ['START_ENDED']);
  await service.startListening({ onError: (error) => errors.push(error) });
  events.get('error')({ error: 'audio-capture' });
  events.get('end')();
  assert.equal(errors.length, 2);
  assert.equal(errors[1].error, 'audio-capture');
});
