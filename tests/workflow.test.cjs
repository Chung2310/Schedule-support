const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('yaml');

const workflow = yaml.parse(fs.readFileSync(path.resolve(__dirname, '../.github/workflows/ios-production.yml'), 'utf8'));
const release = workflow.jobs['build-and-submit'].steps.find((step) => step.name === 'Check release configuration');
const script = release.run.replace(/^node <<'NODE'\r?\n/, '').replace(/\r?\nNODE\s*$/, '');
function evaluate(extraEnvironment = {}, extraApp = {}) {
  let generated;
  vm.runInNewContext(script, {
    process: { env: { ASC_APP_ID: '1234567890', EXPO_TOKEN: 'test-placeholder', ...extraEnvironment } },
    require(name) {
      assert.equal(name, 'node:fs');
      return {
        readFileSync(filename) {
          return JSON.stringify(filename === 'app.json'
            ? { expo: { ios: { bundleIdentifier: 'com.company.calendar' }, extra: { eas: { projectId: 'test-project' } }, ...extraApp } }
            : { build: { production: {} }, submit: { production: { ios: {} } } });
        },
        writeFileSync(filename, contents) { assert.equal(filename, 'eas.json'); generated = JSON.parse(contents); },
      };
    },
  });
  return generated;
}

test('workflow sends public legal URLs to the EAS builder without writing the Expo secret into config', () => {
  const result = evaluate({ EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://example.com/privacy', EXPO_PUBLIC_SUPPORT_URL: 'mailto:support@example.com' });
  assert.equal(result.submit.production.ios.ascAppId, '1234567890');
  assert.equal(result.build.production.env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://example.com/privacy');
  assert.equal(result.build.production.env.EXPO_PUBLIC_SUPPORT_URL, 'mailto:support@example.com');
  assert.doesNotMatch(JSON.stringify(result), /test-placeholder/);
});

test('workflow rejects missing EAS project or Expo token before building', () => {
  assert.throws(() => evaluate({}, { extra: {} }), /projectId/);
  assert.throws(() => evaluate({ EXPO_TOKEN: '' }), /EXPO_TOKEN/);
});

test('workflow rejects an insecure public policy URL', () => {
  assert.throws(() => evaluate({ EXPO_PUBLIC_PRIVACY_POLICY_URL: 'http://example.com/privacy' }), /Invalid public URL/);
});
