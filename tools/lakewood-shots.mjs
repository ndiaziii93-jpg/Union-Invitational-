/* LAKEWOOD, EIGHTEEN TIMES, SO SOMEBODY CAN LOOK AT IT.
 *
 * The shapes in TRACED_LKW were read by hand off the hole flyovers the
 * commissioner sent. Numbers in a file prove nothing about whether a hole
 * LOOKS like the hole, so this stands the camera behind each tee, lets the
 * window measure its own fit, and writes the picture out. Then a person can
 * compare it with the real thing.
 *
 * Run: node tools/lakewood-shots.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const OUT = S + '/lkwshots';
mkdirSync(OUT, { recursive: true });
writeFileSync(S + '/lkwshots/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/lkwshots/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('  PAGE ERROR ' + e.message));
await p.goto('http://127.0.0.1:' + srv.address().port + '/');
await p.waitForTimeout(2300);

const set = await p.evaluate(() => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  const hit = Cl.courseLibrary(T).find(x => /lakewood/i.test(x.name) && x.tee === 'White');
  if (!hit) return 'no Lakewood in the library';
  T.club.course__g1 = { ...Cl.courseFrom(hit, 'g1'), approved: true };
  UI.who = 'g1'; UI.me = 'g1';
  window.__forceRender();
  return T.club.course__g1.key + ' · ' + T.club.course__g1.holes.length + ' holes';
});
console.log('course: ' + set);

const rows = [];
for (let n = 1; n <= 18; n++) {
  await p.evaluate(h => {
    window.__UI.modal = { kind: 'art', rid: null, hole: h, ckey: 'home__g1' };
    window.__forceRender();
  }, n - 1);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const el = document.querySelector('#h3dMount');
    const note = document.querySelector('.h3note');
    const cv = el && el.querySelector('canvas');
    return { mounted: !!cv, w: cv ? cv.width : 0, h: cv ? cv.height : 0,
             note: note ? note.textContent.trim() : '', extent: window.__h3extent ? window.__h3extent() : null };
  });
  const el = await p.$('#h3dMount');
  if (el) await el.screenshot({ path: OUT + '/h' + String(n).padStart(2, '0') + '.png' });
  rows.push([n, info.mounted ? 'drawn' : 'EMPTY', info.note].join('  '));
  console.log('  hole ' + String(n).padStart(2) + '  ' + (info.mounted ? 'drawn ' + info.w + 'x' + info.h : 'EMPTY') + '   ' + info.note);
}
await b.close(); srv.close();
console.log('\nshots in ' + OUT);
