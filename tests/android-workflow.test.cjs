const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const yaml = require('yaml');
const android = require('../scripts/build-android.cjs');
const { validateArtifact } = require('../scripts/check-android-artifact.cjs');
const { injectReleaseSigning } = require('../plugins/withAndroidRelease.cjs');
const { validateWorkloadIdentity, validateProductionHead, validateReleaseInputs } = require('../scripts/check-android-release-inputs.cjs');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflowSource = fs.readFileSync(path.join(root, '.github/workflows/android-production.yml'), 'utf8');
const workflow = yaml.parse(workflowSource);
const build = workflow.jobs['build-android'];
const submit = workflow.jobs['submit-android'];
const environment = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/production', GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_NUMBER: '12', GITHUB_RUN_ATTEMPT: '1' };
const signing = { ANDROID_KEYSTORE_BASE64: Buffer.from('test-keystore').toString('base64'),
  ANDROID_KEYSTORE_PASSWORD: 'store-test-password', ANDROID_KEY_ALIAS: 'upload', ANDROID_KEY_PASSWORD: 'key-test-password' };

test('Android build and direct upload only run on production after validation', () => {
  for (const job of [build, submit]) {
    const expression = job.if.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
    for (const event of ['push', 'workflow_dispatch', 'pull_request', 'pull_request_target', 'schedule']) {
      for (const ref of ['refs/heads/production', 'refs/heads/develop', 'refs/tags/production', 'refs/pull/1/merge']) {
        const expected = ref === 'refs/heads/production' && ['push', 'workflow_dispatch'].includes(event);
        assert.equal(vm.runInNewContext(expression, { github: { ref, event_name: event }, inputs: { upload_to_play: true }, vars: { GOOGLE_PLAY_UPLOAD_ENABLED: 'true' } }), expected);
      }
    }
  }
  assert.equal(build.needs, 'validate');
  assert.equal(submit.needs, 'build-android');
  assert.equal(workflow.concurrency.group, 'android-production-${{ github.ref }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const commands = workflow.jobs.validate.steps.map(step => step.run).filter(Boolean).join('\n');
  for (const command of ['npm run lint', 'npm run typecheck', 'npm test', 'expo-doctor@1.21.6', 'npm run android:check']) {
    assert.ok(commands.includes(command));
  }
});

test('Android CI needs no Expo token, account or EAS build/submit configuration', () => {
  assert.doesNotThrow(() => android.validateBuildContext(environment, 'linux'));
  for (const patch of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/develop' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_SHA: '' }]) {
    assert.throws(() => android.validateProductionContext({ ...environment, ...patch }));
  }
  for (const host of ['darwin', 'win32']) assert.throws(() => android.validateBuildContext(environment, host), /Ubuntu/);
  assert.doesNotMatch(workflowSource, /EXPO_TOKEN|eas-cli|expo\/expo-github-action/);
  assert.equal(pkg.scripts['submit:android'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'scripts/submit-android.cjs')), false);
  assert.deepEqual(android.gradleArguments().slice(0, 1), [':app:bundleRelease']);
  assert.doesNotThrow(() => android.validateAppConfig(app));
  assert.throws(() => android.validateAppConfig({ ...app, android: { package: 'com.other.app' } }));
});

test('versionCode increases between runs and reruns, supports migration and rejects overflow', () => {
  assert.equal(android.calculateVersionCode(environment), 12001);
  assert.equal(android.calculateVersionCode({ ...environment, GITHUB_RUN_ATTEMPT: '2' }), 12002);
  assert.equal(android.calculateVersionCode({ ...environment, GITHUB_RUN_NUMBER: '13' }), 13001);
  assert.equal(android.calculateVersionCode({ ...environment, ANDROID_VERSION_CODE_BASE: '100000' }), 112001);
  for (const patch of [{ GITHUB_RUN_NUMBER: '0' }, { GITHUB_RUN_ATTEMPT: '1000' },
    { GITHUB_RUN_ATTEMPT: '' }, { ANDROID_VERSION_CODE_BASE: '-1' }, { ANDROID_VERSION_CODE_BASE: '2100000000' }]) {
    assert.throws(() => android.calculateVersionCode({ ...environment, ...patch }));
  }
});

