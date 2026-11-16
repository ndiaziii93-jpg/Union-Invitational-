import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const tag = process.argv[2] || 'now';
mkdirSync(S + '/turf', { recursive: true });
writeFileSync(S + '/turf/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/turf/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2400);
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
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(350);
if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) { await act('roundGo', { a: 'comp' }); await p.waitForTimeout(600); }
await p.waitForTimeout(2200);
console.log('inline canvas :', await p.locator('#h3dInline canvas').count());
console.log('shot bar      :', await p.locator('.h3in .h3shotbar').count());
console.log('full screen   :', await p.locator('.h3big').count());
await p.screenshot({ path: S + '/turf/' + tag + '-entry.png' });
/* a tap on the small glass must write a shot */
const box = await p.locator('#h3dInline .h3live').boundingBox();
await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); await p.waitForTimeout(500);
console.log('after a tap   :', await p.evaluate(() => JSON.stringify((window.__T.club.card__frostbite__g1 || {}).shots || null)));
await p.screenshot({ path: S + '/turf/' + tag + '-entry2.png' });
console.log(await p.evaluate(() => {
  const box = document.querySelector('.h3in'), bar = document.querySelector('.h3in .h3shotbar');
  const r = box.getBoundingClientRect(), br = bar ? bar.getBoundingClientRect() : null;
  const foot = bar ? bar.querySelector('.h3sb-foot') : null;
  return { boxH: Math.round(r.height), barPos: bar ? getComputedStyle(bar).position : 'none',
    barH: br ? Math.round(br.height) : 0, barBottom: br ? Math.round(br.bottom) : 0,
    boxBottom: Math.round(r.bottom), footH: foot ? Math.round(foot.getBoundingClientRect().height) : 0,
    clipped: br ? (br.bottom > r.bottom + 1) : false };
}));
console.log('shot ' + tag);
await ctx.close(); await b.close(); srv.close();
