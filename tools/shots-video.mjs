/* A walk-through of writing shots onto a hole, recorded off the real app.
   Taps are drawn as a ring because a screen recording with no finger in it
   is a mystery; the caption says what is being done and why. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const OUT = S + '/vid';
mkdirSync(OUT, { recursive: true });
writeFileSync(S + '/vx.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/vx.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});

/* the finger, and the caption, laid over the app without touching it */
await ctx.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = `
      .vtap{position:fixed;z-index:99998;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;
        border:3px solid rgba(255,255,255,.95);background:rgba(201,162,83,.35);pointer-events:none;
        animation:vtapGo .62s ease-out forwards}
      @keyframes vtapGo{0%{transform:scale(.35);opacity:0}25%{transform:scale(1);opacity:1}100%{transform:scale(1.5);opacity:0}}
      .vcap{position:fixed;left:14px;right:14px;bottom:18px;z-index:99999;pointer-events:none;
        background:rgba(16,22,17,.94);color:#EFE9D8;border-radius:14px;padding:11px 14px;
        font:600 15px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        box-shadow:0 10px 26px rgba(0,0,0,.4);opacity:0;transition:opacity .28s ease}
      .vcap.on{opacity:1}`;
    document.head.appendChild(s);
    const cap = document.createElement('div'); cap.className = 'vcap'; document.body.appendChild(cap);
    window.__cap = t => { if (!t) { cap.classList.remove('on'); return; } cap.textContent = t; cap.classList.add('on'); };
    window.__tap = (x, y) => {
      const d = document.createElement('div'); d.className = 'vtap';
      d.style.left = x + 'px'; d.style.top = y + 'px';
      document.body.appendChild(d); setTimeout(() => d.remove(), 700);
    };
  });
});

const p = await ctx.newPage();
await p.goto(BASE);
await p.waitForTimeout(2600);

const cap = async t => { await p.evaluate(t => window.__cap && window.__cap(t), t); };
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
/* a tap you can see: the ring lands, then the real press happens under it */
async function tapAt(x, y, hold = 420) {
  await p.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [x, y]);
  await p.waitForTimeout(170);
  await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(45); await p.mouse.up();
  await p.waitForTimeout(hold);
}
/* The club row scrolls sideways, so the club you want may be off the glass.
   Bring it into view and measure AFTER it has stopped moving, or the ring
   lands where the chip used to be and the tap misses it entirely. */
/* Said out loud as it records, so the file is checked rather than squinted at */
const say = async what => {
  const n = await p.evaluate(() => { const c = window.__T.club.card__frostbite__g1; return c && c.shots && c.shots['0'] ? c.shots['0'].length : 0; });
  const club = await p.evaluate(() => (document.querySelector('.h3club.on') || {}).textContent || '-');
  console.log('  ' + what.padEnd(26) + ' shots=' + n + ' club=' + club);
};
async function tapSel(sel, hold = 600) {
  const l = p.locator(sel).first();
  await l.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(280);
  const box = await l.boundingBox();
  if (!box) throw new Error('nothing at ' + sel);
  await tapAt(box.x + box.width / 2, box.y + box.height / 2, hold);
}

/* ---- the book, set to a Tuesday in an open stop ---- */
await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: 'Eighteen at home.' }],
    packages: [] };
  const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
  T.club.course__g1 = { ...Cl.courseFrom(hit, 'g1'), approved: true };
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null;
  window.__forceRender();
}, [iso(-3), iso(10)]);
await p.waitForTimeout(900);

/* ======== the walk-through starts here ======== */
await cap('The You tab. Start a round.');
await p.waitForTimeout(1400);
await tapSel('[data-act="roundNew"], [data-act="clubEnter"]', 900);

await cap('Say what it is before you start. This one counts.');
await p.waitForTimeout(1500);
await tapSel('.nr[data-a="comp"]', 1100);

await cap('Score Entry. Tap See the hole.');
await p.waitForTimeout(1500);
await tapSel('.ehd-art', 2200);

await cap('The real 1st at Leatherhead, from the club’s own map.');
await p.waitForTimeout(2000);

await cap('Pick the club you hit…');
await p.waitForTimeout(1300);
await tapSel('.h3club:has-text("Dr")', 700);
await cap('…then tap where the ball finished.');
await p.waitForTimeout(1100);
let g = await p.locator('.h3live').boundingBox();
await tapAt(g.x + g.width * 0.50, g.y + g.height * 0.58, 1500);
await say('after await tapAt(g.x + ');

await cap('It writes the club, and the yards from the tee.');
await p.waitForTimeout(1800);

await cap('Second shot: a 5 wood.');
await p.waitForTimeout(1100);
await tapSel('.h3club:has-text("5w")', 650);
await tapAt(g.x + g.width * 0.56, g.y + g.height * 0.40, 1500);
await say('after await tapAt(g.x + ');

await cap('And a 9 iron in.');
await p.waitForTimeout(1000);
await tapSel('.h3club:has-text("9i")', 650);
await tapAt(g.x + g.width * 0.50, g.y + g.height * 0.28, 1700);
await say('after await tapAt(g.x + ');

await cap('The track runs tee to ball to ball, on the ground.');
await p.waitForTimeout(2200);

await cap('Got one wrong? Undo.');
await p.waitForTimeout(1200);
await tapSel('[data-act="shotUndo"]', 1500);
await say('after await tapSel([dat');
await cap('And put it where it really went.');
await p.waitForTimeout(1000);
await tapSel('.h3club:has-text("9i")', 500);
await tapAt(g.x + g.width * 0.47, g.y + g.height * 0.30, 1700);
await say('after await tapAt(g.x + ');

await cap('Close it and the round carries on as normal.');
await p.waitForTimeout(1500);
await tapSel('.h3x', 1600);

await cap('The strip marks the holes you tracked. The rest are fine blank.');
await p.waitForTimeout(2600);
await cap('');
await p.waitForTimeout(600);

await ctx.close();
await b.close();
srv.close();

/* playwright names the file by its own id; give it one a person can read */
const f = readdirSync(OUT).filter(x => x.endsWith('.webm')).sort();
if (f.length) { renameSync(OUT + '/' + f[f.length - 1], OUT + '/raw.webm'); console.log('recorded ' + OUT + '/raw.webm'); }
else console.log('NO VIDEO WRITTEN');
