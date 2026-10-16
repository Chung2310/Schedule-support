const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validateProductionContext, prepareBuildConfig } = require('./build-ios.cjs');

const projectRoot = path.resolve(__dirname, '..');
const appStoreId = '6823442026';

function prepareSubmitConfig(eas, env = process.env) {
  const configuredId = String(env.ASC_APP_ID?.trim() || eas.submit?.production?.ios?.ascAppId || '');
  if (configuredId !== appStoreId) {
    throw new Error(`Production submission must target iGen Check, ASC_APP_ID ${appStoreId}.`);
  }
  const result = structuredClone(eas);
  result.submit ??= {};
  result.submit.production ??= {};
  result.submit.production.ios ??= {};
  result.submit.production.ios.ascAppId = appStoreId;
  return result;
}

function validateArtifact(info, sha256, env = process.env) {
  if (info.bundleIdentifier !== 'com.igen.schedule' || info.displayName !== 'iGen Check' ||
      info.appleTeam !== 'VP77TD9A77') {
    throw new Error('Downloaded IPA metadata belongs to another app or Apple Team.');
  }
  if (!env.GITHUB_SHA || info.commit !== env.GITHUB_SHA) {
    throw new Error('Downloaded IPA was built from a different commit.');
  }
  if (!/^[a-f0-9]{64}$/.test(info.sha256 || '') || info.sha256 !== sha256) {
    throw new Error('Downloaded IPA checksum does not match the validated build.');
  }
}

function submitArguments(ipa) {
  return ['--yes', 'eas-cli@latest', 'submit', '--platform', 'ios', '--profile', 'production',
    '--path', ipa, '--non-interactive', '--wait'];
}

function run() {
  validateProductionContext();
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--check')) {
    throw new Error('Only --check is accepted. Submission always uses the IPA from this production run.');
  }
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  const easPath = path.join(projectRoot, 'eas.json');
  const buildConfig = prepareBuildConfig(app, JSON.parse(fs.readFileSync(easPath, 'utf8')));
  const eas = prepareSubmitConfig(buildConfig);
  fs.writeFileSync(easPath, `${JSON.stringify(eas, null, 2)}\n`);
  if (args.length) {
    console.log(`Production submission targets App Store Connect app ${appStoreId}.`);
    return;
  }
  if (!process.env.RUNNER_TEMP || !path.isAbsolute(process.env.RUNNER_TEMP)) {
    throw new Error('Submission requires the GitHub runner temporary directory.');
  }
  const directory = path.join(process.env.RUNNER_TEMP, 'ios-artifacts');
  const ipa = path.join(directory, 'igencheck.ipa');
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8'));
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(ipa)).digest('hex');
  validateArtifact(info, sha256);
  const result = spawnSync('npx', submitArguments(ipa), { cwd: projectRoot, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`iOS upload failed (exit ${result.status ?? result.signal}). Check the EAS submission logs and assigned App Store Connect API key.`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## iOS upload completed\n\nApp: **iGen Check**, version **${info.version}**, build **${info.buildNumber}**.\n\n` +
      `Uploaded the validated IPA to [App Store Connect](https://appstoreconnect.apple.com/apps/${appStoreId}/testflight).\n\n` +
      'Apple must finish processing before this build becomes available in TestFlight. Check Apple email for any ITMS errors.\n');
  }
}

module.exports = { prepareSubmitConfig, validateArtifact, submitArguments };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
