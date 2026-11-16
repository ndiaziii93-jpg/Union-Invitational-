import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/sp', { recursive: true });
writeFileSync(S + '/sp/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/sp/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2400);
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
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
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(300);
if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) { await act('roundGo', { a: 'comp' }); await p.waitForTimeout(500); }
await act('holeArt', { a: '0', b: 'home__g1' }); await p.waitForTimeout(1900);
const tap = async (fx, fy, club) => {
  if (club) await p.evaluate(c => { const b = [...document.querySelectorAll('.h3club')].find(x => x.textContent === c); if (b) b.click(); }, club);
  await p.waitForTimeout(140);
  const box = await p.locator('.h3live').boundingBox();
  await p.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); await p.waitForTimeout(280);
};
await tap(0.50, 0.58, 'Dr');
await tap(0.56, 0.40, '5w');
await tap(0.50, 0.28, '9i');
await p.screenshot({ path: S + '/sp/glass.png' });
console.log('shots:', await p.evaluate(() => JSON.stringify(window.__T.club.card__frostbite__g1.shots)));
console.log('bar  :', await p.evaluate(() => (document.querySelector('.h3sb-foot span') || {}).textContent));
await ctx.close(); await b.close(); srv.close();
