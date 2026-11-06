const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { applicationId, validateProductionContext, artifactDirectory } = require('./build-android.cjs');

function validateArtifact(info, sha256, env = process.env) {
  if (info.platform !== 'android' || info.applicationId !== applicationId ||
      info.displayName !== 'iGen Check' || info.buildSystem !== 'gradle' ||
      info.nativeValidation !== 'bundletool-1.18.3-and-jar-signature' ||
      !/^[a-f0-9]{64}$/.test(info.signingCertificateSha256 || '') ||
      !Number.isSafeInteger(info.versionCode) || info.versionCode <= 0 || info.versionCode > 2_100_000_000) {
    throw new Error('Downloaded AAB metadata belongs to another app or build system.');
  }
  if (!env.GITHUB_SHA || info.commit !== env.GITHUB_SHA) throw new Error('Downloaded AAB was built from a different commit.');
  if (!/^[a-f0-9]{64}$/.test(info.sha256 || '') || info.sha256 !== sha256) {
    throw new Error('Downloaded AAB checksum does not match the build.');
  }
}

function run() {
  if (process.argv.length !== 2) throw new Error('This check uses the AAB from the current production run.');
  validateProductionContext();
  const directory = artifactDirectory();
  const aab = path.join(directory, 'igencheck.aab');
  if (fs.statSync(aab).size === 0) throw new Error('Cannot upload an empty AAB.');
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8'));
  validateArtifact(info, crypto.createHash('sha256').update(fs.readFileSync(aab)).digest('hex'));
  console.log(`AAB verified for ${applicationId}, versionCode ${info.versionCode}.`);
}

module.exports = { validateArtifact };
if (require.main === module) {
  try { run(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
