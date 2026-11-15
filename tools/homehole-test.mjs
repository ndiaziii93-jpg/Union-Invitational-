/* THE HOLE ON YOUR OWN COURSE. A home course has a card but no drawing, so
   the hole window models the ground from par and length and says so on the
   glass. This stands on the 1st at Leatherhead off the whites, at both
   widths, and walks to the next hole.
   Run: node tools/homehole-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

console.log('the library, as functions');
const C = await import('../src/club.js');
const T0 = { config: {}, club: {} };
const hits = C.courseFind(T0, 'leatherhead');
ok('one course, three tee cards: par and index of its own on each',
  hits.map(h => [h.tee, C.coursePar(h), h.holes[3].par, h.holes[3].si]),
  [['White', 71, 5, 14], ['Yellow', 70, 4, 14], ['Red', 69, 4, 1]]);
const mine = C.courseFrom(hits[0], 'g1');
const book = C.courseAsBook(mine);
ok('as the hole window reads it: a key, the holes numbered, the yards in metres too',
  [book.key, book.home, book.holes.length, book.holes[0].n, book.holes[0].y, book.holes[0].mY, book.holes[0].img],
  ['home__g1', true, 18, 1, 483, 442, null]);
ok('a card that is not 18 whole holes is no course at all', C.courseAsBook({ pid: 'g1', name: '', holes: [] }), null);
/* Yards are optional on a card typed in by hand. Without them the ground is
   built to a plausible length for the par, and the dock has no number to
   give \u2014 it must not read NaN or 0. */
const noYds = C.courseAsBook({ ...mine, holes: mine.holes.map(h => ({ ...h, y: null })) });
ok('a card with no yards still stands up, with nothing claimed about length',
  [noYds.holes[0].y, noYds.holes[0].mY, noYds.holes.length], [null, null, 18]);
/* A member who has already entered Leatherhead off the whites should not see
   their own card twice, but the yellows and reds are still theirs to take. */
T0.club['course__g1'] = { ...mine, approved: true };
ok('their own card wins its tee; the other two stay on offer',
  C.courseFind(T0, 'leatherhead').map(h => [h.from, h.tee]),
  [['book', 'White'], ['library', 'Yellow'], ['library', 'Red']]);

console.log('\nthe hole, in a browser');
mkdirSync(S + '/holesite', { recursive: true });
writeFileSync(S + '/holesite/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(S + '/holesite/index.html')); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

for (const [label, vp] of [['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['laptop', { width: 1280, height: 860 }]]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
  await p.goto(BASE); await p.waitForTimeout(2500);

  const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const ahead = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await p.evaluate(([A3, H10]) => {
    const T = window.__T, UI = window.__UI, C = window.__C;
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'frostbite', name: 'The Frostbite Open', from: A3, to: H10, format: 'stableford', note: 'x' }] };
    const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
    T.club['course__g1'] = { ...C.courseFrom(hit, 'g1'), approved: true };
    UI.who = 'g1'; UI.modal = null;
    window.__forceRender();
  }, [ago(3), ahead(10)]);
  await p.waitForTimeout(400);
  await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(400);
  ok(label + ': the Score Entry screen, on Leatherhead',
    await p.evaluate(() => [window.__UI.screen, (document.querySelector('.lede') || {}).textContent.slice(0, 34)]),
    ['clubentry', 'Leatherhead Golf Club · White tees']);

  const box = await p.locator('.ehd-art').boundingBox();
  ok(label + ': "See the hole" sits on the hole head and is tappable',
    [await p.locator('.ehd-art').count(), !!box && Math.round(box.width) >= 32, !!box && Math.round(box.height) >= 32],
    [1, true, true]);

  await p.locator('.ehd-art').dispatchEvent('click'); await p.waitForTimeout(900);
  const seen = await p.evaluate(() => {
    const m = window.__UI.modal || {};
    const win = document.querySelector('.h3dwin');
    return { ckey: m.ckey, rid: m.rid, hole: m.hole,
      title: win ? win.getAttribute('aria-label') : null,
      ground: document.querySelector('.h3mount canvas') ? '3D' : document.querySelector('.h3fallback.flat') ? 'card' : document.querySelector('.h3fallback') ? 'drawing' : 'nothing',
      note: ((document.querySelector('.h3note') || {}).textContent || '').trim(),
      dock: ((document.querySelector('.h3feel.still') || {}).textContent || '').trim() };
  });
  ok(label + ': the window opens on your own course, with no round behind it',
    [seen.ckey, seen.rid, seen.hole, seen.title], ['home__g1', null, 0, 'Hole 1 at Leatherhead Golf Club']);
  /* Leatherhead's club publishes a map of every hole, and tools/trace-lh.py has
     measured them, so this hole is the hole the club draws — and the glass
     says where that came from, and that it is still not a survey. */
  ok(label + ': the ground drew, and the glass is honest about where the shape came from',
    [seen.ground, seen.ground === '3D' ? seen.note : 'n/a'],
    ['3D', 'Traced from the club’s own hole map · not surveyed yet']);
  ok(label + ': the dock reads the 1st off your own tee, in yards', seen.dock, '483yds · white');

  await p.locator('.h3pill .ar').nth(1).dispatchEvent('click'); await p.waitForTimeout(600);
  ok(label + ': the arrows walk the course and the card follows',
    await p.evaluate(() => [window.__UI.modal.hole, (document.querySelector('.h3pill .n') || {}).textContent, ((document.querySelector('.h3feel.still') || {}).textContent || '').trim()]),
    [1, 'Hole 2', '176yds · white']);

  ok(label + ': no page errors', errs, []);
  await ctx.close();
}
await b.close(); server.close();
console.log('\n' + (fails.length ? fails.length + ' FAILED: ' + fails.join(' | ') : '0 fails'));
process.exit(fails.length ? 1 : 0);
