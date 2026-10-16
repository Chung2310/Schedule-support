const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const { createAppState } = require('./speech-app-state.cjs');

function harness(context, permission, os = 'android') {
  const appState = createAppState();
  const events = new Map();
  const errors = [];
  const timers = new Map();
  let starts = 0;
  let stops = 0;
  let permissionRequests = 0;
  const native = {
    getPermissionsAsync: async () => ({ granted: !permission }),
    requestPermissionsAsync() { permissionRequests++; return permission; },
    addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
    start() { starts++; },
    stop() { stops++; },
  };
  const service = createLoader({
    'react-native': { AppState: appState, Platform: { OS: os, Version: 34 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
  }, {
    setTimeout(callback, milliseconds) { const id = {}; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout(id) { timers.delete(id); },
  })('src/services/sttService.ts').STTService;
  context.after(() => service.stopListening());
  return {
    service, appState, events, errors, timers,
    callbacks: { onError: (error) => errors.push(error) },
    get starts() { return starts; }, get stops() { return stops; },
    get permissionRequests() { return permissionRequests; },
  };
}

test('Android permission activity does not cancel speech; native starts only after returning to the app', async (context) => {
  let grant;
  const permission = new Promise((resolve) => { grant = resolve; });
  const h = harness(context, permission);
  const pending = h.service.startListening(h.callbacks);
  h.appState.emit('background');
  grant({ granted: true });
  // Drain permission continuations before returning from the system activity.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.starts, 0);
  assert.deepEqual(h.errors, []);
  h.appState.emit('active');
  assert.equal(await pending, true);
  assert.equal(h.starts, 1);
  h.events.get('start')();
  assert.deepEqual([...h.timers.values()].map(t => t.milliseconds), [3000]);
});

for (const os of ['android', 'ios']) {
  test(`${os}: background noise and repeated results cannot postpone stopping after the request`, async (context) => {
    const h = harness(context, undefined, os);
    await h.service.startListening(h.callbacks);
    h.events.get('start')();
    const result = (transcript, isFinal = false) => h.events.get('result')({ results: [{ transcript }], isFinal });
    result('ngày mai 10 giờ họp');
    const timerId = [...h.timers.keys()][0];
    for (const value of [0, 1, 3, 5, 8]) {
      h.events.get('volumechange')({ value });
      result('ngày mai 10 giờ họp');
    }
    result('ngày mai 10 giờ họp', true);
    assert.equal(h.timers.has(timerId), true);
    assert.equal(h.timers.get(timerId).milliseconds, 3000);
    h.timers.get(timerId).callback();
    assert.equal(h.stops, 1);
    assert.equal(h.timers.size, 0);
  });

  test(`${os}: speaking more words restarts the three-second wait`, async (context) => {
    const h = harness(context, undefined, os);
    await h.service.startListening(h.callbacks);
    h.events.get('start')();
    h.events.get('result')({ results: [{ transcript: 'ngày mai' }] });
    const first = [...h.timers.keys()][0];
    h.events.get('result')({ results: [{ transcript: 'ngày mai 10 giờ họp' }] });
    assert.equal(h.timers.has(first), false);
    assert.equal([...h.timers.values()][0].milliseconds, 3000);
    assert.equal(h.stops, 0);
  });

  test(`${os}: silence stops once, audible input resets timer and final transcript is retained`, async (context) => {
    const h = harness(context, undefined, os);
    const texts = [];
    let ends = 0;
    let finishing = 0;
    await h.service.startListening({
      onResult: text => texts.push(text), onEnd: () => ends++, onFinishing: () => finishing++,
    });
    h.events.get('start')();
    const first = [...h.timers.keys()][0];
    h.events.get('volumechange')({ value: 3 });
    assert.equal(h.timers.has(first), false);
    const audible = [...h.timers.keys()][0];
    h.events.get('volumechange')({ value: -2 });
    assert.equal(h.timers.has(audible), true);
    h.events.get('result')({ results: [{ transcript: 'ngày mai' }], isFinal: false });
    const timer = [...h.timers.values()][0];
    assert.equal(timer.milliseconds, 3000);
    timer.callback();
    assert.equal(h.stops, 1);
    assert.equal(finishing, 1);
    h.events.get('volumechange')({ value: 5 });
    h.events.get('result')({ results: [{ transcript: 'ngày mai 10 giờ họp' }], isFinal: true });
    assert.equal(h.timers.size, 0);
    await h.service.finishListening();
    assert.equal(h.stops, 1);
    h.events.get('end')();
    assert.equal(texts.at(-1), 'ngày mai 10 giờ họp');
    assert.equal(ends, 1);
  });

  test(`${os}: closing cancels silence timeout and stale callback cannot stop a new session`, async (context) => {
    const h = harness(context, undefined, os);
    await h.service.startListening(h.callbacks);
    h.events.get('start')();
    const stale = [...h.timers.values()][0];
    h.service.stopListening();
    assert.equal(h.timers.size, 0);
    await h.service.startListening(h.callbacks);
    h.events.get('start')();
    stale.callback();
    assert.equal(h.stops, 1);
  });
}

test('closing while waiting for foreground cancels the start and removes the listener', async (context) => {
  let grant;
  const h = harness(context, new Promise((resolve) => { grant = resolve; }));
  const pending = h.service.startListening(h.callbacks);
  h.appState.emit('background');
  grant({ granted: true });
  await new Promise((resolve) => setImmediate(resolve));
  h.service.stopListening();
  h.appState.emit('active');
  assert.equal(await pending, false);
  assert.equal(h.starts, 0);
  assert.equal(h.appState.listenerCount, 0);
  assert.equal(h.timers.size, 0);
});

test('already granted permission does not open another permission prompt; leaving the app stops the mic with a reason', async (context) => {
  const h = harness(context);
  assert.equal(await h.service.startListening(h.callbacks), true);
  h.events.get('start')();
  assert.equal(h.permissionRequests, 0);
  h.appState.emit('background');
  assert.equal(h.stops, 1);
  assert.deepEqual(h.errors, ['APP_BACKGROUND']);
  assert.equal(h.appState.listenerCount, 0);
});

test('a recognizer that never becomes ready reports START_TIMEOUT and releases the mic', async (context) => {
  const h = harness(context);
  await h.service.startListening(h.callbacks);
  [...h.timers.values()][0].callback();
  assert.deepEqual(h.errors, ['START_TIMEOUT']);
  assert.equal(h.stops, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.appState.listenerCount, 0);
});

test('permission granted while the app remains in background times out without opening the mic', async (context) => {
  let grant;
  const h = harness(context, new Promise((resolve) => { grant = resolve; }));
  const pending = h.service.startListening(h.callbacks);
  h.appState.emit('background');
  grant({ granted: true });
  await new Promise((resolve) => setImmediate(resolve));
  [...h.timers.values()][0].callback();
  assert.equal(await pending, false);
  assert.equal(h.starts, 0);
  assert.deepEqual(h.errors, ['APP_NOT_ACTIVE']);
  assert.equal(h.appState.listenerCount, 0);
});
