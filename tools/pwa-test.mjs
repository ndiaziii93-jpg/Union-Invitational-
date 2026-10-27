/* The installable book: does it declare itself installable, does the worker
   take hold, and does it still open with the network switched off?
   Serves docs/app/ over real HTTP, because a service worker will not register
   from a file:// URL. Run: node tools/pwa-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

/* ---- getting about the book ----
   Four tabs now — Today, Scores, Boards, Resort — and the five screens that
   are set up once live behind Manage. So a name is looked for on the bar
   first, then behind that door, and last of all among the boards, which is
   where the Ryder Cup went. The same three places a person would look. */
const goTab = async (pg, t) => {
  const direct = pg.locator('.tab:visible, .navbtn:visible', { hasText: t });
  if (await direct.count()) { await direct.first().click(); return; }
  const door = pg.locator('[data-act="manageOpen"]');
  if (await door.count()) {
    await door.first().click();
    await pg.waitForTimeout(400);
    const row = pg.locator('.mg-row', { hasText: t });
    if (await row.count()) { await row.first().click(); return; }
    await pg.locator('.mgmodal [data-act="modalCancel"]').click().catch(() => {});
    await pg.waitForTimeout(300);
  }
  await pg.locator('.tab:visible, .navbtn:visible', { hasText: 'Boards' }).first().click();
  await pg.waitForTimeout(500);
  await pg.locator('.btab', { hasText: t }).first().click();
};


const DIR = 'docs/app';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
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
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', date: new Date().toUTCString() });
  /* THE TEST NEVER TALKS TO THE REAL BOOK. The page is served with its
     database pointed at a port nobody answers on, so every read fails and
     every write goes to the outbox — which is the condition under test —
     and nothing typed here can land in the tournament's own chat. */
  if (file.endsWith('index.html')) { res.end(readFileSync(file, 'utf8').replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, 'http://127.0.0.1:1')); return; }
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
  const out = [];
  for (const n of await caches.keys()) { const c = await caches.open(n); out.push(...(await c.keys()).map(r => r.url)); }
  return out;
});
ok('the book itself is in the cache', cached.some(u => /index\.html$|\/$/.test(u)), true);
ok('and so is the typeface it draws with', cached.filter(u => /\.woff2$/.test(u)).length >= 2, true);
ok('nothing cross-origin is needed at all', await p.evaluate(
  () => [...document.querySelectorAll('link[href],script[src],img[src]')]
    .map(e => e.href || e.src).filter(u => u && !u.startsWith(location.origin)
      && !u.startsWith('data:')).length), 0);

console.log('\nthe pictures live outside the page');
ok('the page is the words and the code, not seven megabytes of pictures', statSync('docs/app/index.html').size < 3.5e6, true);
const pics = await p.evaluate(() => Object.values(window.UI_IMAGES || {}));
ok('every big picture is a file beside it, named with its own fingerprint', [pics.filter(u => /^img\/[a-z_0-9]+-[0-9a-f]{8}\.webp$/.test(u)).length > 60, pics.filter(u => u.startsWith('data:')).length < 40], [true, true]);
ok('and the one on the cover is really there', await p.evaluate(async () => (await fetch((window.UI_IMAGES || {}).hero)).status), 200);
ok('the crest stayed in the page: it is the first thing on screen', (await p.evaluate(() => (window.UI_IMAGES || {}).crest || '')).startsWith('data:'), true);

/* A phone that read the book once can write into it with no signal at all:
   the post shows at once, says it is waiting, and sits in the outbox. */
console.log('\na post with no signal');
await p.evaluate(() => {
  const T = window.__T;
  const book = { ...T, config: { ...T.config, people: [{ id: 'g6', display: 'Ray V', role: 'golfer', band: 20, location: 'UK', group: '7-day', order: 0 }], pairs: [] } };
  localStorage.setItem('union-invitational:v3', JSON.stringify(book));
  localStorage.setItem('union-invitational:v3:at', String(Date.now() - 30 * 60e3));
  localStorage.setItem('union-invitational:whoami', 'g6');
  localStorage.removeItem('ui.outbox.v1');
});
await p.reload({ waitUntil: 'commit' }).catch(() => {}); await settled(); await shut();
ok('the book on the phone opens, and says what it is', /^No signal yet\. This is the book as the phone last read it, .*ago\. Scores, posts and bets you enter are kept here/.test((await p.locator('.loadbar.off').innerText()).replace(/\s+/g, ' ')), true);
await p.evaluate(() => { window.__UI.modal = { kind: 'chat' }; window.__forceRender(); }); await p.waitForTimeout(400);
ok('the composer says a post will wait', (await p.locator('.ch-off').innerText()).slice(0, 18), '⏱ No signal here. ');
await p.locator('#chatText').fill('Anyone seen my 7 iron?');
await p.locator('[data-act="chatSend"]').click(); await p.waitForTimeout(300);
ok('the post is on the screen at once', await p.locator('.ch-msg p').first().innerText(), 'Anyone seen my 7 iron?');
const t0 = Date.now();
/* the box keeps the keyboard up for the next line, and the screen is not
   redrawn under a focused box; tapping away lets it catch up */
await p.locator('#chatText').blur();
await p.waitForSelector('.ch-msg .ch-wait', { timeout: 30000 }).catch(() => {});
ok('and marked as waiting once the wire has given up on it — within the time a hung request is allowed', [await p.locator('.ch-msg .ch-wait').count(), Date.now() - t0 < 25000], [1, true]);
ok('and in the outbox for the next signal', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ui.outbox.v1') || '{}')).map(k => k.split('/')[0]).filter(k => k !== 'diag')), ['chat']);
ok('the foot counts it', await p.evaluate(() => [document.querySelector('.statusbar .dot').className, document.querySelector('.statusbar .st').textContent.slice(0, 30)]), ['dot wait', 'One change waiting for signal ']);
await shut();

console.log('\nand then the signal goes');
offline = true;
const before = served;
await p.reload({ waitUntil: 'commit' }).catch(() => {});
await settled();
ok('the server really was unreachable', served, before);
ok('the book opened anyway', await p.locator('.masthead h1').innerText(), 'The Union Invitational');
/* Four tabs on the bar, and the rest behind Manage. */
ok('with its six tabs', await p.locator('.tab').count(), 6);
/* Two in the tree — the nameplate's and the one on the strip that takes over
   when the nameplate has scrolled away — and never two on the glass. */
ok('and the door to everything set once', await p.locator('.masthead [data-act="manageOpen"]').count(), 1);
await shut();
await goTab(p, 'Score Entry'); await p.waitForTimeout(600); await shut();
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
