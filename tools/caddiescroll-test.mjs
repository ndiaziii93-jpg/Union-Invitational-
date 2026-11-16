/* UNION BERT MUST NOT VANISH WHERE THERE IS ROOM FOR HIM.
   He ducks out of sight while a page scrolls, which earns its keep on a
   phone: the page runs under him there because there is nowhere else for it
   to go. A tablet and a laptop keep a column clear that is his alone, so
   ducking there only made the character disappear on the screens with the
   most room to show him. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/cs', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

writeFileSync(S + '/cs/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/cs/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [name, w, h, phone] of [['phone', 390, 844, true], ['iPad', 834, 1112, false], ['laptop', 1280, 900, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(2300);
  await p.evaluate(([from, to]) => {
    const T = window.__T, UI = window.__UI, Cl = window.__C;
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }], packages: [] };
    UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
  }, [iso(-3), iso(10)]);
  await p.waitForTimeout(700);
  const before = await p.evaluate(() => {
    const c = document.querySelector('.caddie');
    return c ? +getComputedStyle(c).opacity : null;
  });
  /* scroll, and look WHILE it is still moving — the duck is a half-second */
  await p.evaluate(() => window.scrollBy(0, 320));
  await p.waitForTimeout(90);
  const during = await p.evaluate(() => {
    const c = document.querySelector('.caddie');
    return c ? { ducked: c.classList.contains('duck'), op: +getComputedStyle(c).opacity } : null;
  });
  console.log('--- ' + name + ' ---');
  ok(name + ': he is there to begin with', before !== null && before > 0.9, true);
  if (phone) {
    ok('on a phone he still gets out of the way as it moves', during.ducked, true);
  } else {
    ok('on a ' + name + ' he stays put while the page moves', during.ducked, false);
    ok('and stays visible with it', during.op > 0.9, true);
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
