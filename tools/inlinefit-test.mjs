/* THE WHOLE HOLE, ON EVERY SCREEN.
   A hole seen from behind the tee stands up in the frame, so the glass is
   upright, capped and centred rather than running the width of an iPad. And
   the picture inside it has to hold the hole: the camera measures its own
   fit, and this checks the measurement, by asking the live camera how far
   outside the glass the corridor from tee to green runs. One or less is all
   of it in view. A laptop used to crop the tee clean off. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/fit', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/fit/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/fit/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const act = p => (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);

for (const [name, w, h] of [['phone', 390, 844], ['iPad', 1024, 1366], ['iPad land', 1366, 1024], ['laptop', 1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const go = act(p);
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
  await p.waitForTimeout(1900);
  const m = await p.evaluate(() => {
    const el = document.querySelector('#h3dInline');
    const box = document.querySelector('.h3in');
    if (!el || !box) return null;
    const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
    /* Centred in the CONTENT box, not the border box: above a phone's width
       the page keeps a column clear down the right for Union Bert, and a
       thing centred in the space left over is correctly off-centre against
       the whole. */
    const wrap = document.querySelector('.wrap');
    const page = wrap.getBoundingClientRect();
    const cs = getComputedStyle(wrap);
    const left = page.left + parseFloat(cs.paddingLeft || 0);
    const right = page.right - parseFloat(cs.paddingRight || 0);
    const ctl = window.__UI.h3in && window.__UI.h3in.ctl;
    return { w: Math.round(r.width), h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(2),
      extent: ctl && ctl.extent ? +ctl.extent().toFixed(3) : null,
      zoom: ctl ? +ctl.state.zoom.toFixed(2) : null,
      centred: Math.abs((br.left - left) - (right - br.right)) < 4,
      canvas: document.querySelectorAll('#h3dInline canvas').length };
  });
  console.log('--- ' + name + ' (' + w + 'x' + h + ') ---');
  ok(name + ': the glass is there', m && m.canvas, 1);
  ok('it stands upright rather than a letterbox', m.ratio <= 1.05, true);
  ok('and never wider than it needs', m.w <= 420, true);
  ok('sitting in the middle of the page', m.centred, true);
  console.log('      hole runs to ' + m.extent + ' of a half-screen, at zoom ' + m.zoom + ', glass ' + m.w + 'x' + m.h);
  ok('the WHOLE hole is on the glass', m.extent != null && m.extent <= 1, true);
  await p.screenshot({ path: S + '/fit/' + name.replace(' ', '-') + '.png' });

  /* ONE HOLE FITTING IS NOT A COURSE FITTING. The first is a par five that
     runs straight; the fit has to hold for the dogleg, the short par three
     and the long one too, or somebody finds the broken one by playing it. */
  if (name === 'phone') {
    const worst = [];
    for (let h = 1; h < 18; h++) {
      await go('clubHole', { a: String(h) });
      await p.waitForTimeout(1100);
      const e = await p.evaluate(() => { const c = window.__UI.h3in && window.__UI.h3in.ctl;
        return c && c.extent ? +c.extent().toFixed(3) : null; });
      if (e == null || e > 1) worst.push((h + 1) + ':' + e);
    }
    ok('every hole on the course fits its glass', worst, []);
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
