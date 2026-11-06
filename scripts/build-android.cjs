const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const applicationId = 'com.company.ceovoicecalendar';

function validateProductionContext(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/production' ||
      !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Android releases run only in GitHub Actions on production.');
  }
  if (!env.GITHUB_SHA) throw new Error('The production commit is missing.');
}

function validateBuildContext(env = process.env, platform = process.platform) {
  validateProductionContext(env);
  if (platform !== 'linux') throw new Error('Android builds require the GitHub Ubuntu runner.');
}

function validateAppConfig(app) {
  if (app?.name !== 'iGen Check' || app?.android?.package !== applicationId ||
      !app.plugins?.includes('./plugins/withAndroidRelease.cjs')) {
    throw new Error(`Android CI must target iGen Check (${applicationId}) with the release signing plugin.`);
  }
}

function calculateVersionCode(env = process.env) {
  const base = env.ANDROID_VERSION_CODE_BASE?.trim() || '0';
  const run = env.GITHUB_RUN_NUMBER || '';
  const attempt = env.GITHUB_RUN_ATTEMPT || '';
  if (!/^\d+$/.test(base) || !/^[1-9]\d*$/.test(run) || !/^[1-9]\d*$/.test(attempt) || Number(attempt) >= 1000) {
    throw new Error('versionCode requires a nonnegative ANDROID_VERSION_CODE_BASE, positive GITHUB_RUN_NUMBER and GITHUB_RUN_ATTEMPT < 1000.');
  }
  const code = Number(base) + Number(run) * 1000 + Number(attempt);
  if (!Number.isSafeInteger(code) || code > 2_100_000_000) throw new Error('Android versionCode exceeds the Google Play limit.');
  return code;
}

function buildEnvironment(env = process.env) {
  const result = { ...env, CI: 'true', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1',
    ANDROID_CI_RELEASE: '1', ANDROID_VERSION_CODE: String(calculateVersionCode(env)) };
  delete result.EXPO_TOKEN;
  delete result.ANDROID_KEYSTORE_BASE64;
  for (const key of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_TERMS_OF_SERVICE_URL',
    'EXPO_PUBLIC_DATA_DELETION_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
    const value = env[key]?.trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`Invalid public URL: ${key}`); }
    if (url.protocol !== 'https:' && !(key === 'EXPO_PUBLIC_SUPPORT_URL' && url.protocol === 'mailto:' && url.pathname)) {
      throw new Error(`Invalid public URL: ${key}`);
    }
    result[key] = value;
  }
  return result;
}

function decodeKeystore(env = process.env) {
  for (const key of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    if (!env[key]?.trim()) throw new Error(`Add ${key} to GitHub Actions secrets.`);
  }
  const encoded = env.ANDROID_KEYSTORE_BASE64.replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error('ANDROID_KEYSTORE_BASE64 is not valid base64.');
  return bytes;
}

function artifactDirectory(env = process.env) {
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) throw new Error('GitHub RUNNER_TEMP must be an absolute path.');
  const directory = path.resolve(env.RUNNER_TEMP, 'android-artifacts');
  const relative = path.relative(projectRoot, directory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Build artifacts must be outside the source directory.');
  }
  return directory;
}

function gradleArguments() {
  return [':app:bundleRelease', '--no-daemon', '--console=plain', '--max-workers=2', '--stacktrace'];
}

function signingCertificate(keystorePath, env) {
  const result = spawnSync('java', [path.join(__dirname, 'VerifyAndroidBundle.java'), '--keystore', keystorePath],
  { env, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0 || !/^[a-f0-9]{64}$/.test(result.stdout?.trim() || '')) {
    throw new Error('Cannot use the upload signing key. Check both passwords, alias, certificate validity and that this is a private upload key rather than a debug key.');
  }
  return result.stdout.trim();
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Android prebuild or Gradle build failed. See the preceding build log.');
}

function run() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--check')) throw new Error('Only --check is accepted.');
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  validateAppConfig(app);
  if (args.length) {
    console.log(`Android CI builds ${applicationId} with Gradle; upload runs directly through Google Play API.`);
    return;
  }
  validateBuildContext();
  const env = buildEnvironment();
  const keystore = decodeKeystore();
  const directory = artifactDirectory();
  const signingDirectory = path.join(path.dirname(directory), 'android-signing');
  fs.mkdirSync(signingDirectory, { recursive: true, mode: 0o700 });
  const keystorePath = path.join(signingDirectory, 'upload.keystore');
  env.ANDROID_KEYSTORE_PATH = keystorePath;
  try {
    fs.writeFileSync(keystorePath, keystore, { mode: 0o600 });
    const signingCertificateSha256 = signingCertificate(keystorePath, env);
    const expoRoot = path.dirname(require.resolve('expo/package.json'));
    const expoCli = path.join(expoRoot, 'bin', 'cli');
    // CNG generation runs locally, without an Expo account or EAS CLI.
    runCommand(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install',
      '--template', path.join(expoRoot, 'template.tgz')], { cwd: projectRoot, env });
    const androidDirectory = path.join(projectRoot, 'android');
    const source = path.join(androidDirectory, 'app/build/outputs/bundle/release/app-release.aab');
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, 'igencheck.aab');
    for (const file of [source, output, path.join(directory, 'build-info.json')]) fs.rmSync(file, { force: true });
    fs.chmodSync(path.join(androidDirectory, 'gradlew'), 0o755);
    runCommand('./gradlew', gradleArguments(), { cwd: androidDirectory, env });
    if (!fs.existsSync(source) || fs.statSync(source).size === 0) throw new Error('Gradle did not produce an AAB.');
    fs.copyFileSync(source, output);
    const info = {
      platform: 'android', applicationId, displayName: app.name, version: app.version,
      versionCode: Number(env.ANDROID_VERSION_CODE), buildSystem: 'gradle', commit: process.env.GITHUB_SHA,
      signingCertificateSha256,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
    };
    fs.writeFileSync(path.join(directory, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `## Android AAB built with Gradle\n\nPackage: **${applicationId}**. versionCode: **${info.versionCode}**.\n\n` +
        `Commit: \`${info.commit}\`. SHA-256: \`${info.sha256}\`.\n`);
    }
    console.log(`AAB created: ${output}`);
  } finally {
    fs.rmSync(keystorePath, { force: true });
  }
}

module.exports = { applicationId, validateProductionContext, validateBuildContext, validateAppConfig,
  calculateVersionCode, buildEnvironment, decodeKeystore, artifactDirectory, gradleArguments, signingCertificate };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
