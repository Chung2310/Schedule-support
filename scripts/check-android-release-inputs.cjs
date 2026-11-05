const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateProductionContext, validateAppConfig, buildEnvironment, decodeKeystore } = require('./build-android.cjs');

function validateWorkloadIdentity(env = process.env) {
  const provider = env.GOOGLE_WORKLOAD_IDENTITY_PROVIDER || '';
  if (!/^projects\/[1-9]\d*\/locations\/global\/workloadIdentityPools\/[a-zA-Z0-9_-]+\/providers\/[a-zA-Z0-9_-]+$/.test(provider)) {
    throw new Error('Set GOOGLE_WORKLOAD_IDENTITY_PROVIDER to the full Google Cloud WIF provider resource name.');
  }
  if (!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/.test(env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || '')) {
    throw new Error('Set GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL to the service account used for Google Play upload.');
  }
}

function validateProductionHead(remoteOutput, env = process.env) {
  const [sha, ref] = remoteOutput.trim().split(/\s+/);
  if (!/^[a-f0-9]{40}$/.test(sha || '') || ref !== 'refs/heads/production') {
    throw new Error('Cannot determine the current production branch head.');
  }
  if (sha !== env.GITHUB_SHA) throw new Error('This release is obsolete: production has a newer commit. Run the workflow for the current production commit.');
}

function validateReleaseInputs(mode, env = process.env) {
  if (!['--build', '--upload'].includes(mode)) throw new Error('Use --build or --upload.');
  if (env.ANDROID_UPLOAD_TO_PLAY !== undefined && !['true', 'false'].includes(env.ANDROID_UPLOAD_TO_PLAY)) {
    throw new Error('ANDROID_UPLOAD_TO_PLAY must be true or false.');
  }
  if (mode === '--build') {
    buildEnvironment(env);
    decodeKeystore(env);
  }
  if (mode === '--upload' || env.ANDROID_UPLOAD_TO_PLAY !== 'false') validateWorkloadIdentity(env);
}

function run() {
  const [mode, ...extra] = process.argv.slice(2);
  if (!['--build', '--upload'].includes(mode) || extra.length) throw new Error('Use --build or --upload.');
  validateProductionContext();
  const root = path.resolve(__dirname, '..');
  validateAppConfig(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo);
  validateReleaseInputs(mode);
  const head = spawnSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/production'],
    { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (head.error || head.status !== 0) throw new Error('Cannot read production branch head. Check repository access/network and retry.');
  validateProductionHead(head.stdout);
  console.log('Android release inputs and production commit are valid.');
}

module.exports = { validateWorkloadIdentity, validateProductionHead, validateReleaseInputs };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
