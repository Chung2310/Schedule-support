const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, 'config', '--type', 'introspect', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
  timeout: 60_000,
});

if (result.error || result.status !== 0) {
  console.error('Could not generate iOS configuration for privacy validation.');
  if (result.error) console.error(result.error.message);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(result.stdout);
} catch {
  console.error('Expo returned invalid JSON for iOS configuration.');
  process.exit(1);
}

const infoPlist = config._internal?.modResults?.ios?.infoPlist;
if (!infoPlist) {
  console.error('Generated iOS Info.plist is missing.');
  process.exit(1);
}

const expected = {
  name: 'iGen Check',
  owner: 'igen-technology',
  slug: 'schedule',
  bundleIdentifier: 'com.igen.schedule',
  projectId: '6b866bf1-af89-481f-840e-c2779ec6c5fb',
};
const actual = {
  name: config.name,
  owner: config.owner,
  slug: config.slug,
  bundleIdentifier: config.ios?.bundleIdentifier,
  projectId: config.extra?.eas?.projectId,
};
for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) {
    console.error(`Unexpected iOS release identity: ${key} must be ${value}.`);
    process.exit(1);
  }
}
if (infoPlist.UIBackgroundModes?.includes('audio')) {
  console.error('Calendar reminders must not enable background audio.');
  process.exit(1);
}

// ExpoFileSystem in the shipped binary references Photos APIs, even though
// calendar features do not request photo access. Apple checks these references.
const required = [
  'NSMicrophoneUsageDescription',
  'NSSpeechRecognitionUsageDescription',
  'NSPhotoLibraryUsageDescription',
];
const missing = required.filter((key) => typeof infoPlist[key] !== 'string' || !infoPlist[key].trim());
if (missing.length) {
  console.error(`Missing iOS privacy purpose strings: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`iOS release identity is correct; generated Info.plist contains all ${required.length} required privacy purpose strings.`);
