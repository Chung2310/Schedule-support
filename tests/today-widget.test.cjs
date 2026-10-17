const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { transformFileSync } = require('@babel/core');
const { createLoader } = require('./load-typescript.cjs');

const root = path.resolve(__dirname, '..');
const { buildTodayWidgetTimeline: timeline } = createLoader()('src/utils/todayWidget.ts');
const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute);
const meeting = (id, date, extra = {}) => ({
  id, title: `Lịch ${id}`, meetingTime: date.toISOString(),
  status: 'UPCOMING', ...extra,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const current = (entries, date) => entries.filter((entry) => entry.date <= date).at(-1).props;

test('today widget excludes yesterday, tomorrow and malformed dates from today', () => {
  const entries = timeline([
    meeting('yesterday', at(16, 23, 59)), meeting('later', at(17, 15, 30)),
    meeting('earlier', at(17, 10)), meeting('tomorrow', at(18, 9)),
    { id: 'invalid', meetingTime: 'not a date' },
  ], at(17, 12));
  assert.equal(entries[0].props.total, 2);
  assert.equal(entries[0].props.remaining, 1);
  assert.equal(entries[0].props.nextTime, '15:30');
  assert.deepEqual(plain(entries[0].props.rows.map((row) => row.id)), ['earlier', 'later']);
  assert.equal(current(entries, at(18)).nextTitle, 'Lịch tomorrow');
});

test('acknowledging reminders keeps an appointment in today agenda', () => {
  const props = timeline([meeting('ack', at(17, 15), { status: 'ACKNOWLEDGED' })], at(17, 8))[0].props;
  assert.equal(props.total, 1);
  assert.equal(props.nextTitle, 'Lịch ack');
});

test('the next appointment advances after its starting minute, including shared start times', () => {
  const entries = timeline([
    meeting('a', at(17, 10)), meeting('b', at(17, 10)), meeting('c', at(17, 15, 30)),
  ], at(17, 8));
  assert.equal(current(entries, at(17, 10)).remaining, 3);
  assert.equal(current(entries, at(17, 10, 1)).nextTime, '15:30');
  assert.equal(current(entries, at(17, 10, 1)).remaining, 1);
  assert.equal(current(entries, at(17, 15, 31)).nextTime, '');
  assert.equal(current(entries, at(17, 15, 31)).total, 3);
});

test('midnight clears yesterday and empty gaps never expose a future appointment early', () => {
  const entries = timeline([
    meeting('late', at(17, 23, 59)), meeting('future', at(21, 9)),
  ], at(17, 8));
  for (const day of [18, 19, 20, 22, 30]) {
    const props = current(entries, at(day, 12));
    assert.equal(props.total, 0);
    assert.equal(props.dateLabel, '');
    assert.equal(props.nextTitle, '');
    assert.equal(props.rows.length, 0);
  }
  assert.equal(current(entries, at(21)).dateLabel, '21/10');
  assert.equal(current(entries, at(21)).nextTitle, 'Lịch future');
  const times = entries.map((entry) => entry.date.getTime());
  assert.equal(new Set(times).size, times.length);
  assert.deepEqual(plain(times), plain([...times].sort((a, b) => a - b)));
});

test('empty, deleted and rescheduled calendars replace the old widget payload', () => {
  for (const meetings of [[], [meeting('old', at(16, 14))]]) {
    const props = timeline(meetings, at(17, 8))[0].props;
    assert.equal(props.ready, true);
    assert.equal(props.total, 0);
  }
  const entries = timeline([meeting('edited', at(18, 16, 45), { title: 'Lịch đã đổi' })], at(17, 8));
  assert.equal(entries[0].props.total, 0);
  assert.equal(current(entries, at(18)).nextTime, '16:45');
  assert.equal(current(entries, at(18)).nextTitle, 'Lịch đã đổi');
});

test('large agendas cap visible rows and titles while keeping the next meeting', () => {
  const meetings = Array.from({ length: 20 }, (_, index) =>
    meeting(String(index), at(17, index), { title: 'a'.repeat(300) }));
  const props = timeline(meetings, at(17, 17, 1))[0].props;
  assert.equal(props.total, 20);
  assert.equal(props.remaining, 2);
  assert.equal(props.rows.length, 6);
  assert.ok(props.rows.some((row) => row.time === props.nextTime && !row.past));
  assert.ok(props.rows.every((row) => row.title.length <= 120));
  assert.equal(props.nextTitle.length, 120);
  assert.equal(timeline([meeting('blank', at(17, 10), { title: '   ' })], at(17, 8))[0].props.nextTitle, 'Lịch hẹn');
});

for (const timezone of ['Asia/Ho_Chi_Minh', 'America/New_York', 'Europe/Berlin']) {
  test(`calendar day boundaries remain local across year changes and DST: ${timezone}`, () => {
    const source = `
      const assert = require('node:assert/strict');
      const { createLoader } = require('./tests/load-typescript.cjs');
      const { buildTodayWidgetTimeline } = createLoader()('src/utils/todayWidget.ts');
      for (const [year, month, day] of [[2026,11,31],[2026,2,8],[2026,10,1],[2026,2,29],[2026,9,25]]) {
        const now = new Date(year,month,day,0,5);
        const event = new Date(year,month,day,12);
        const tomorrow = new Date(year,month,day+1);
        const entries = buildTodayWidgetTimeline([{id:'a',title:'a',meetingTime:event.toISOString()}], now);
        assert.equal(entries[0].props.total, 1);
        assert.equal(entries[0].props.nextTime, '12:00');
        assert.equal(entries.at(-1).date.getTime(), tomorrow.getTime());
        assert.equal(entries.at(-1).props.total, 0);
      }
    `;
    const result = spawnSync(process.execPath, ['-e', source], {
      cwd: root, encoding: 'utf8', env: { ...process.env, TZ: timezone },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}

function serializedLayout(isDev) {
  let captured;
  const { code } = transformFileSync(path.join(root, 'src/widgets/TodayScheduleWidget.tsx'), {
    configFile: false, babelrc: false, presets: ['babel-preset-expo'],
    caller: { name: 'metro', platform: 'ios', isDev, isServer: false, supportsStaticESM: false },
  });
  vm.runInNewContext(code, {
    exports: {},
    require(name) {
      if (name === 'expo-widgets') return { createWidget(name, layout) { captured = { name, layout }; } };
      return {};
    },
  });
  assert.equal(captured.name, 'TodayScheduleWidget');
  assert.equal(typeof captured.layout, 'string', 'Expo must serialize the widget directive');
  return captured.layout;
}

function renderLayout(serialized, props, family, mode = 'fullColor', colorScheme = 'light') {
  const jsx = (type, props) => ({ type, props });
  const globals = { HStack: 'HStack', VStack: 'VStack', Text: 'Text', _jsx: jsx, _jsxs: jsx, _jsxDEV: jsx, _jsxFileName: 'widget' };
  for (const name of ['containerBackground', 'font', 'foregroundStyle', 'lineLimit', 'monospacedDigit', 'privacySensitive']) {
    globals[name] = (...args) => ({ name, args });
  }
  const layout = vm.runInNewContext(`(${serialized})`, globals);
  return layout(props, { widgetFamily: family, widgetRenderingMode: mode, colorScheme });
}

function texts(node) {
  if (node == null || node === false) return '';
  if (Array.isArray(node)) return node.map(texts).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return texts(node.props?.children);
}

for (const isDev of [false, true]) {
  test(`isolated ${isDev ? 'development' : 'production'} widget renders every supported family and appearance`, () => {
    const layout = serializedLayout(isDev);
    const props = timeline([meeting('next', at(17, 15, 30))], at(17, 8))[0].props;
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryInline', 'accessoryRectangular']) {
      for (const mode of ['fullColor', 'vibrant', 'accented']) {
        for (const scheme of ['light', 'dark']) {
          assert.match(texts(renderLayout(layout, props, family, mode, scheme)), /15:30/);
          assert.match(texts(renderLayout(layout, {}, family, mode, scheme)), /Mở iGen Check/);
          assert.match(texts(renderLayout(layout, timeline([], at(17))[0].props, family, mode, scheme)), /Hôm nay không có lịch/);
        }
      }
    }
  });
}

test('medium widget prioritizes next appointments even near the end of a busy day', () => {
  const props = timeline(Array.from({ length: 12 }, (_, index) => meeting(`meeting-${index}`, at(17, index + 8))), at(17, 17, 1))[0].props;
  const text = texts(renderLayout(serializedLayout(false), props, 'systemMedium'));
  assert.match(text, /18:00/);
  assert.match(text, /19:00/);
  assert.doesNotMatch(text, /14:00/);
});

for (const platform of ['android', 'web']) {
  test(`${platform} never loads the native iOS widget`, async () => {
    const { TodayWidgets } = createLoader({ 'react-native': { Platform: { OS: platform } } })('src/services/todayWidgets.ts');
    assert.equal(await TodayWidgets.sync([]), false);
  });
}

test('iOS sync publishes the latest data when requests overlap', async () => {
  const published = [];
  const { TodayWidgets } = createLoader({
    'react-native': { Platform: { OS: 'ios' } },
    '../widgets/TodayScheduleWidget': { __esModule: true, default: { updateTimeline(entries) { published.push(entries); } } },
  })('src/services/todayWidgets.ts');
  const date = new Date(Date.now() + 60_000);
  await Promise.all([TodayWidgets.sync([meeting('old', date)]), TodayWidgets.sync([meeting('new', date)])]);
  assert.equal(published.length, 1);
  assert.equal(published[0][0].props.nextTitle, 'Lịch new');
  assert.equal(await TodayWidgets.sync([]), true);
  assert.equal(published.at(-1)[0].props.total, 0);
});

test('missing widget support is handled without crashing calendar use', async () => {
  const warnings = [];
  const { TodayWidgets } = createLoader({ 'react-native': { Platform: { OS: 'ios' } } }, {
    console: { warn(...args) { warnings.push(args); } },
  })('src/services/todayWidgets.ts');
  assert.equal(await TodayWidgets.sync([]), false);
  assert.equal(await TodayWidgets.sync([]), false);
  assert.equal(warnings.length, 1);
});

test('widget identifiers, families and App Group match the build plugin', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const plugin = config.plugins.find((item) => Array.isArray(item) && item[0] === 'expo-widgets')[1];
  assert.equal(plugin.bundleIdentifier, 'com.igen.schedule.widgets');
  assert.equal(plugin.groupIdentifier, 'group.com.igen.schedule');
  assert.equal(plugin.enableAndroid, false);
  assert.equal(plugin.widgets[0].name, 'TodayScheduleWidget');
  assert.equal(plugin.widgets[0].ios.supportedFamilies.length, 5);
});