test('signing requires all GitHub secrets and valid base64 without exposing secret contents', () => {
  assert.equal(android.decodeKeystore(signing).toString(), 'test-keystore');
  for (const key of Object.keys(signing)) {
    assert.throws(() => android.decodeKeystore({ ...signing, [key]: '' }), new RegExp(key));
  }
  assert.throws(() => android.decodeKeystore({ ...signing, ANDROID_KEYSTORE_BASE64: '!!!invalid!!!' }), /not valid base64/);
  const env = android.buildEnvironment({ ...environment, ...signing, EXPO_TOKEN: 'unused-token',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: ' https://example.com/privacy ', EXPO_PUBLIC_SUPPORT_URL: 'mailto:help@example.com' });
  assert.equal(env.EXPO_TOKEN, undefined);
  assert.equal(env.ANDROID_KEYSTORE_BASE64, undefined);
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.ANDROID_VERSION_CODE, '12001');
  assert.equal(env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://example.com/privacy');
  assert.throws(() => android.buildEnvironment({ ...environment, EXPO_PUBLIC_PRIVACY_POLICY_URL: 'http://example.com' }), /Invalid public URL/);
});

test('CNG plugin overrides debug signing for Release and remains idempotent', () => {
  const template = 'android { buildTypes { release { signingConfig signingConfigs.debug } } }\n';
  const once = injectReleaseSigning(template);
  assert.equal(injectReleaseSigning(once), once);
  assert.ok(once.lastIndexOf('signingConfig signingConfigs.ciRelease') > once.indexOf('signingConfig signingConfigs.debug'));
  assert.match(once, /throw new GradleException/);
  for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    assert.ok(once.includes(`System.getenv("${name}")`));
  }
  for (const secret of Object.values(signing)) assert.ok(!once.includes(secret));
});

test('CNG plugin only enables CI version and signing when requested and rejects other Gradle dialects', () => {
  for (const enabled of [false, true]) {
    const module = { exports: {} };
    let callback;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'plugins/withAndroidRelease.cjs'), 'utf8'), {
      module, process: { env: enabled ? { ANDROID_CI_RELEASE: '1', ANDROID_VERSION_CODE: '12001' } : {} },
      require: () => ({ withAppBuildGradle: (config, action) => { callback = action; return config; } }),
    });
    const config = structuredClone(app);
    const result = module.exports(config);
    assert.deepEqual(result.ios, app.ios);
    if (!enabled) { assert.equal(callback, undefined); assert.deepEqual(result, app); }
    else {
      assert.equal(result.android.versionCode, 12001);
      assert.match(callback({ modResults: { language: 'groovy', contents: 'android {}' } }).modResults.contents, /ciRelease/);
      assert.throws(() => callback({ modResults: { language: 'kotlin', contents: '' } }), /Groovy/);
    }
  }
});

test('direct Play upload occurs only after the exact artifact passes commit and checksum checks', () => {
  const upload = build.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const download = submit.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  const verify = submit.steps.findIndex(step => step.run === 'node scripts/check-android-artifact.cjs');
  const publish = submit.steps.findIndex(step => step.uses?.startsWith('r0adkll/upload-google-play@'));
  assert.equal(build.outputs['aab-artifact-id'], '${{ steps.aab-artifact.outputs.artifact-id }}');
  assert.equal(download.with['artifact-ids'], '${{ needs.build-android.outputs.aab-artifact-id }}');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.match(upload.with.path, /igencheck\.aab/);
  assert.ok(verify >= 0 && publish > verify);
  const action = submit.steps[publish];
  assert.equal(action.with.serviceAccountJson, '${{ steps.google-auth.outputs.credentials_file_path }}');
  assert.equal(action.with.serviceAccountJsonPlainText, undefined);
  assert.equal(action.with.packageName, android.applicationId);
  assert.equal(action.with.tracks, 'internal');
  assert.equal(action.with.track, undefined);
  assert.equal(action.with.status, 'completed');
  assert.match(action.uses, /@[a-f0-9]{40}$/);
  assert.equal(action.with.releaseFiles, '${{ runner.temp }}/android-artifacts/igencheck.aab');
  const info = { platform: 'android', applicationId: android.applicationId, displayName: 'iGen Check',
    buildSystem: 'gradle', versionCode: 12001, commit: environment.GITHUB_SHA, sha256: 'b'.repeat(64),
    nativeValidation: 'bundletool-1.18.3-and-jar-signature', signingCertificateSha256: 'd'.repeat(64) };
  assert.doesNotThrow(() => validateArtifact(info, info.sha256, environment));
  for (const patch of [{ applicationId: 'com.other.app' }, { buildSystem: 'eas' }, { versionCode: 0 },
    { commit: 'other' }, { sha256: 'invalid' }, { nativeValidation: undefined }, { signingCertificateSha256: 'invalid' }]) {
    assert.throws(() => validateArtifact({ ...info, ...patch }, info.sha256, environment));
  }
  assert.throws(() => validateArtifact(info, 'c'.repeat(64), environment), /checksum/);
});

