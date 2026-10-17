const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const expected = {
  owner: 'igen-technology',
  slug: 'schedule',
  projectId: '6b866bf1-af89-481f-840e-c2779ec6c5fb',
};

function validateProductionContext(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/production' ||
      !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Android APK builds run only in GitHub Actions on production. Push production or run the workflow with branch production.');
  }
  if (!env.EXPO_TOKEN?.trim()) throw new Error('Add EXPO_TOKEN to GitHub Actions secrets.');
}

function validateBuildContext(env = process.env, platform = process.platform) {
  validateProductionContext(env);
  if (platform !== 'linux') throw new Error('Android APK builds run on the GitHub Ubuntu runner.');
}

function validateConfig(app, eas) {
  const actual = {
    owner: app?.owner,
    slug: app?.slug,
    projectId: app?.extra?.eas?.projectId,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Unexpected Android project: ${key} must be ${value}.`);
  }

  const androidPackage = app?.android?.package;
  if (typeof androidPackage !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(androidPackage)) {
    throw new Error('Set a valid Android application ID in app.json.');
  }

  const preview = eas.build?.preview;
  const profile = eas.build?.['preview-device'];
  const distribution = profile?.distribution ?? preview?.distribution;
  const android = { ...preview?.android, ...profile?.android };
  const developmentClient = profile?.developmentClient ?? preview?.developmentClient;
  const withoutCredentials = android.withoutCredentials ?? profile?.withoutCredentials ?? preview?.withoutCredentials;
  if (profile?.extends !== 'preview' || distribution !== 'internal' || android.buildType !== 'apk' ||
      developmentClient === true || withoutCredentials === true ||
      (android.credentialsSource && android.credentialsSource !== 'remote')) {
    throw new Error('preview-device must extend preview, use internal distribution, build an APK, and use remote credentials.');
  }
  return { androidPackage, version: app.version, profile: 'preview-device' };
}

function buildArguments(output) {
  return ['--yes', 'eas-cli@latest', 'build', '--platform', 'android', '--profile', 'preview-device',
    '--local', '--non-interactive', '--freeze-credentials', '--output', output];
}

function run() {
  const checkOnly = process.argv.slice(2);
  if (checkOnly.length && !(checkOnly.length === 1 && checkOnly[0] === '--check')) {
    throw new Error('Only --check is accepted. The Android APK profile is fixed to preview-device.');
  }

  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
  const buildInfo = validateConfig(app, eas);
  if (checkOnly.length) {
    console.log('Android APK project identity and preview-device profile are valid.');
    return;
  }

  validateBuildContext();
  if (!process.env.RUNNER_TEMP || !path.isAbsolute(process.env.RUNNER_TEMP)) {
    throw new Error('GitHub RUNNER_TEMP must be an absolute path.');
  }
  const outputDirectory = path.join(process.env.RUNNER_TEMP, 'android-artifacts');
  const relative = path.relative(projectRoot, outputDirectory);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    throw new Error('Build artifacts must be outside the source directory.');
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, 'igencheck.apk');
  const result = spawnSync('npx', buildArguments(output), { cwd: projectRoot, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local Android APK build failed (exit ${result.status ?? result.signal}).`);
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) throw new Error('Build did not produce an APK.');

  buildInfo.platform = 'android';
  buildInfo.commit = process.env.GITHUB_SHA ?? null;
  fs.writeFileSync(path.join(outputDirectory, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
  console.log(`APK created: ${output}`);
}

module.exports = { validateProductionContext, validateBuildContext, validateConfig, buildArguments };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
