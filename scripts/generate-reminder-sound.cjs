// Generate an original two-note notification chime, PCM WAV for Android/iOS.
const fs = require('node:fs');
const path = require('node:path');
const sampleRate = 44100;
const samples = sampleRate * 2;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const time = i / sampleRate;
  let value = 0;
  for (const [start, frequency] of [[0, 880], [0.45, 1174.66]]) {
    const t = time - start;
    if (t < 0) continue;
    const envelope = Math.min(1, t / 0.01) * Math.exp(-4 * t) * Math.min(1, (2 - time) / 0.05);
    value += 0.45 * envelope * (Math.sin(2 * Math.PI * frequency * t) + 0.2 * Math.sin(4 * Math.PI * frequency * t));
  }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
}
fs.writeFileSync(path.join(__dirname, '../assets/meeting_reminder.wav'), wav);
