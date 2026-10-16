const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const yaml = require('yaml');
const { validateBuildContext, prepareBuildConfig, buildArguments } = require('../scripts/build-ios.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '.github/workflows/ios-production.yml'), 'utf8');
const workflow = yaml.parse(source);
const build = workflow.jobs['build-ios'];
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const environment = {
  GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/production', GITHUB_EVENT_NAME: 'push',
  EXPO_TOKEN: 'test-placeholder',
};
function shouldBuild(ref, event) {
  const expression = build.if.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  return vm.runInNewContext(expression, { github: { ref, event_name: event } });
}

test('only production push and production manual dispatch can enter the macOS build job', () => {
  for (const event of ['push', 'workflow_dispatch', 'pull_request', 'pull_request_target', 'schedule']) {
    for (const ref of ['refs/heads/production', 'refs/heads/develop', 'refs/heads/main', 'refs/pull/1/merge', 'refs/tags/production']) {
      const expected = ref === 'refs/heads/production' && ['push', 'workflow_dispatch'].includes(event);
      assert.equal(shouldBuild(ref, event), expected, `${event} ${ref}`);
    }
  }
  assert.equal(build.needs, 'validate');
  assert.equal(workflow.jobs.validate['runs-on'], 'ubuntu-latest');
  assert.equal(build['runs-on'], 'macos-26');
  assert.deepEqual(workflow.on.push.branches, ['develop', 'production']);
});

test('build script independently rejects other branches, events, hosts and missing token', () => {
  assert.doesNotThrow(() => validateBuildContext(environment, 'darwin'));
  assert.doesNotThrow(() => validateBuildContext({ ...environment, GITHUB_EVENT_NAME: 'workflow_dispatch' }, 'darwin'));
  for (const patch of [
    { GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/develop' },
    { GITHUB_REF: 'refs/tags/production' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
  ]) {
    assert.throws(() => validateBuildContext({ ...environment, ...patch }, 'darwin'), /only in GitHub Actions on production/);
  }
  assert.throws(() => validateBuildContext(environment, 'win32'), /macOS/);
  assert.throws(() => validateBuildContext(environment, 'linux'), /macOS/);
  assert.throws(() => validateBuildContext({ ...environment, EXPO_TOKEN: '' }, 'darwin'), /EXPO_TOKEN/);
});

test('build uses a fixed production profile and local compiler without auto submission', () => {
  const args = buildArguments('/tmp/ios-artifacts/app.ipa');
  assert.equal(args[args.indexOf('--profile') + 1], 'production');
  assert.equal(args[args.indexOf('--platform') + 1], 'ios');
  assert.ok(args.includes('--local'));
  assert.ok(args.includes('--non-interactive'));
  assert.ok(args.includes('--freeze-credentials'));
  assert.equal(args[args.indexOf('--output') + 1], '/tmp/ios-artifacts/app.ipa');
  assert.doesNotMatch(source, /--auto-submit|ASC_APP_ID|eas-cli@latest submit/);
  assert.equal(build.steps.find((step) => step.name === 'Build signed production IPA locally').run, 'npm run build:ios');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:ios'], 'node scripts/build-ios.cjs');
  for (const key of ['build:ios:test', 'build:ios:preview', 'build:ios:simulator', 'deploy:ios']) {
    assert.equal(pkg.scripts[key], undefined);
  }
});

test('public URLs reach the builder without writing the Expo token into config', () => {
  const original = JSON.stringify(eas);
  const result = prepareBuildConfig(app, eas, {
    EXPO_TOKEN: 'test-placeholder',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: ' https://example.com/privacy ',
    EXPO_PUBLIC_SUPPORT_URL: 'mailto:support@example.com',
  });
  assert.equal(result.build.production.env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://example.com/privacy');
  assert.equal(result.build.production.env.EXPO_PUBLIC_SUPPORT_URL, 'mailto:support@example.com');
  assert.doesNotMatch(JSON.stringify(result), /test-placeholder/);
  assert.equal(JSON.stringify(eas), original);
  assert.doesNotThrow(() => prepareBuildConfig(app, eas, {}));
});

test('build rejects wrong identity, signing settings and invalid public URLs', () => {
  for (const patch of [{ owner: 'igentech' }, { slug: 'other' }, { extra: {} }, { ios: { bundleIdentifier: 'com.igen.3s' } }]) {
    assert.throws(() => prepareBuildConfig({ ...app, ...patch }, eas, {}), /Unexpected iOS project/);
  }
  for (const patch of [{ distribution: 'internal' }, { ios: { simulator: true } }, { developmentClient: true },
    { ios: { ...eas.build.production.ios, distribution: 'internal' } },
    { ios: { ...eas.build.production.ios, buildConfiguration: 'Debug' } }, { withoutCredentials: true }]) {
    const changed = structuredClone(eas);
    Object.assign(changed.build.production, patch);
    assert.throws(() => prepareBuildConfig(app, changed, {}), /Production must use store/);
  }
  for (const value of ['http://example.com/privacy', 'javascript:alert(1)', 'not a URL']) {
    assert.throws(() => prepareBuildConfig(app, eas, { EXPO_PUBLIC_PRIVACY_POLICY_URL: value }), /Invalid public URL/);
  }
  const changed = structuredClone(eas);
  changed.build.production.autoIncrement = false;
  assert.throws(() => prepareBuildConfig(app, changed, {}), /autoIncrement/);
});

test('production builds serialize across triggers and validated artifacts are retained for seven days', () => {
  assert.equal(build.concurrency.group, 'ios-production-build');
  assert.equal(build.concurrency['cancel-in-progress'], false);
  const validation = build.steps.findIndex((step) => step.run?.includes('python3 scripts/check-ios-artifact.py'));
  const upload = build.steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(validation >= 0 && upload > validation);
  assert.equal(build.steps[upload].with['retention-days'], 7);
  assert.match(build.steps[upload].with.path, /schedule-support\.ipa/);
  assert.match(build.steps[upload].with.path, /build-info\.json/);
  assert.equal(build.steps[upload].with['if-no-files-found'], 'error');
});

test('IPA metadata and profile regression checks pass without a native build', () => {
  const command = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(command, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', '*_test.py'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
