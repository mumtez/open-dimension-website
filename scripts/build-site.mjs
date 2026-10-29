// Assembles _site/ with exactly the files the page needs: index.html plus every local file it (and its CSS) references.
// Used by the deploy workflow and the smoke test, so both see what ships. Fails if a referenced file is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const EXTRA = ['assets/og.png'];                 // referenced by absolute URL in the Open Graph tags
const isLocal = (u) => u && !/^([a-z]+:|#|\/\/)/i.test(u);

export function buildSite() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const seen = new Set(); const queue = ['index.html', ...EXTRA]; const missing = [];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) { missing.push(rel); continue; }
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(OUT, rel));
    const ext = path.extname(rel);
    if (ext !== '.html' && ext !== '.css') continue;
    const text = fs.readFileSync(src, 'utf8');
    const refs = ext === '.html'
      ? [...text.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
      : [...text.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]);
    for (const ref of refs) {
      const clean = ref.split(/[?#]/)[0];
      if (isLocal(clean)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), clean)));
    }
  }
  if (missing.length) throw new Error('referenced files are missing: ' + missing.join(', '));
  fs.writeFileSync(path.join(OUT, 'CNAME'), 'open-dimension.com\n');
  return { dir: OUT, files: [...seen].sort() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files } = buildSite();
  console.log('_site/ ready:\n  ' + files.join('\n  '));
}
