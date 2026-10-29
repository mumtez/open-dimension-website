// npm run shoot                       six-scene contact sheet (desktop)
// npm run shoot -- mobile             same at phone size
// npm run shoot -- hero studio:1200   only these stops ("scene" or "scene:px-below-its-top")
// Output: shots/sheet-<mode>.png (one image shows every stop)
import fs from 'node:fs';
import { serve, launch, collectErrors, goToScene, parseArgs, contextOptions, SETTLE_MS } from './lib.mjs';
import { buildSite } from './build-site.mjs';

const { mobile, stops } = parseArgs(process.argv.slice(2));
const mode = mobile ? 'mobile' : 'desktop';
const DEFAULT = [['hero', 0], ['vision', 1000], ['products', 200], ['products', 1500], ['studio', 1200], ['contact', 5000]]
  .map(([n, o]) => parseArgs([`${n}:${o}`]).stops[0]);
const list = stops.length ? stops : DEFAULT;

fs.mkdirSync('shots', { recursive: true });
const { server, url } = await serve(0, buildSite().dir);
const browser = await launch();
const ctx = await browser.newContext(contextOptions(mobile));
const page = await ctx.newPage();
const errors = collectErrors(page);
await page.goto(url);
await page.waitForTimeout(SETTLE_MS);

const tiles = [];
for (const s of list) {
  await goToScene(page, s.id, s.offset);
  tiles.push({ label: s.label, data: (await page.screenshot()).toString('base64') });
}

const cols = Math.min(tiles.length, mobile ? 6 : 3);
const sheet = await ctx.newPage();
await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">` +
  tiles.map((t) => `<figure style="margin:0;color:#fff;font:12px sans-serif"><img style="width:100%;display:block" src="data:image/png;base64,${t.data}"><figcaption style="padding:4px">${t.label}</figcaption></figure>`).join('') + '</body>');
await sheet.setViewportSize({ width: mobile ? 1500 : Math.min(1900, 640 * cols), height: 800 });
await sheet.screenshot({ path: `shots/sheet-${mode}.png`, fullPage: true });
await browser.close(); server.close();
console.log(`shots/sheet-${mode}.png written` + (errors.length ? '\nerrors:\n- ' + errors.join('\n- ') : ''));
