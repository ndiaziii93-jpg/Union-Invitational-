/* THE CADDIE STANDS STILL.
 *
 * He used to step aside and duck. On a phone there is no gutter to step
 * into, so "aside" put most of him off the right edge, shrunk and tilted —
 * and that was his NORMAL state, not a passing one. He also faded out on
 * every scroll. Both are gone.
 *
 * What this pins: he is fully on screen, square to the page, and a scroll
 * does not move or fade him.
 *
 * Run: node tools/caddie-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/cad', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/cad/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/cad/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [name, w, h] of [['iPhone', 390, 844], ['small phone', 360, 780], ['iPad', 1024, 1366]]) {
  console.log('\n' + name);
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR ' + e.message); bad++; });
  await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);
  await p.evaluate(() => {
    const T = window.__T, UI = window.__UI;
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'mulligan', name: 'The Merry Mulligan Open', from: '2026-11-14', to: '2026-12-31', format: 'stableford', note: '' }], packages: [] };
    UI.screen = 'you'; UI.modal = null; window.__forceRender();
  });
  await p.waitForTimeout(900);
  const box = () => p.evaluate(() => { const e = document.querySelector('.caddie'); if (!e) return null;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e), inr = document.querySelector('.cadin');
    const ci = inr ? getComputedStyle(inr) : null;
    return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width),
      vw: window.innerWidth, opacity: +cs.opacity,
      innerTranslate: ci ? ci.translate : null, innerRotate: ci ? ci.rotate : null,
      classes: e.className }; });
  const a = await box();
  ok('he is on the page', !!a, true);
  if (!a) { await p.close(); continue; }
  ok('fully on screen, nothing off the left', a.x >= 0, true);
  ok('and nothing off the right', a.right <= a.vw + 1, true);
  ok('he is at full opacity', a.opacity, 1);
  ok('square to the page, not tilted', [a.innerRotate, a.innerTranslate].every(v => v === 'none' || v === '' || v == null), true);
  ok('no peek or duck class on him', /peek|duck/.test(a.classes), false);

  /* the whole complaint: scrolling made him disappear */
  await p.evaluate(() => window.scrollTo(0, 400));
  await p.waitForTimeout(120);
  const mid = await box();
  ok('still there mid-scroll', [mid.opacity, mid.w], [a.opacity, a.w]);
  await p.waitForTimeout(900);
  const after = await box();
  ok('and in the same place when it stops', [after.x, after.right, after.opacity], [a.x, a.right, a.opacity]);
  if (name === 'iPhone') await p.screenshot({ path: S + '/cad/iphone.png' });
  await p.close();
}
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
