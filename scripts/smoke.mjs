// npm run check calls this: loads the page and fails on any script error, missing ready/gl state, or broken pin.
import { serve, launch, collectErrors, goToScene, SETTLE_MS } from './lib.mjs';

const { server, url } = await serve();
const browser = await launch();
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = collectErrors(page);
  await page.goto(url);
  await page.waitForTimeout(SETTLE_MS);
  const cls = await page.evaluate(() => document.documentElement.className);
  if (!/\bready\b/.test(cls)) failures.push('html never reached .ready (class: ' + cls + ')');
  if (!/\bgl\b/.test(cls)) failures.push('WebGL renderer did not start (class: ' + cls + ')');

  // Products stepping: the counter should reach 04 / 04 while pinned.
  const rows = await page.evaluate(() => document.querySelectorAll('.row').length);
  await goToScene(page, 'products', 800 * 0.55 * (rows - 0.5), 2000);
  const count = await page.evaluate(() => document.getElementById('pcount').textContent);
  if (!count.startsWith('0' + rows)) failures.push('Products did not step to the last row (counter: ' + count + ')');

  // Menu: focus moves in, page behind is inert, focus returns on Escape.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
  await page.click('#menuBtn'); await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => document.getElementById('main').hasAttribute('inert')))) failures.push('menu open: #main is not inert');
  await page.keyboard.press('Escape'); await page.waitForTimeout(1300);
  if ((await page.evaluate(() => document.activeElement.id)) !== 'menuBtn') failures.push('menu close: focus did not return to the Menu button');

  failures.push(...errors);
} catch (err) {
  failures.push('smoke crashed: ' + err.message);
} finally {
  await browser.close(); server.close();
}
if (failures.length) { console.error('SMOKE FAILED\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('smoke ok');
