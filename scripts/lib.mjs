// Shared helpers for smoke.mjs and shoot.mjs: a static server and a headless Chromium that can run WebGL2.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function serve(port = 0, root = ROOT) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, url: `http://localhost:${server.address().port}/` })));
}

// SwiftShader gives software WebGL2 in headless Chromium (also works in CI).
export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// The loader plus the first GL frames need about 8s before the page is fully interactive.
export const SETTLE_MS = 8000;

// Collects console errors and uncaught exceptions (software-GL perf warnings are noise).
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  return errors;
}

// Scroll helpers expressed in scene terms: top of a scene, plus an offset in px.
export const sceneTop = (page, id) => page.evaluate((i) => document.getElementById(i).offsetTop, id);
export async function goToScene(page, id, offset = 0, wait = 2500) {
  const y = (await sceneTop(page, id)) + offset;
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(wait);
}

// Scene stops for shoot/probe: "studio", "studio:1200" (scene top plus px). "hero" is the page top.
const SCENE_IDS = { hero: 'top', vision: 'vision', products: 'products', studio: 'studio', contact: 'contact' };
export function parseArgs(argv) {
  const out = { mobile: false, evalExpr: null, stops: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === 'mobile' || argv[i] === '--mobile') out.mobile = true;
    else if (argv[i] === '--eval') out.evalExpr = argv[++i];
    else { const [name, off] = argv[i].split(':'); if (SCENE_IDS[name]) out.stops.push({ label: argv[i], id: SCENE_IDS[name], offset: Number(off) || 0 }); }
  }
  return out;
}
export const contextOptions = (mobile) => mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 800 } };
