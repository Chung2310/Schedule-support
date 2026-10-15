const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', '.expo/**'] },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.cjs'],
    languageOptions: { globals: { __dirname: 'readonly', module: 'readonly', require: 'readonly', exports: 'readonly', process: 'readonly', Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
  },
]);