test('a failed prebuild or Gradle build removes the keystore and emits no successful artifact metadata', () => {
  for (const failAt of [1, 2]) {
    const removed = [], writes = [], calls = [];
    const module = { exports: {} };
    const fakeProcess = { argv: ['node', 'build-android.cjs'], execPath: process.execPath, platform: 'linux',
      env: { ...environment, ...signing, RUNNER_TEMP: path.parse(root).root, GITHUB_STEP_SUMMARY: 'summary.md' } };
    const mockRequire = name => {
      if (name === 'node:fs') return {
        readFileSync: () => JSON.stringify({ expo: app }), mkdirSync: () => {}, chmodSync: () => {},
        writeFileSync: file => writes.push(file), appendFileSync: file => writes.push(file),
        rmSync: file => removed.push(file),
      };
      if (name === 'node:child_process') return {
        spawnSync: (command, args, options) => {
          if (command === 'java') return { status: 0, stdout: 'ab'.repeat(32) };
          calls.push({ command, args, options }); return { status: calls.length === failAt ? 1 : 0 };
        },
      };
      return require(name);
    };
    mockRequire.main = module;
    mockRequire.resolve = require.resolve;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/build-android.cjs'), 'utf8'), {
      module, require: mockRequire, __dirname: path.join(root, 'scripts'), process: fakeProcess,
      Buffer, URL, console: { error: () => {} },
    });
    assert.equal(fakeProcess.exitCode, 1);
    assert.equal(calls.length, failAt);
    assert.ok(removed.some(file => file.endsWith('upload.keystore')));
    assert.ok(!writes.some(file => file.endsWith('build-info.json') || file === 'summary.md'));
    assert.ok(calls[0].args.includes('prebuild'));
    assert.ok(calls[0].args.includes('--template'));
    assert.equal(calls[0].options.env.EXPO_TOKEN, undefined);
    if (failAt === 2) assert.equal(calls[1].command, './gradlew');
  }
});

test('release preflight rejects invalid WIF variables and superseded production commits', () => {
  const wif = {
    GOOGLE_WORKLOAD_IDENTITY_PROVIDER: 'projects/147431615644/locations/global/workloadIdentityPools/github-actions/providers/schedule-production',
    GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: 'github-play-upload@project-3f31facf-7a10-4984-bbb.iam.gserviceaccount.com',
  };
  assert.doesNotThrow(() => validateWorkloadIdentity(wif));
  for (const patch of [{ GOOGLE_WORKLOAD_IDENTITY_PROVIDER: '' }, { GOOGLE_WORKLOAD_IDENTITY_PROVIDER: 'schedule-production' },
    { GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: '' }, { GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: 'user@example.com' }]) {
    assert.throws(() => validateWorkloadIdentity({ ...wif, ...patch }), /Set GOOGLE_/);
  }
  assert.doesNotThrow(() => validateProductionHead(`${environment.GITHUB_SHA}\trefs/heads/production\n`, environment));
  assert.throws(() => validateProductionHead(`${'b'.repeat(40)}\trefs/heads/production`, environment), /obsolete/);
  assert.throws(() => validateProductionHead('', environment), /determine/);
});

