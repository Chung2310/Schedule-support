const fs = require('node:fs');
const path = require('node:path');
// Preserve the existing legal:build entry point while building all legal pages.
const documents = [
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'terms-of-service', label: 'Terms of Service' },
  { slug: 'data-deletion', label: 'Data Deletion' },
];

const escape = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
for (const document of documents) {
const policy = require(`../src/content/${document.slug}.json`);
const navigation = documents.map(({ slug, label }) => `<a href="${slug}.html"${slug === document.slug ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('\n');
const sections = policy.sections.map((section) => `<section><h2>${escape(section.title)}</h2>${section.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('\n')}</section>`).join('\n');
const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(policy.title)} — ${escape(policy.appName)}">
  <title>${escape(policy.title)} — ${escape(policy.appName)}</title>
  <style>body{margin:0;background:#f8fafc;color:#334155;font-family:system-ui,sans-serif;line-height:1.75}main{max-width:760px;margin:auto;padding:40px 24px 72px}h1,h2{color:#0a2540;line-height:1.3}h1{font-size:2rem}h2{font-size:1.2rem;margin-top:2rem}.updated{color:#64748b;font-size:.9rem}p{margin:0 0 1rem}</style>
  <style>nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}nav a{padding:10px 14px;color:#0a2540;border:1px solid #cbd5e1;border-radius:12px;text-decoration:none}nav a[aria-current="page"]{background:#0a2540;color:white}a:focus-visible{outline:3px solid #2563eb;outline-offset:3px}section{background:white;padding:20px;border:1px solid #e2e8f0;border-radius:18px;margin:16px 0}section h2{margin-top:0}p{overflow-wrap:anywhere}@media(max-width:480px){main{padding:24px 16px 48px}h1{font-size:1.65rem}}</style>
</head>
<body><main>
  <nav aria-label="Thông tin pháp lý">${navigation}</nav>
  <p class="updated">${escape(document.label)}</p>
  <h1>${escape(policy.title)}</h1>
  <p class="updated">${escape(policy.appName)} · Cập nhật ${escape(policy.updatedAt)}</p>
  <p>${escape(policy.intro)}</p>
  ${sections}
</main></body>
</html>
`;
const output = path.join(__dirname, '..', 'docs', `${document.slug}.html`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
if (document.slug === 'privacy-policy') {
  fs.writeFileSync(path.join(path.dirname(output), 'index.html'), html, 'utf8');
}
console.log(`Updated docs/${document.slug}.html from the in-app content.`);
}
