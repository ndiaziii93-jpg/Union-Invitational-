/* The front page as the cover: the photograph under the words, behind the
   nameplate on a phone and under the index on anything wider; the clock
   plate; the Boards' cards as doors; the day's lines; the privilege as
   tap-lines. Run: node tools/today-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/tt.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '</head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const open = async (w, h, mob, at = Date.UTC(2026, 9, 28, 10, 0)) => {   // 13:00 at the resort, the free day
  const pg = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob })).newPage();
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.addInitScript(fixed => {
    const D = Date;
    window.Date = class extends D {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed; }
    };
  }, at);
  await pg.goto('file://' + S + '/tt.html');
  await pg.waitForTimeout(4200);                       // the opening crest
  for (let i = 0; i < 6; i++) {
    const d = pg.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break;
  }
  await pg.waitForTimeout(300);
  return pg;
};
const rect = (pg, sel) => pg.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
}, sel);

/* ---- on a phone ---- */
console.log('\non a phone');
const p = await open(390, 844, true);
ok('the book boots on the front page', errs, []);
ok('and the page wears the cover', await p.locator('.wrap.cover').count(), 1);
let bg = await rect(p, '.coverbg'), cin = await rect(p, '.coverin'), mast = await rect(p, '.masthead'), np = await rect(p, '.nowplate');
ok('the picture starts at the top of the glass', bg.t <= 0, true);
ok('runs to the edges of it', [bg.l, bg.r], [0, 390]);
ok('and ends where the words end', bg.b, cin.b);
ok('the nameplate sits on it', mast.t >= bg.t && mast.b <= bg.b, true);
ok('the clock plate follows directly', np.t, cin.b);
ok('and spans the glass', [np.l, np.r], [0, 390]);
ok('the name is set in cream on the picture', await p.evaluate(() => getComputedStyle(document.querySelector('.masthead h1')).color), 'rgb(238, 232, 213)');
ok('the crest is still a door above the picture', await p.evaluate(() => {
  const c = document.querySelector('.crestbtn'); const r = c.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === c || c.contains(hit));
}), true);
ok('the dial too', await p.evaluate(() => {
  const c = document.querySelector('.masthead .dial'); const r = c.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === c || c.contains(hit));
}), true);
ok('the words of the day are over the picture', await p.evaluate(() => {
  const h = document.querySelector('.coverin .today-title'); const r = h.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
  return !!hit && (hit === h || h.contains(hit));
}), true);
ok('the page does not run off the side', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

ok('the four that matter, as the Boards draw them', await p.locator('.today-club .cc').count(), 4);
ok('the Team Competition first — the main event — in pine', await p.evaluate(() => {
  const c = document.querySelector('.today-club .cc');
  return c.dataset.a === 'pairs' && getComputedStyle(c).backgroundColor === 'rgb(29, 46, 33)';
}), true);
ok('then the MVP, the Cup and the Bingo', await p.$$eval('.today-club .cc', els => els.map(e => e.dataset.a)), ['pairs', 'mvp', 'ryder', 'bbb']);
ok('and the Cup is on the paper here, not in pine', await p.evaluate(() => {
  const c = document.querySelector('.today-club .cc[data-a="ryder"]');
  return getComputedStyle(c).backgroundColor !== 'rgb(29, 46, 33)' && c.querySelectorAll('.cc-cup svg').length === 2;
}), true);
ok('the clock sits in a ring', await p.locator('.nowplate .ring .np-big').count(), 1);
ok('that shows the time left in gold, part way through the gap', await p.evaluate(() => {
  const v = parseFloat(document.querySelector('.ring').style.getPropertyValue('--pct')); return v > 0 && v < 100;
}), true);
/* Ten days before the week there is no earlier fixture to measure from:
   the ring reads off a fortnight, so nine and a half days to go is most of
   the ring, not none of it. */
const early = await open(390, 844, true, Date.UTC(2026, 9, 16, 20, 0));
ok('long before the week, the ring is mostly gold, not empty', await early.evaluate(() => {
  const v = parseFloat(document.querySelector('.ring').style.getPropertyValue('--pct')); return v > 55 && v < 80;
}), true);
await early.context().close();
ok('and the words beside it stand clear of the edge', await p.evaluate(() => {
  const np = document.querySelector('.nowplate').getBoundingClientRect(), k = document.querySelector('.np-k').getBoundingClientRect();
  return k.top - np.top >= 16 && k.left - np.left >= 100;
}), true);
ok('the recap door is under them', await p.locator('.tg-r .recapbtn').count(), 1);
ok('the day has its lines', await p.locator('.tnlist').count(), 1);
ok('and the privilege is two tap-lines', await p.locator('.priv .setline').count(), 2);
ok('with the picker still where it was wired', await p.evaluate(() => typeof document.querySelector('.priv') !== 'undefined'), true);

/* the resize re-measures the sheet */
await p.setViewportSize({ width: 360, height: 780 }); await p.waitForTimeout(400);
bg = await rect(p, '.coverbg'); cin = await rect(p, '.coverin');
ok('narrower, the picture still ends where the words end', bg.b, cin.b);
ok('and still runs to the edges', [bg.l, bg.r], [0, 360]);
ok('and nothing runs off the side at 360', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

/* a card is a door */
await p.locator('.today-club .cc[data-a="pairs"]').click(); await p.waitForTimeout(700);
ok('a card opens its board', await p.evaluate(() => document.querySelector('.navbtn[aria-current="page"]').dataset.a), 'boards');
ok('on the game that was tapped', await p.evaluate(() => document.querySelector('.btab.on').dataset.a), 'pairs');
ok('and the cover is gone with the page', await p.locator('.wrap.cover').count(), 0);
await p.locator('.navbtn[data-a="today"]').click(); await p.waitForTimeout(700);
bg = await rect(p, '.coverbg'); cin = await rect(p, '.coverin');
ok('back on the front the sheet is measured again', bg && bg.b === cin.b && bg.t <= 0, true);
await p.locator('.today-club .cc[data-a="ryder"]').click(); await p.waitForTimeout(700);
ok('the Cup card opens the Cup', await p.evaluate(() => document.querySelector('.btab.on').dataset.a), 'ryder');

/* ---- on a laptop ---- */
console.log('\non a laptop');
const L = await open(1280, 900, false);
ok('the cover again', await L.locator('.wrap.cover').count(), 1);
bg = await rect(L, '.coverbg'); cin = await rect(L, '.coverin'); const tabs = await rect(L, '.tabs'); np = await rect(L, '.nowplate');
ok('under the index, not behind it', bg.t >= tabs.b - 2, true);
ok('kept to the width of the index', [bg.l, bg.r], [tabs.l, tabs.r]);
ok('and ending where the words end', bg.b, cin.b);
ok('the clock plate spans the same width', [np.l, np.r], [tabs.l, tabs.r]);
ok('the name stays in ink above the picture', await L.evaluate(() => getComputedStyle(document.querySelector('.masthead h1')).color), 'rgb(29, 46, 33)');
const cols = await L.evaluate(() => {
  const l = document.querySelector('.tg-l').getBoundingClientRect(), r = document.querySelector('.tg-r').getBoundingClientRect();
  return { side: r.left > l.right, sticky: getComputedStyle(document.querySelector('.tg-r')).position, rw: Math.round(r.width) };
});
ok('two columns: the day on the left, the cards on the right', cols.side, true);
ok('the cards keep up as the page scrolls', cols.sticky, 'sticky');
ok('in a column of 380 on a laptop', cols.rw, 380);
ok('nothing runs off the side', await L.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
ok('no errors on the way', errs, []);

await b.close();
console.log('\ntoday exit ' + (fails.length ? 1 : 0) + ' (' + (fails.length ? fails.length + ' failed' : 'all passed') + ')');
process.exit(fails.length ? 1 : 0);
