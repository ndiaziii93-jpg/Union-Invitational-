/* "PICK IT UP ON 2" MUST ACTUALLY PICK IT UP.
 *
 * It did nothing. The Clubhouse handler for resuming a handicap round was
 * labelled 'roundOpen', a name the Belek week's round sheet had already
 * taken 1500 lines earlier in the SAME switch — so the first case won and
 * the Clubhouse one was unreachable. Every route back into a half-played
 * handicap round was dead, not just this button.
 *
 * So this clicks the real button and checks you land on the round, on the
 * right hole.
 *
 * Run: node tools/resume-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/res', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/res/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/res/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR ' + e.message); bad++; });
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);

/* a handicap round at Leatherhead with one hole written, exactly the state
   in the screenshot that reported this */
await p.evaluate(() => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' }, stops: [], packages: [] };
  const g = C.golfers(T)[0];
  const lh = C.courseLibrary(T).find(x => x.id === 'leatherhead');
  const course = C.courseFrom(lh, g.id);
  T.club['course__' + g.id] = { ...course, approved: true };
  const rid = C.newRid('2026-11-21', () => 0.5);
  const card = C.blankHcpCard(g.id, rid, 18, course, '2026-11-21');
  card.raw[0] = course.holes[0].par;      /* one hole written */
  card.at = Date.now();
  T.club[C.hcardKey(g.id, rid)] = card;
  UI.who = g.id; UI.me = g.id; UI.screen = 'you'; UI.modal = null;
  window.__forceRender();
});
await p.waitForTimeout(700);

console.log('\n1. the panel is there, saying what the screenshot said');
ok('the resume panel renders', await p.evaluate(() => !!document.querySelector('.resume')), true);
const label = await p.evaluate(() => { const b = document.querySelector('.resume .rz-go'); return b ? b.textContent.trim() : null; });
ok('the button offers the next hole', label, 'Pick it up on 2');
ok('and it is a handicap round', await p.evaluate(() => /handicap round/i.test(document.querySelector('.resume .ct').textContent)), true);

console.log('\n2. clicking it goes somewhere');
const before = await p.evaluate(() => ({ screen: window.__UI.screen, rid: window.__UI.rid, hole: window.__UI.clubHole }));
await p.evaluate(() => document.querySelector('.resume .rz-go').click());
await p.waitForTimeout(800);
const after = await p.evaluate(() => ({ screen: window.__UI.screen, rid: window.__UI.rid, hole: window.__UI.clubHole, kind: window.__UI.roundKind, modal: window.__UI.modal && window.__UI.modal.kind }));
ok('it was on the You screen before', before.screen, 'you');
ok('it lands on the round', after.screen, 'clubentry');
ok('as a handicap round', after.kind, 'hcp');
ok('on the right card', typeof after.rid === 'string' && after.rid.length > 0, true);
ok('and on the 2nd, the first hole with no score', after.hole, 1);
ok('it did not open the Belek round sheet instead', after.modal || null, null);
ok('the keypad screen actually drew', await p.evaluate(() => !!document.querySelector('.holehead')), true);
await p.screenshot({ path: S + '/res/landed.png' });

await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
