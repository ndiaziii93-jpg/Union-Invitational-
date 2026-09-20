/* The installable book: does it declare itself installable, does the worker
   take hold, and does it still open with the network switched off?
   Serves docs/app/ over real HTTP, because a service worker will not register
   from a file:// URL. Run: node tools/pwa-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const DIR = 'docs/app';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain' };

let offline = false;
let served = 0;
const server = createServer((req, res) => {
  if (offline) { res.socket.destroy(); return; }          // the course, not the hotel
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIR, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  served++;
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });

const shut = async () => { for (let i = 0; i < 5; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(250); } };

console.log('\nit is a whole document, not a fragment');
/* Wait for the crest to hand the page over, not for a clock. The book is
   held behind it until the tournament arrives or the ceiling fires, and a
   fixed three seconds sat close enough to that ceiling to fail whenever the
   two moved past each other. */
const settled = async () => { await p.waitForSelector('#app.arrived', { timeout: 20000 })
  .catch(() => {}); await p.waitForTimeout(400); };
await p.goto(BASE); await settled(); await shut();
ok('it has a doctype', await p.evaluate(() => !!document.doctype), true);
ok('and a viewport that fits a phone', await p.evaluate(
  () => (document.querySelector('meta[name=viewport]') || {}).content || ''),
  'width=device-width, initial-scale=1, viewport-fit=cover');
ok('the book rendered', await p.locator('.masthead h1').innerText(), 'The Union Invitational');
ok('and it does not scroll sideways', await p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);

/* The crest covers the moment the book spends finding itself, and must get
   out of the way on its own. The failure that matters is not an ugly
   animation: it is a splash that never clears and leaves a blank page. */
console.log('\nthe crest, on the way in');
ok('the book is visible by the time it settles', await p.evaluate(
  () => { const a = document.getElementById('app');
          return !a.classList.contains('behind') && a.getBoundingClientRect().height > 100; }), true);
ok('and the crest has taken itself away', await p.locator('.splash').count(), 0);
ok('the book is not hidden by a stylesheet, only by a class', await p.evaluate(() => {
  const rules = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } });
  return rules.some(r => r.selectorText === '#app' && /opacity\s*:\s*0/.test(r.cssText || ''));
}), false);

console.log('\nit asks to be installed');
const mf = await p.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]');
  if (!link) return null;
  return await (await fetch(link.href)).json();
});
ok('there is a manifest', !!mf, true);
ok('it opens fullscreen, like an app', mf && mf.display, 'standalone');
ok('it starts at the book, not somewhere else', mf && mf.start_url, './');
ok('it is named for the home screen', mf && mf.short_name, 'Union Inv.');
ok('there is an icon at both sizes Android asks for',
  (mf.icons || []).filter(i => i.purpose === 'any').map(i => i.sizes).sort(), ['192x192', '512x512']);
ok('and one that survives being cropped to a circle',
  (mf.icons || []).some(i => i.purpose === 'maskable'), true);
ok('iOS has its own icon to use', await p.evaluate(
  () => !!document.querySelector('link[rel="apple-touch-icon"]')), true);
ok('the status bar is told the colour of the book', await p.evaluate(
  () => !!document.querySelector('meta[name=theme-color]')), true);
for (const i of (mf.icons || [])) {
  const r = await p.evaluate(async src => (await fetch(src)).status, new URL(i.src, BASE).href);
  ok('the ' + i.sizes + ' ' + i.purpose + ' icon is really there', r, 200);
}

console.log('\nthe worker takes hold');
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 })
  .catch(() => {});
ok('a worker is controlling the page', await p.evaluate(
  () => !!navigator.serviceWorker.controller), true);
// let it finish pulling the shell and the fonts into the cache
await p.waitForTimeout(2500);
const cached = await p.evaluate(async () => {
  const names = await caches.keys();
  if (!names.length) return [];
  const c = await caches.open(names[0]);
  return (await c.keys()).map(r => r.url);
});
ok('the book itself is in the cache', cached.some(u => /index\.html$|\/$/.test(u)), true);
ok('and so is the typeface it draws with', cached.filter(u => /\.woff2$/.test(u)).length >= 2, true);
ok('nothing cross-origin is needed at all', await p.evaluate(
  () => [...document.querySelectorAll('link[href],script[src],img[src]')]
    .map(e => e.href || e.src).filter(u => u && !u.startsWith(location.origin)
      && !u.startsWith('data:')).length), 0);

console.log('\nand then the signal goes');
offline = true;
const before = served;
await p.reload({ waitUntil: 'commit' }).catch(() => {});
await settled();
ok('the server really was unreachable', served, before);
ok('the book opened anyway', await p.locator('.masthead h1').innerText(), 'The Union Invitational');
ok('with its tabs', await p.locator('.tab').count() > 6, true);
await shut();
await p.locator('.tab', { hasText: 'Score Entry' }).click(); await p.waitForTimeout(600); await shut();
ok('and score entry still works with no signal', await p.locator('.rcards').count(), 1);
/* getComputedStyle only reports the stack the CSS asked for — it says
   "Source Serif" even when the face never arrived and Georgia is on screen.
   document.fonts.check() asks whether the face is actually loaded. */
await p.evaluate(() => document.fonts.ready);
ok('and the real face is loaded, not a fallback', await p.evaluate(
  () => document.fonts.check('700 32px "Source Serif 4"')), true);
ok('the masthead is set in it', await p.evaluate(
  () => getComputedStyle(document.querySelector('.masthead h1')).fontFamily.includes('Source Serif')), true);
await p.screenshot({ path: '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad/pwa-offline.png', fullPage: false });

await b.close();
server.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nIt installs, and it opens on a dead connection.');
process.exit(fails.length ? 1 : 0);
