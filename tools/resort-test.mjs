/* The Titanic tab: the clock behind "what is open right now", the two
   timetables, the site plan's label placement, and that the tenth tab did not
   break the nav grid. Run: node tools/resort-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/rt.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '</head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* ---- 1. the clock, off the page ---- */
const R = await import('../src/resort.js');

ok('an ordinary window', R.inSlot({ from: '12:30', to: '16:00' }, 13 * 60), true);
ok('outside it', R.inSlot({ from: '12:30', to: '16:00' }, 16 * 60), false);
/* The Bistro shuts at three in the morning, so its window has to be treated as
   a window on a circle. Reading it as a line is how one in the morning came out
   as "nothing is open". */
ok('past midnight, at 1am', R.inSlot({ from: '15:00', to: '03:00' }, 60), true);
ok('past midnight, at 2pm', R.inSlot({ from: '15:00', to: '03:00' }, 14 * 60), false);
ok('past midnight, at 11pm', R.inSlot({ from: '15:00', to: '03:00' }, 23 * 60), true);
ok('the bar that never shuts', R.inSlot({ from: '00:00', to: '24:00' }, 4 * 60), true);
ok('minutes until it opens', R.untilOpen({ from: '19:00', to: '21:30' }, 18 * 60 + 30), 30);
ok('open already', R.untilOpen({ from: '19:00', to: '21:30' }, 20 * 60), 0);
ok('tomorrow, not yesterday', R.untilOpen({ from: '09:00', to: '11:00' }, 23 * 60), 10 * 60);

/* ---- 2. the two timetables ---- */
const shutInWinter = R.VENUES.filter(v => !v.w).map(v => v.id);
ok('most of it closes for the winter', shutInWinter.length, 21);
const winterOpenIds = new Set();
for (let m = 0; m < 1440; m += 15) R.whatsOn('winter', m).open.forEach(o => winterOpenIds.add(o.v.id));
ok('and nothing shut is ever listed as open',
  shutInWinter.filter(id => winterOpenIds.has(id)), []);
/* Half past nine at night in winter, which is the case that matters: the
   buffet has closed and the à la cartes want a reservation. */
const late = R.whatsOn('winter', 21 * 60 + 30).open.map(o => o.v.id);
ok('the Bistro leads a late winter evening', late[0], 'bistro');
ok('and somewhere to walk into comes before somewhere to book',
  late.findIndex(id => (R.VENUES.find(v => v.id === id) || {}).cost === 'cover')
    > late.findIndex(id => (R.VENUES.find(v => v.id === id) || {}).cost === 'inc'), true);

/* ---- 3. and now the screen ---- */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const open = async (w, h) => {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('file://' + S + '/rt.html');
  await pg.waitForTimeout(4200);                       // the opening crest
  for (let i = 0; i < 6; i++) {
    const d = pg.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break;
  }
  return pg;
};

const pg = await open(1280, 900);
ok('the book still boots', errs, []);

const order = await pg.$$eval('.tabs .tab', els => els.map(e => e.dataset.a));
ok('The Titanic sits between Today and the boards',
  order.slice(0, 3), ['today', 'resort', 'boards']);

await pg.click('[data-act="go"][data-a="resort"]');
ok('and opens on what is serving now',
  await pg.locator('.btab.on').innerText(), 'Right now');

/* The season switch re-times everything under it. */
await pg.click('[data-act="resortSeason"][data-a="winter"]');
await pg.click('[data-act="resortTab"][data-a="eat"]');
const shutRows = await pg.locator('.vrow.out').count();
ok('winter greys out every closed room', shutRows, 21);
await pg.click('[data-act="resortSeason"][data-a="summer"]');
ok('summer brings them all back', await pg.locator('.vrow.out').count(), 0);
await pg.click('[data-act="resortSeason"][data-a=""]');
ok('and unset shows both timetables side by side',
  (await pg.locator('.hrs.two').count()) > 10, true);

/* Anything the group writes is kept, and is there on the next visit. */
await pg.fill('#resortNote', 'Beef Grill was 25 euros a head and worth it.');
await pg.locator('#resortNote').blur();
await pg.waitForTimeout(150);
await pg.click('[data-act="resortTab"][data-a="now"]');
await pg.click('[data-act="resortTab"][data-a="eat"]');
ok('a note survives leaving the tab',
  await pg.locator('#resortNote').inputValue(), 'Beef Grill was 25 euros a head and worth it.');

/* ---- 4. the plan's labels ---- */
/* Every name has to be beside its own dot and on top of nothing else. The
   first version of this drew "Palm Bar & PatisserieSapore". */
await pg.click('[data-act="resortTab"][data-a="plan"]');
const overlaps = async () => pg.evaluate(() => {
  const t = [...document.querySelectorAll('.plan text')].map(e => e.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i], c = t[j];
    if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) n++;
  }
  return { labels: t.length, clashes: n };
});
const desk = await overlaps();
ok('the plan names a useful number of them', desk.labels > 20, true);
ok('and no two names sit on each other', desk.clashes, 0);

const box = await pg.evaluate(() => {
  const s = document.querySelector('.plan').getBoundingClientRect();
  return [...document.querySelectorAll('.plan text')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.left < s.left - 1 || r.right > s.right + 1; }).length;
});
ok('and none of them runs off the paper', box, 0);
await pg.close();

/* The same, on a phone, where the type is proportionally far larger. */
const ph = await open(390, 844);
await ph.click('[data-act="go"][data-a="resort"]');
await ph.click('[data-act="resortTab"][data-a="plan"]');
const small = await ph.evaluate(() => {
  const s = document.querySelector('.plan').getBoundingClientRect();
  const t = [...document.querySelectorAll('.plan text')];
  let n = 0;
  const r = t.map(e => e.getBoundingClientRect());
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    if (r[i].left < r[j].right - 1 && r[i].right > r[j].left + 1
     && r[i].top < r[j].bottom - 1 && r[i].bottom > r[j].top + 1) n++;
  return { clashes: n, off: r.filter(x => x.left < s.left - 1 || x.right > s.right + 1).length, labels: t.length };
});
ok('on a phone too, nothing clashes', small.clashes, 0);
ok('and nothing is cut off', small.off, 0);
ok('and it is still worth looking at', small.labels > 8, true);

/* The tenth tab must not leave one stranded in a column of its own. */
const rows = await ph.evaluate(() => {
  const t = [...document.querySelectorAll('.tabs .tab')];
  const wide = document.querySelector('.tabs').getBoundingClientRect().width;
  const last = t[t.length - 1].getBoundingClientRect();
  const tops = new Set(t.map(e => Math.round(e.getBoundingClientRect().top)));
  return { n: t.length, rows: tops.size, lastFull: last.width > wide * 0.9 };
});
ok('ten tabs on a phone', rows.n, 10);
ok('in four rows', rows.rows, 4);
ok('with the last one taking the whole width rather than a third', rows.lastFull, true);
await ph.close();

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
