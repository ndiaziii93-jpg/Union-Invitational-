/* What the You tab's player card actually looks like, at the three widths
   the trip is read on: a phone, an iPad and a laptop. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/yc', { recursive: true });
writeFileSync(S + '/yc/shot.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/yc/shot.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const FACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, w, h, mob] of [['phone', 390, 844, true], ['ipad', 834, 1112, false], ['laptop', 1280, 800, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(2200);
  await p.evaluate(([ds, face]) => {
    const T = window.__T, UI = window.__UI, Cl = window.__C;
    const STOPS = [['mulligan', 'The Merry Mulligan Open'], ['frostbite', 'The Frostbite Open'],
      ['sweetheart', 'The Sweetheart Scramble']].map(([id, name], i) => ({
      id, name, from: ds[i], to: ds[i], format: 'stableford', note: 'Eighteen at home.' }));
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' }, stops: STOPS, packages: [] };
    const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
    let sd = 5; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    ['g1', 'g2', 'g3'].forEach(pid => {
      const course = { ...Cl.courseFrom(hit, pid), approved: true };
      T.club['course__' + pid] = course;
      for (const st of STOPS) {
        const card = Cl.blankClubCard(st.id, pid, 20, course);
        for (let i = 0; i < 18; i++) { const par = course.holes[i].par;
          card.raw[i] = Math.max(2, Math.min(par + 3, Math.round(par + 1.1 + (rnd() + rnd() - 1) * 2))); }
        card.done = true; card.at = Date.now();
        T.club[Cl.cardKey(st.id, pid)] = card;
      }
    });
    T.club.profile__g1 = { pid: 'g1', bert: 'frostbite', face: { url: face, x: 40, y: 30, zoom: 180, at: 1 } };
    UI.who = 'g1'; UI.me = 'g1'; UI.modal = null; UI.screen = 'you';
    window.__forceRender();
  }, [[ago(90), ago(60), ago(30)], FACE]);
  await p.waitForTimeout(700);
  const box = await p.evaluate(() => {
    const l = document.querySelector('.yc').closest('.cline');
    l.scrollIntoView({ block: 'center' });
    const r = l.getBoundingClientRect();
    return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: r.width + 28, height: r.height + 28 };
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: S + '/yc/block-' + name + '.png', clip: box });
  console.log(name + '  ' + Math.round(box.width) + 'x' + Math.round(box.height));
  await ctx.close();
}
await b.close(); srv.close();
