// npm run shoot [desktop|mobile]: screenshots every scene and tiles them into one contact sheet (shots/sheet-<mode>.png),
// so one image read shows the whole page.
import fs from 'node:fs';
import { serve, launch, collectErrors, goToScene, SETTLE_MS } from './lib.mjs';

const mode = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const ctxOpts = mode === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 800 } };
const SHOTS = [['Hero', 'top', 0], ['Vision', 'vision', 1000], ['Products 1', 'products', 200], ['Products 4', 'products', 1500], ['Studio', 'studio', 0], ['Contact', 'contact', 5000]];

fs.mkdirSync('shots', { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
const errors = collectErrors(page);
await page.goto(url);
await page.waitForTimeout(SETTLE_MS);

const tiles = [];
for (const [label, id, offset] of SHOTS) {
  await goToScene(page, id, offset);
  tiles.push({ label, data: (await page.screenshot()).toString('base64') });
}

const cols = mode === 'mobile' ? 6 : 3;
const sheet = await ctx.newPage();
await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">` +
  tiles.map((t) => `<figure style="margin:0;color:#fff;font:12px sans-serif"><img style="width:100%;display:block" src="data:image/png;base64,${t.data}"><figcaption style="padding:4px">${t.label}</figcaption></figure>`).join('') + '</body>');
await sheet.setViewportSize({ width: mode === 'mobile' ? 1500 : 1900, height: 800 });
await sheet.screenshot({ path: `shots/sheet-${mode}.png`, fullPage: true });
await browser.close(); server.close();
console.log(`shots/sheet-${mode}.png written` + (errors.length ? '\nerrors:\n- ' + errors.join('\n- ') : ''));
