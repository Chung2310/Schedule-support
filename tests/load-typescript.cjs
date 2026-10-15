const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the production TS modules with native boundaries supplied by each test.
function createLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(__dirname, '..', filename);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(compiled, {
      module, exports: module.exports, console, Date, setTimeout, clearTimeout, ...globals,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (!name.startsWith('.')) throw new Error(`Unmocked native import: ${name}`);
        const target = path.resolve(path.dirname(absolute), name);
        for (const extension of ['.ts', '.json']) {
          if (fs.existsSync(target + extension)) {
            if (extension === '.json') return JSON.parse(fs.readFileSync(target + extension, 'utf8'));
            return load(target + extension);
          }
        }
        throw new Error(`Unresolved import: ${name}`);
      },
    }, { filename: absolute });
    return module.exports;
  }
  return load;
}

module.exports = { createLoader };
