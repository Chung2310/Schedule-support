const { withAppBuildGradle } = require('expo/config-plugins');

const signingBlock = `
// @generated begin igen-ci-signing
def igenKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
def igenStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
def igenKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
def igenKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
if (!igenKeystorePath || !igenStorePassword || !igenKeyAlias || !igenKeyPassword) {
    throw new GradleException("Android CI release signing environment is incomplete")
}
android {
    signingConfigs {
        ciRelease {
            storeFile file(igenKeystorePath)
            storePassword igenStorePassword
            keyAlias igenKeyAlias
            keyPassword igenKeyPassword
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.ciRelease
        }
    }
}
// @generated end igen-ci-signing
`;

function injectReleaseSigning(contents) {
  const clean = contents.replace(/\n?\/\/ @generated begin igen-ci-signing[\s\S]*?\/\/ @generated end igen-ci-signing\n?/g, '');
  return clean.trimEnd() + '\n' + signingBlock;
}

function withAndroidRelease(config) {
  if (process.env.ANDROID_CI_RELEASE !== '1') return config;
  const value = process.env.ANDROID_VERSION_CODE || '';
  const versionCode = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) {
    throw new Error('Android CI requires a valid ANDROID_VERSION_CODE.');
  }
  config.android = { ...config.android, versionCode };
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android CI signing requires a Groovy app/build.gradle.');
    mod.modResults.contents = injectReleaseSigning(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidRelease;
module.exports.injectReleaseSigning = injectReleaseSigning;
