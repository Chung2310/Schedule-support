const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const expected = {
  owner: 'igen-technology',
  slug: 'schedule',
  projectId: '6b866bf1-af89-481f-840e-c2779ec6c5fb',
  bundleIdentifier: 'com.igen.schedule',
};

function validateBuildContext(env = process.env, platform = process.platform) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/production' ||
      !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('iOS builds run only in GitHub Actions on production. Push production or run the workflow with branch production.');
  }
  if (platform !== 'darwin') throw new Error('iOS builds require the GitHub macOS runner.');
  if (!env.EXPO_TOKEN?.trim()) throw new Error('Add EXPO_TOKEN to GitHub Actions secrets.');
}

function prepareBuildConfig(app, eas, env = process.env) {
  const actual = {
    owner: app?.owner,
    slug: app?.slug,
    projectId: app?.extra?.eas?.projectId,
    bundleIdentifier: app?.ios?.bundleIdentifier,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Unexpected iOS project: ${key} must be ${value}.`);
  }
  const production = eas.build?.production;
  const ios = { ...production, ...production?.ios };
  if (ios.distribution !== 'store' || ios.simulator !== false ||
      ios.credentialsSource !== 'remote' || ios.buildConfiguration !== 'Release' ||
      ios.developmentClient === true || ios.withoutCredentials === true) {
    throw new Error('Production must use store distribution, Release, remote credentials and ios.simulator=false.');
  }
  if (eas.cli?.appVersionSource !== 'remote' || ios.autoIncrement !== true) {
    throw new Error('Production requires remote appVersionSource and autoIncrement=true.');
  }
  const result = structuredClone(eas);
  result.build.production.env ??= {};
  for (const key of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
    const value = env[key]?.trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`Invalid public URL: ${key}`); }
    const allowed = url.protocol === 'https:' || (key === 'EXPO_PUBLIC_SUPPORT_URL' && url.protocol === 'mailto:' && url.pathname);
    if (!allowed) throw new Error(`Invalid public URL: ${key}`);
    result.build.production.env[key] = value;
  }
  return result;
}

function buildArguments(output) {
  return ['--yes', 'eas-cli@latest', 'build', '--platform', 'ios', '--profile', 'production',
    '--local', '--non-interactive', '--freeze-credentials', '--output', output];
}

function run() {
  validateBuildContext();
  const checkOnly = process.argv.slice(2);
  if (checkOnly.length && !(checkOnly.length === 1 && checkOnly[0] === '--check')) {
    throw new Error('Only --check is accepted. The build profile is fixed to production.');
  }
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  const easPath = path.join(projectRoot, 'eas.json');
  const eas = prepareBuildConfig(app, JSON.parse(fs.readFileSync(easPath, 'utf8')));
  if (!process.env.RUNNER_TEMP || !path.isAbsolute(process.env.RUNNER_TEMP)) {
    throw new Error('GitHub RUNNER_TEMP must be an absolute path.');
  }
  const outputDirectory = path.join(process.env.RUNNER_TEMP, 'ios-artifacts');
  const relative = path.relative(projectRoot, outputDirectory);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    throw new Error('Build artifacts must be outside the source directory.');
  }
  fs.writeFileSync(easPath, `${JSON.stringify(eas, null, 2)}\n`);
  if (checkOnly.length) {
    console.log('Production iOS build context and project configuration are valid.');
    return;
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, 'igencheck.ipa');
  const result = spawnSync('npx', buildArguments(output), { cwd: projectRoot, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local iOS build failed (exit ${result.status ?? result.signal}).`);
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) throw new Error('Build did not produce an IPA.');
  console.log(`IPA created: ${output}`);
}

module.exports = { validateBuildContext, prepareBuildConfig, buildArguments };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
