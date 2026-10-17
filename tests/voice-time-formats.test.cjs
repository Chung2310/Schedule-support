const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const { createAppState } = require('./speech-app-state.cjs');

const load = createLoader();
const { normalizeVietnameseVoiceText: normalize } = load('src/services/vietnameseNormalizer.ts');
const { parseVietnameseVoiceMeeting: parse } = load('src/services/nlpParser.ts');
const { voiceEditCommand, voiceEditFields } = load('src/services/voiceMeetingCommand.ts');
const now = new Date(2026, 9, 17, 8);
const meeting = {
  id: 'customer', title: 'Họp khách hàng', meetingTime: new Date(2026, 9, 17, 10).toISOString(),
  advanceNoticeMinutes: 15, repeatIntervalMinutes: 5, status: 'UPCOMING', nagCount: 0,
};

for (const [time, hour, minute] of [
  ['15:30', 15, 30], ['15.30', 15, 30], ['15,30', 15, 30],
  ['15 . 30', 15, 30], ['15 , 30', 15, 30], ['15h30', 15, 30],
  ['15 giờ 30 phút', 15, 30], ['mười lăm giờ ba mươi phút', 15, 30],
  ['15.30 giờ', 15, 30], ['15,30h', 15, 30],
  ['9.05', 9, 5], ['09,05', 9, 5], ['chín giờ năm phút', 9, 5],
  ['3.30 chiều', 15, 30], ['3,30 chiều', 15, 30], ['00.00', 0, 0],
]) {
  test(`create and edit accept clock transcript ${time}`, () => {
    for (const input of [`${time} ngày mai họp khách hàng`, `Họp khách hàng lúc ${time} ngày mai.`]) {
      const parsed = parse(input, now, now);
      assert.deepEqual([parsed.datetime.getDate(), parsed.datetime.getHours(), parsed.datetime.getMinutes()], [18, hour, minute]);
      assert.equal(parsed.confidence.timeConfidence, 'HIGH');
      assert.equal(parsed.title, 'Họp khách hàng');
    }
    const command = voiceEditCommand(`Dời lịch họp khách hàng sang ${time} ngày mai`, [meeting], now);
    assert.equal(command.candidates.length, 1);
    const fields = voiceEditFields(command, meeting, now);
    assert.equal(fields.date, '18/10/2026');
    assert.equal(fields.time, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  });
}

for (const input of [
  'ngày 15.10', 'ngày 15,10', '15.10.2026', '2026.10.17', 'phiên bản 1.50',
  'v1.50', 'mã 15.30', 'giá 15.30', 'doanh thu 15,30', '1.50 kg', '1,50 triệu',
  'thêm 1.50 giờ', 'thêm 1,50 giờ', 'sau 1.50 giờ', 'báo trước 1,50 giờ',
  'thêm 1.50 ngày', 'thêm 1,50 tuần',
  '15,30 phút', '25.30', '15.75', '115.30',
]) {
  test(`clock normalization preserves date, quantity or invalid time: ${input}`, () => {
    assert.equal(normalize(input), input);
  });
}

for (const [date, expectedDay, expectedMonth] of [
  ['ngày 20 tháng 10', 20, 10], ['ngày hai mươi tháng mười', 20, 10],
  ['ngày mốt', 19, 10], ['ngày mai', 18, 10],
]) {
  test(`dotted and comma clocks remain clocks before ${date}`, () => {
    for (const time of ['15.30', '15,30']) {
      const parsed = parse(`Họp khách hàng lúc ${time} ${date}`, now, now);
      assert.deepEqual([parsed.datetime.getDate(), parsed.datetime.getMonth() + 1, parsed.datetime.getHours(), parsed.datetime.getMinutes()],
        [expectedDay, expectedMonth, 15, 30]);
      assert.equal(parsed.title, 'Họp khách hàng');
    }
  });
}

for (const [source, destination] of [['10.30', '15.45'], ['10,30', '15,45'], ['10:30', '15.45']]) {
  test(`voice edit finds the original clock ${source} and changes it to ${destination}`, () => {
    const target = { ...meeting, meetingTime: new Date(2026, 9, 17, 10, 30).toISOString() };
    const command = voiceEditCommand(`Dời lịch lúc ${source} hôm nay sang ${destination}`, [meeting, target], now);
    assert.equal(command.candidates.length, 1);
    assert.equal(command.candidates[0].meetingTime, target.meetingTime);
    const fields = voiceEditFields(command, target, now);
    assert.equal(fields.date, '17/10/2026');
    assert.equal(fields.time, '15:45');
  });
}

for (const [os, version, separator] of [
  ['ios', '16.4', '.'], ['ios', '18.6', ':'],
  ['android', 32, ':'], ['android', 33, ','], ['android', 35, '.'],
]) {
  test(`${os} ${version}: native transcript flows into a voice edit with the same time`, async (context) => {
    const events = new Map();
    let transcript = '';
    const segmented = os === 'android' && version >= 33;
    const service = createLoader({
      'react-native': { AppState: createAppState(), Platform: { OS: os, Version: version } },
      'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
        getPermissionsAsync: async () => ({ granted: true }),
        requestPermissionsAsync: async () => { assert.fail('Granted permission must be reused'); },
        addListener(name, callback) { events.set(name, callback); return { remove() {} }; },
        start(options) {
          assert.equal(options.lang, 'vi-VN');
          assert.equal(options.continuous, os === 'ios' || segmented);
        },
        stop() {},
      } },
    }, {
      setTimeout: () => ({}), clearTimeout() {},
    })('src/services/sttService.ts').STTService;
    context.after(() => service.stopListening());
    assert.equal(await service.startListening({ onResult: text => { transcript = text; } }), true);
    events.get('start')();
    const emit = (text, isFinal) => events.get('result')({ results: [{ transcript: text }], isFinal });
    emit('Dời lịch họp khách hàng', segmented);
    emit(`${segmented ? '' : 'Dời lịch họp khách hàng '}sang 15${separator}30 ngày mai`, true);
    events.get('end')();
    const command = voiceEditCommand(transcript, [meeting], now);
    assert.equal(command.candidates.length, 1);
    const fields = voiceEditFields(command, meeting, now);
    assert.equal(fields.time, '15:30');
    assert.equal(fields.date, '18/10/2026');
  });
}
