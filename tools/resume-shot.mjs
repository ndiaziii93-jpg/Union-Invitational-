import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/rs', { recursive: true });
writeFileSync(S + '/rs/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/rs/x.html')); });
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
  /* a round left open at the turn */
  const card = Cl.blankClubCard('frostbite', 'g1', 20, T.club.course__g1, new Date().toISOString().slice(0, 10));
  for (let i = 0; i < 11; i++) card.raw[i] = T.club.course__g1.holes[i].par + 1;
  card.at = Date.now();
  T.club[Cl.cardKey('frostbite', 'g1')] = card;
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; window.__forceRender();
}, [iso(-3), iso(10)]);
await p.evaluate(() => { window.__UI.modal = null; window.__UI.setupNag = false; window.__forceRender(); });
await p.waitForTimeout(1200);
await p.screenshot({ path: S + '/rs/you-top.png' });
const got = await p.evaluate(() => {
  const c = document.querySelector('.caddie');
  const r = c ? c.getBoundingClientRect() : null;
  return { bert: r ? Math.round(r.height) + 'x' + Math.round(r.width) : 'none',
    resume: [...document.querySelectorAll('[data-act="clubEnter"],[data-act="roundOpen"]')].map(b => b.textContent.trim()).filter(t => /Resume/.test(t)),
    head: (document.querySelector('.cc-h') || {}).textContent || '' };
});
console.log('caddie on a phone :', got.bert);
console.log('resume buttons    :', JSON.stringify(got.resume));
console.log('headline          :', got.head.slice(0, 90));
await ctx.close(); await b.close(); srv.close();
