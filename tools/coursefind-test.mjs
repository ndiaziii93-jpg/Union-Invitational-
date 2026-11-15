/* FINDING A COURSE IN THE WIDER LIST.
 *
 * The book searches two places at once: the courses members have already
 * entered, which need no network, and a database of some thirty thousand
 * reached through the `courses` edge function. This drives the second one with
 * a stub standing in for the function, because the real one needs a paid key.
 *
 * The stub answers in the shape supabase/functions/courses/index.ts is written
 * to produce, which is itself mapped from GolfCourseAPI's published schema
 * (TeeBox.holes[] = {par, yardage, meters, handicap}). So this proves the
 * BOOK's half: that a far hit is offered, that tapping it offers its tee sets,
 * that taking one fills the card, that a card with no stroke index is offered
 * but refused a save, and that losing the network leaves the near book working.
 * It does not prove the function talks to the API correctly — only a key can.
 *
 * Run: node tools/coursefind-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* A whole card, and a card with the index missing — both shapes the real list
   really returns, because course data at that scale is uneven. */
const whole = (y0) => Array.from({ length: 18 }, (_, i) => ({
  par: [4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4][i],
  si: [5, 17, 1, 11, 7, 3, 15, 9, 13, 6, 2, 18, 12, 8, 4, 10, 16, 14][i],
  y: y0 + i,
}));
const noIndex = whole(300).map(h => ({ ...h, si: null }));

mkdirSync(S + '/cfsite', { recursive: true });
writeFileSync(S + '/cfsite/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

let mode = 'ok';                        // 'ok' | 'down' | 'unconfigured'
let calls = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/functions/v1/courses') {
    calls.push(u.search);
    const head = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (mode === 'down') { res.destroy(); return; }
    if (mode === 'unconfigured') { res.writeHead(200, head); res.end(JSON.stringify({ unconfigured: true, courses: [] })); return; }
    if (u.searchParams.get('id')) {
      res.writeHead(200, head);
      res.end(JSON.stringify({ course: { id: 'abc12345', name: 'Royal Tarpon — Old Course', place: 'Tarpon, Florida, United States', cards: [
        { tee: 'Blue', who: 'male', par: 72, yards: 6720, rating: 72.4, slope: 133, holes: whole(380), ok: true, why: '' },
        { tee: 'White', who: 'male', par: 72, yards: 6210, rating: 70.1, slope: 128, holes: whole(340), ok: true, why: '' },
        { tee: 'Red', who: 'female', par: 72, yards: 5400, rating: null, slope: null, holes: noIndex, ok: false, why: 'no stroke index on this card' },
      ] } }));
      return;
    }
    res.writeHead(200, head);
    res.end(JSON.stringify({ courses: [
      { id: 'abc12345', name: 'Royal Tarpon — Old Course', place: 'Tarpon, Florida, United States', tees: 5 },
      { id: 'def67890', name: 'Tarpon Springs Municipal', place: 'Tarpon Springs, Florida, United States', tees: 3 },
    ] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(readFileSync(S + '/cfsite/index.html'));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const type = async v => {
  await p.evaluate(v => {
    const el = document.getElementById('courseQ');
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await p.waitForTimeout(700);                 // past the debounce
};

await p.goto(BASE); await p.waitForTimeout(2500);
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ahead = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await p.evaluate(([A, H, base]) => {
  const T = window.__T, UI = window.__UI;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from: A, to: H, format: 'stableford', note: 'x' }] };
  UI.who = 'g1'; UI.modal = null;
  /* point the book's function calls at this test server. A Supabase address
     and a publishable key are exactly what turns the wider search on. */
  window.__CFG.SUPABASE_URL = base.replace(/\/$/, '');
  window.__CFG.SUPABASE_KEY = 'sb_publishable_test';
  window.__forceRender();
}, [ago(3), ahead(10), BASE]);
await p.waitForTimeout(300);
/* A round is declared before it is played, so the way in to the stop now
   asks what kind this is; the course form is behind that answer. */
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(400);
ok('it asks what kind of round first', await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind), 'newround');
await act('roundGo', { a: 'comp' }); await p.waitForTimeout(400);
ok('the course form is up', await p.locator('#courseQ').count(), 1);

console.log('\nthe wider list');
await type('tarpon');
const far = await p.evaluate(() => [...document.querySelectorAll('.cfhits.far .cfhit')].map(e => e.querySelector('b').textContent));
ok('a course nobody here has played is still found', far, ['Royal Tarpon — Old Course', 'Tarpon Springs Municipal']);
ok('and it asked the function once, with the typed name', calls.length >= 1 && /q=tarpon/.test(calls[calls.length - 1]), true);

await p.locator('.cfhits.far .cfhit').first().dispatchEvent('click');
await p.waitForTimeout(600);
const tees = await p.evaluate(() => [...document.querySelectorAll('.cftee')].map(e => [e.querySelector('b').textContent, e.className.includes('iffy')]));
ok('tapping it offers every tee set, the broken one marked', tees, [['Blue', false], ['White', false], ['Red', true]]);

await p.locator('.cftee').nth(1).dispatchEvent('click');
await p.waitForTimeout(400);
const filled = await p.evaluate(() => {
  const c = window.__UI.courseDraft, C = window.__C;
  return [c.name, c.tee, C.coursePar(c), c.holes[0].y, c.holes[2].si, C.courseOk(c),
    document.querySelector('[data-act="courseSave"]').disabled];
});
ok('taking a tee fills the whole card, and Save comes alive', filled,
  ['Royal Tarpon — Old Course', 'White', 72, 340, 1, true, false]);

console.log('\na card the list has only half of');
await act('courseEdit'); await p.waitForTimeout(300);
await type('tarpon');
await p.locator('.cfhits.far .cfhit').first().dispatchEvent('click'); await p.waitForTimeout(600);
await p.locator('.cftee').nth(2).dispatchEvent('click'); await p.waitForTimeout(400);
const half = await p.evaluate(() => {
  const c = window.__UI.courseDraft, C = window.__C;
  return [c.tee, c.holes[0].y, c.holes[0].si, C.courseOk(c),
    document.querySelector('[data-act="courseSave"]').disabled, String(window.__UI.toast || '').includes('stroke index')];
});
/* The yardages are worth having; the index is not guessed, and the book will
   not let a card without one be saved, because the index decides the shots. */
ok('the yardages come through, the index does not, and Save stays shut', half,
  ['Red', 300, null, false, true, true]);

console.log('\nwhen the wider list is not there');
await act('courseEdit'); await p.waitForTimeout(300);
mode = 'down';
await type('tarpon');
const down = await p.evaluate(() => [document.querySelectorAll('.cfhits.far .cfhit').length,
  !!document.getElementById('courseQ'), document.querySelectorAll('.ctbl.course input').length]);
ok('no signal: no far hits, and the card can still be typed in by hand', down, [0, true, 54]);

mode = 'unconfigured';
await act('courseEdit'); await p.waitForTimeout(300);
await type('leather');
const unconf = await p.evaluate(() => [document.querySelectorAll('.cfhits.far .cfhit').length,
  [...document.querySelectorAll('.cfhits:not(.far) .cfhit b')].map(e => e.textContent)]);
ok('no key set: the book here still answers for Leatherhead', unconf,
  [0, ['Leatherhead Golf Club', 'Leatherhead Golf Club', 'Leatherhead Golf Club']]);

ok('no page errors', errs, []);
await b.close(); server.close();
console.log('\n' + (fails.length ? fails.length + ' FAILED: ' + fails.join(' | ') : '0 fails'));
process.exit(fails.length ? 1 : 0);