test('release fails early on missing inputs and never publishes a bundle before native verification', () => {
  const preflight = build.steps.findIndex(step => step.run?.includes('check-android-release-inputs.cjs --build'));
  const compile = build.steps.findIndex(step => step.run === 'npm run build:android');
  const native = build.steps.findIndex(step => step.run?.includes('check-android-bundle.py'));
  const save = build.steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(preflight >= 0 && compile > preflight && native > compile && save > native);
  assert.equal(build.env.GOOGLE_WORKLOAD_IDENTITY_PROVIDER, '${{ vars.GOOGLE_WORKLOAD_IDENTITY_PROVIDER }}');
  assert.doesNotMatch(workflowSource, /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  const cleanup = build.steps.find(step => step.name === 'Remove temporary signing key');
  assert.equal(cleanup.if, '${{ always() }}');
  assert.match(cleanup.run, /upload\.keystore/);
  assert.ok(submit.steps.some(step => step.run?.includes('check-android-release-inputs.cjs --upload')));
});

test('local checks need no credentials and APK release entry points remain removed', () => {
  const result = spawnSync(process.execPath, ['scripts/build-android.cjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(pkg.scripts['build:android:apk'], undefined);
  assert.equal(pkg.scripts['build:android:test'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'scripts/build-android-apk.cjs')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/android-apk.yml')), false);
  assert.throws(() => android.artifactDirectory({ RUNNER_TEMP: root }), /outside/);
});

test('first-upload build-only mode produces an AAB without requiring a Google service account', () => {
  const input = workflow.on.workflow_dispatch.inputs.upload_to_play;
  assert.equal(input.type, 'boolean');
  assert.equal(input.default, true);
  const context = { github: { ref: 'refs/heads/production', event_name: 'workflow_dispatch' }, inputs: { upload_to_play: false }, vars: { GOOGLE_PLAY_UPLOAD_ENABLED: 'true' } };
  const evaluate = job => vm.runInNewContext(job.if.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, ''), context);
  assert.equal(evaluate(build), true);
  assert.equal(evaluate(submit), false);
  context.github.event_name = 'push';
  assert.equal(evaluate(submit), true);
  context.vars = {};
  assert.equal(evaluate(build), true);
  assert.equal(evaluate(submit), false);
  const envExpression = build.env.ANDROID_UPLOAD_TO_PLAY.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  assert.equal(vm.runInNewContext(envExpression, context), false);
  context.vars.GOOGLE_PLAY_UPLOAD_ENABLED = 'true';
  assert.equal(vm.runInNewContext(envExpression, context), true);
  const env = { ...environment, ...signing, ANDROID_UPLOAD_TO_PLAY: 'false' };
  assert.doesNotThrow(() => validateReleaseInputs('--build', env));
  assert.throws(() => validateReleaseInputs('--upload', env), /GOOGLE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.throws(() => validateReleaseInputs('--build', { ...env, ANDROID_UPLOAD_TO_PLAY: 'true' }), /GOOGLE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.throws(() => validateReleaseInputs('--build', { ...env, ANDROID_UPLOAD_TO_PLAY: 'invalid' }), /true or false/);
  assert.throws(() => validateReleaseInputs('--build', { ...env, ANDROID_KEYSTORE_BASE64: '' }), /ANDROID_KEYSTORE_BASE64/);
  const save = build.steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'));
  const explain = build.steps.findIndex(step => step.name === 'Explain first-upload build-only result');
  assert.ok(explain > save);
});

test('Google Play uses the BNI environment pattern and authenticates just before upload with OIDC', () => {
  assert.equal(build.environment, 'google-play');
  assert.equal(submit.environment, 'google-play');
  assert.equal(submit.permissions['id-token'], 'write');
  assert.equal(workflow.permissions['id-token'], undefined);
  assert.equal(build.permissions?.['id-token'], undefined);
  const check = submit.steps.findIndex(step => step.run === 'node scripts/check-android-artifact.cjs');
  const auth = submit.steps.findIndex(step => step.id === 'google-auth');
  const publish = submit.steps.findIndex(step => step.uses?.startsWith('r0adkll/upload-google-play@'));
  assert.ok(check >= 0 && auth > check && publish > auth);
  const authentication = submit.steps[auth];
  assert.match(authentication.uses, /^google-github-actions\/auth@[a-f0-9]{40}$/);
  assert.equal(authentication.with.workload_identity_provider, '${{ vars.GOOGLE_WORKLOAD_IDENTITY_PROVIDER }}');
  assert.equal(authentication.with.service_account, '${{ vars.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL }}');
  assert.equal(authentication.with.credentials_json, undefined);
  assert.equal(authentication.with.create_credentials_file, true);
  assert.equal(authentication.with.cleanup_credentials, true);
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('gha-creds-*.json'));
});
