/* Every hole of a course, drawn small, so the turf can be judged as a set
   rather than one hole at a time. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const tag = process.argv[2] || 'now';
mkdirSync(S + '/sheet', { recursive: true });
writeFileSync(S + '/sheet/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/sheet/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 1 });
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
for (let h = 0; h < 18; h++) {
  await p.evaluate(h => { window.__UI.modal = { kind: 'art', rid: null, hole: h, ckey: 'home__g1' }; window.__forceRender(); }, h);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + '/sheet/' + tag + '-' + String(h + 1).padStart(2, '0') + '.png' });
}
console.log('eighteen shot: ' + tag);
await ctx.close(); await b.close(); srv.close();
