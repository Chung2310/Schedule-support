const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');
const parse = createLoader()('src/services/nlpParser.ts').parseVietnameseVoiceMeeting;
const now = new Date(2026, 9, 16, 12, 30); // Friday
const selected = new Date(2026, 9, 16);

const cases = [
  ['2 ngày nữa lúc 10h', 18, 10, 0],
  ['ngày 2 ngày nữa lúc 10h', 18, 10, 0],
  ['sau hai ngày lúc 10h', 18, 10, 0],
  ['hai ngày nữa lúc mười giờ tối', 18, 22, 0],
  ['1 tuần nữa lúc 10h', 23, 10, 0],
  ['ngày mốt lúc 10h', 18, 10, 0],
  ['10h tối', 16, 22, 0],
  ['10h sáng', 16, 10, 0],
  ['mười giờ sáng', 16, 10, 0],
  ['mười giờ tối', 16, 22, 0],
  ['mười giờ ba mươi phút tối', 16, 22, 30],
  ['10h30 tối mai', 17, 22, 30],
  ['tối mai 10h', 17, 22, 0],
  ['sáng mai lúc 10h', 17, 10, 0],
  ['chiều nay lúc ba giờ', 16, 15, 0],
  ['ba giờ rưỡi chiều mai', 17, 15, 30],
  ['10 giờ kém 15 tối', 16, 21, 45],
  ['mười giờ kém mười lăm tối', 16, 21, 45],
  ['mười hai giờ trưa', 16, 12, 0],
  ['12h đêm', 16, 0, 0],
  ['thứ hai tuần sau 10h', 19, 10, 0],
  ['thứ bảy tuần sau 10h', 24, 10, 0],
  ['thứ bảy tuần này 10h', 17, 10, 0],
  ['chủ nhật tuần sau 10h', 25, 10, 0],
  ['ngày hai mươi tháng mười lúc mười giờ sáng', 20, 10, 0],
];
for (const [phrase, day, hour, minute] of cases) {
  for (const position of ['before', 'after']) {
    const text = position === 'before' ? `${phrase} họp kinh doanh` : `họp kinh doanh ${phrase}`;
    test(`parse natural date/time: ${text}`, () => {
      const result = parse(text, now, selected);
      const d = result.datetime;
      assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, day, hour, minute]);
      assert.equal(result.title, 'Họp kinh doanh');
    });
  }
}

test('relative day arithmetic crosses year boundaries', () => {
  const result = parse('hai ngày nữa lúc 10h họp', new Date(2026, 11, 31), selected);
  assert.deepEqual([result.datetime.getFullYear(), result.datetime.getMonth(), result.datetime.getDate()], [2027, 0, 2]);
});

test('date parsing retains number words in the actual meeting title', () => {
  assert.equal(parse('10h sáng họp với hai đối tác', now, selected).title, 'Họp với hai đối tác');
});
