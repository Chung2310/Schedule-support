const fs = require('node:fs');
const path = require('node:path');
const policy = require('../src/content/privacy-policy.json');

const escape = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const sections = policy.sections.map((section) => `<section><h2>${escape(section.title)}</h2>${section.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('\n')}</section>`).join('\n');
const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(policy.title)} — ${escape(policy.appName)}">
  <title>${escape(policy.title)} — ${escape(policy.appName)}</title>
  <style>body{margin:0;background:#f8fafc;color:#334155;font-family:system-ui,sans-serif;line-height:1.75}main{max-width:760px;margin:auto;padding:40px 24px 72px}h1,h2{color:#0a2540;line-height:1.3}h1{font-size:2rem}h2{font-size:1.2rem;margin-top:2rem}.updated{color:#64748b;font-size:.9rem}p{margin:0 0 1rem}</style>
</head>
<body><main>
  <h1>${escape(policy.title)}</h1>
  <p class="updated">${escape(policy.appName)} · Cập nhật ${escape(policy.updatedAt)}</p>
  <p>${escape(policy.intro)}</p>
  ${sections}
</main></body>
</html>
`;
const output = path.join(__dirname, '..', 'docs', 'privacy-policy.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log('Updated docs/privacy-policy.html from the in-app policy.');
