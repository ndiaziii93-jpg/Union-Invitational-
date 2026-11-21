/* WATCHING A ROUND THAT IS HAPPENING.
 *
 * The board already marked who was in play and how far through. What it
 * could not do was tell you anybody was out without you going and reading a
 * leaderboard, or show you the round itself — which holes, what they made.
 *
 * For a group across eight time zones that is the whole feature, so what is
 * pinned here is the ordering (still out before posted, furthest through
 * first), that a round still going reads as still going, and that watching
 * somebody is read-only.
 *
 * Run: node tools/watch-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/watch', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
writeFileSync(S + '/watch/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/watch/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR ' + e.message); bad++; });
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);

/* three golfers: two out, one posted an hour ago */
const seeded = await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C, E = window.__E;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }], packages: [] };
  const gs = Cl.golfers(T).slice(0, 3);
  const lkw = Cl.courseLibrary(T).find(x => /lakewood/i.test(x.name) && x.tee === 'White');
  const lh = Cl.courseLibrary(T).find(x => x.id === 'leatherhead') || lkw;
  const mk = (pid, course, n, done) => {
    const c = Cl.blankClubCard('frostbite', pid, 12, Cl.courseFrom(course, pid), '2027-11-15');
    for (let i = 0; i < n; i++) c.raw[i] = c.course.holes[i].par + (i % 3 === 0 ? 0 : 1);
    c.startedAt = Date.now() - 3 * 3600e3; c.at = Date.now() - 6 * 60e3;
    if (done) { c.done = true; c.postedAt = Date.now() - 3600e3; }
    T.club['card__frostbite__' + pid] = c;
  };
  mk(gs[0].id, lh, 11, false);          /* furthest through, still out */
  mk(gs[1].id, lh, 7, false);           /* also out */
  mk(gs[2].id, lkw, 18, true);          /* posted an hour ago */
  UI.who = gs[0].id; UI.me = gs[0].id; UI.screen = 'season'; UI.seasonTab = 'stop'; UI.stopId = 'frostbite'; UI.modal = null;
  window.__forceRender();
  return gs.map(g => g.id);
}, [iso(-1), iso(5)]);
await p.waitForTimeout(700);

console.log('\n1. the panel asks the question');
ok('it is on the stop screen', await p.evaluate(() => !!document.querySelector('.outpanel')), true);
ok('it counts who is actually out', await p.evaluate(() => { const e = document.querySelector('.outpanel .out-h span'); return e ? e.textContent.trim() : null; }), '2 playing');
const rows = await p.evaluate(() => [...document.querySelectorAll('.out-row')].map(r => ({
  who: r.querySelector('.out-who b').textContent.trim(),
  sub: r.querySelector('.out-who span').textContent.trim(),
  sc: r.querySelector('.out-sc span').textContent.trim(),
  btn: r.querySelector('.out-go').textContent.trim(), done: r.classList.contains('done') })));
ok('three rows', rows.length, 3);
ok('still out first, furthest through at the top', rows.map(r => r.sc), ['pts · thru 11', 'pts · thru 7', 'pts · F']);
ok('and the posted one is last', rows.map(r => r.done), [false, false, true]);
ok('the ones still out say when they teed off', /teed off \d\d:\d\d/.test(rows[0].sub), true);
ok('the posted one says when it landed', /posted .*ago/.test(rows[2].sub), true);
ok('out offers Watch, posted offers Card', rows.map(r => r.btn), ['Watch', 'Watch', 'Card']);

console.log('\n2. watching shows the round itself, hole by hole');
await p.evaluate(() => document.querySelector('.out-row .out-go').click());
await p.waitForTimeout(500);
ok('the card opens', await p.evaluate(() => !!document.querySelector('.watchmodal')), true);
ok('all eighteen holes are drawn', await p.evaluate(() => document.querySelectorAll('.watchmodal .w-h').length), 18);
ok('eleven of them have a score', await p.evaluate(() => 18 - document.querySelectorAll('.watchmodal .w-h.none').length), 11);
ok('and the seven still to come are plainly not played', await p.evaluate(() => document.querySelectorAll('.watchmodal .w-h.none').length), 7);
ok('it says the round is still going', await p.evaluate(() => [...document.querySelectorAll('.watchmodal .w-note')].some(n => /still going/.test(n.textContent))), true);
ok('there is nothing to tap that writes', await p.evaluate(() => [...document.querySelectorAll('.watchmodal [data-act]')].map(e => e.dataset.act).filter(a => a !== 'modalCancel' && a !== 'modalScrim')), []);
await p.screenshot({ path: S + '/watch/card.png' });

console.log('\n3. a posted card reads as posted');
await p.evaluate(() => { window.__UI.modal = null; window.__forceRender(); }); await p.waitForTimeout(300);
await p.evaluate(() => document.querySelectorAll('.out-row .out-go')[2].click()); await p.waitForTimeout(500);
ok('eighteen scored', await p.evaluate(() => document.querySelectorAll('.watchmodal .w-h.none').length), 0);
ok('and it says so', await p.evaluate(() => [...document.querySelectorAll('.watchmodal .w-note')].some(n => /posted/.test(n.textContent))), true);

console.log('\n4. the panel is only for a stop that is open');
await p.evaluate(() => { const T = window.__T; T.club.season.stops[0].from = '2020-01-01'; T.club.season.stops[0].to = '2020-01-05'; window.__UI.modal = null; window.__forceRender(); });
await p.waitForTimeout(500);
ok('a closed stop does not ask who is out', await p.evaluate(() => !!document.querySelector('.outpanel')), false);
await p.evaluate(() => { const T = window.__T; T.club.season.stops[0].from = new Date(Date.now() - 86400e3).toISOString().slice(0, 10); T.club.season.stops[0].to = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10); window.__forceRender(); });
await p.waitForTimeout(400);
ok('an open one does', await p.evaluate(() => !!document.querySelector('.outpanel')), true);
await p.screenshot({ path: S + '/watch/panel.png' });
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
