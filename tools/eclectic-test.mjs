/* THE ECLECTIC: your best ever on every hole, as one card nobody has shot.
 *
 * The arithmetic is the easy part. What is easy to get wrong is the honesty
 * of it: a hole never played must read as never played rather than as a
 * zero, a partial card must be scored against the holes it HAS, and one
 * round is not an eclectic — it is just that round.
 *
 * Run: node tools/eclectic-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as C from '../src/club.js';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/ecl', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

const PAR = [4, 4, 3, 4, 3, 4, 5, 4, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5];
const course = { name: 'Lakewood Country Club', tee: 'White', holes: PAR.map((par, i) => ({ par, si: i + 1 })) };
const mk = (raw, date, stop) => ({ kind: 'comp', pid: 'g1', stop, date, raw, hcp: 12, course, done: true });

console.log('\n1. the arithmetic');
const T = { club: {
  card__a__g1: mk([5, 4, 3, 5, 4, 6, 6, 5, 6, 5, 5, 4, 5, 6, 5, 5, 4, 6], '2027-01-05', 'a'),
  card__b__g1: mk([4, 5, 4, 4, 3, 5, 7, 4, 5, 6, 4, 3, 4, 5, 6, 4, 3, 7], '2027-02-05', 'b'),
  hcard__g1__x: { kind: 'hcp', pid: 'g1', rid: 'x', date: '2027-03-05', raw: [6, 4, 3, 4, 4, 5, 3, 6, 5, 4, 4, 4, 6, 5, 4, 6, 4, 5], hcp: 12, course, done: true },
} };
const e = C.eclecticOf(T, 'g1', 'Lakewood Country Club');
ok('the best of each hole, from whichever round it came', e.best,
  [4, 4, 3, 4, 3, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5]);
ok('eighteen holes in it', e.got, 18);
ok('it adds up', e.total, e.best.reduce((a, b) => a + b, 0));
ok('against the full par', e.par, 72);
ok('the 7th is the one to talk about: a 3 on a par 5', [e.best[6], PAR[6]], [3, 5]);
ok('counted as an eagle', e.eagles, 1);
ok('and no round shot it', [66, 68, 72].every(() => true) && Math.min(
  ...Object.values(T.club).map(c => c.raw.reduce((a, b) => a + b, 0))) > e.total, true);
ok('it knows it came from three rounds', e.rounds, 3);
ok('stop cards and handicap rounds both count', e.from[6].kind, 'hcp');

console.log('\n2. a hole never played is never played, not a zero');
const T2 = { club: { card__a__g1: mk([4, null, 3, ...Array(15).fill(null)], '2027-01-05', 'a'),
                     card__b__g1: mk([5, null, 4, ...Array(15).fill(null)], '2027-02-05', 'b') } };
const e2 = C.eclecticOf(T2, 'g1', 'Lakewood Country Club');
ok('only the holes with a score on them', e2.got, 2);
ok('the best of each', [e2.best[0], e2.best[2]], [4, 3]);
ok('the rest are null, not nought', e2.best[1], null);
ok('and it is scored against the holes it has', [e2.total, e2.par], [7, 7]);
ok('while still knowing the full par', e2.fullPar, 72);
ok('level, not twelve under', e2.toPar, 0);

console.log('\n3. one round is not an eclectic');
const T3 = { club: { card__a__g1: mk(PAR.slice(), '2027-01-05', 'a') } };
ok('it is not offered', C.eclecticCourses(T3, 'g1'), []);
ok('two at the same course is', C.eclecticCourses(T, 'g1'), [{ name: 'Lakewood Country Club', rounds: 3 }]);
ok('and somebody else’s rounds are not yours', C.eclecticCourses(T, 'g2'), []);

console.log('\n4. it opens, on a phone');
writeFileSync(S + '/ecl/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/ecl/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', ev => { console.log('  PAGE ERROR ' + ev.message); bad++; });
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);
await p.evaluate(cards => {
  const T = window.__T, UI = window.__UI;
  Object.assign(T.club, cards);
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = { kind: 'eclectic', course: 'Lakewood Country Club' };
  window.__forceRender();
}, T.club);
await p.waitForTimeout(600);
ok('the card is on the screen', await p.evaluate(() => document.querySelectorAll('.ecmodal .ec-h').length), 18);
ok('the eagle hole is marked', await p.evaluate(() => !!document.querySelector('.ecmodal .ec-h.eagle')), true);
ok('and the total is shown', await p.evaluate(() => { const t = document.querySelector('.ecmodal .ec-sum b'); return t ? t.textContent.trim() : null; }), String(e.total));
ok('no sideways scroll on a phone', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
await p.screenshot({ path: S + '/ecl/card.png' });
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
