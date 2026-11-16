/* A RING NEEDS ROOM INSIDE IT.
   A .prow is a row in a list, divided from the next by a rule, so it carries
   no padding down its sides. That is right for a rule and wrong for a box —
   and when the row you are about to score takes a gold ring, the name and
   the handicap line under it sat hard against it. Pulling the ring all the
   way out to the column's edge only moves the fault one step further out,
   onto the edge of the phone. So: real room inside the ring, and daylight
   between the ring and the screen.
   Run: node tools/prowring-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/prow', { recursive: true });
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/prow/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/prow/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [tag, w, h] of [['phone', 390, 844], ['small phone', 360, 780], ['iPad', 1024, 1366], ['laptop', 1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
  await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);
  await p.evaluate(([from, to]) => {
    const T = window.__T, UI = window.__UI, Cl = window.__C;
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }], packages: [] };
    const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
    T.club.course__g1 = { ...Cl.courseFrom(hit, 'g1'), approved: true };
    UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
  }, [iso(-3), iso(10)]);
  await p.waitForTimeout(400);
  await go('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(350);
  if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) { await go('roundGo', { a: 'comp' }); await p.waitForTimeout(600); }
  await p.waitForTimeout(1400);

  const m = await p.evaluate(() => {
    const row = document.querySelector('.prow.nextup'); if (!row) return null;
    const r = row.getBoundingClientRect();
    const nm = row.querySelector('.nm').getBoundingClientRect();
    const bd = row.querySelector('.bd').getBoundingClientRect();
    const tile = row.querySelector('.ptile');
    return {
      left: Math.round(Math.min(nm.left, bd.left) - r.left),
      top: Math.round(nm.top - r.top),
      bottom: Math.round(r.bottom - bd.bottom),
      right: tile ? Math.round(r.right - tile.getBoundingClientRect().right) : 99,
      offScreenL: Math.round(r.left), offScreenR: Math.round(window.innerWidth - r.right),
    };
  });
  console.log('--- ' + tag + ' (' + w + 'x' + h + ') ---');
  ok(tag + ': the ringed row is there', !!m, true);
  if (!m) { await ctx.close(); continue; }
  ok('the name clears the ring down the left', m.left >= 12, true);
  ok('the handicap clears it underneath', m.bottom >= 12, true);
  ok('and there is room above the name', m.top >= 12, true);
  ok('the score tile clears it on the right', m.right >= 12, true);
  ok('while the ring itself clears the screen', Math.min(m.offScreenL, m.offScreenR) >= 6, true);
  console.log('      inside ' + m.left + '/' + m.top + '/' + m.right + '/' + m.bottom + ', outside ' + m.offScreenL + ' and ' + m.offScreenR);
  await ctx.close();
}
await b.close(); srv.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
