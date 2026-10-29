// npm run probe -- studio:0 studio:1500 --eval "document.querySelector('.studio h2').getBoundingClientRect().top"
// Prints html classes, scroll position and the --eval expression (default: the section indicator text) at each stop.
import { serve, launch, collectErrors, goToScene, parseArgs, contextOptions, SETTLE_MS } from './lib.mjs';
import { buildSite } from './build-site.mjs';

const { mobile, stops, evalExpr } = parseArgs(process.argv.slice(2));
if (!stops.length) { console.error('usage: npm run probe -- <scene[:px]>... [--eval "<js expression>"] [mobile]'); process.exit(2); }
const { server, url } = await serve(0, buildSite().dir);
const browser = await launch();
const page = await (await browser.newContext(contextOptions(mobile))).newPage();
const errors = collectErrors(page);
await page.goto(url);
await page.waitForTimeout(SETTLE_MS);
for (const s of stops) {
  await goToScene(page, s.id, s.offset, 1800);
  const row = await page.evaluate((expr) => ({
    y: Math.round(scrollY), cls: document.documentElement.className.replace(/\s+/g, ' ').trim(),
    value: expr ? eval(expr) : document.getElementById('whereT').textContent,
  }), evalExpr);
  console.log(s.label.padEnd(16), JSON.stringify(row));
}
if (errors.length) console.log('errors:', errors);
await browser.close(); server.close();
