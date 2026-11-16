/* THE GLASS ON THE SCORE SCREEN MUST KEEP ITS SHAPE ON EVERY SCREEN.
   A hole is long and thin. Let the frame run the full width of an iPad and
   the hole is a sliver in a sea of sky with its ends cropped, so the frame is
   capped and centred and stays roughly upright everywhere. */
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
    return { w: Math.round(r.width), h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(2),
      centred: Math.abs((br.left - left) - (right - br.right)) < 4,
      canvas: document.querySelectorAll('#h3dInline canvas').length };
  });
  console.log('--- ' + name + ' (' + w + 'x' + h + ') ---');
  ok(name + ': the glass is there', m && m.canvas, 1);
  ok('it stays upright rather than a letterbox', m.ratio <= 1.45, true);
  ok('and never wider than it needs', m.w <= 560, true);
  ok('sitting in the middle of the page', m.centred, true);
  await p.screenshot({ path: S + '/fit/' + name.replace(' ', '-') + '.png' });
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
