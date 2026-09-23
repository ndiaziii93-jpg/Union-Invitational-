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
const open = async (w, h, schematic) => {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  /* The tab draws the hotel's artwork when it has it and its own schematic
     when it does not. Both ship, so both are tested: taking the picture away
     before the book loads is what puts it on the fallback. */
  if (schematic) await pg.addInitScript(() => {
    Object.defineProperty(window, 'UI_IMAGES', {
      get: () => window.__imgs, set: v => { delete v.resortmap; window.__imgs = v; },
    });
  });
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

/* The plate at the head of the guide: a photograph with a line of type under
   it, above the heading — set the way the Today page sets its own, not as a
   heading dropped on a picture. */
const plate = await pg.evaluate(() => {
  const f = document.querySelector('.rhero');
  if (!f) return null;
  const img = f.querySelector('img'), cap = f.querySelector('figcaption');
  const h = document.querySelector('.head');
  return { h: Math.round(img.getBoundingClientRect().height),
           described: (img.alt || '').length > 40,
           captioned: !!cap && cap.innerText.length > 20,
           beforeHeading: f.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0,
           loaded: img.naturalWidth > 600 };
});
ok('the guide opens on a plate', !!plate, true);
ok('the photograph actually loaded', plate && plate.loaded, true);
ok('it is a band, not a page', plate && plate.h > 150 && plate.h < 320, true);
ok('it sits above the heading', plate && plate.beforeHeading, 1);
ok('it says what it is, for a reader who cannot see it', plate && plate.described, true);
ok('and carries a caption', plate && plate.captioned, true);

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

/* ---- 4. the plan ---- */
await pg.click('[data-act="resortTab"][data-a="plan"]');
ok('the hotel’s own artwork is what gets drawn', await pg.locator('.planimg').count(), 1);

/* The points are percentages across and down THAT picture, so a handful of
   landmarks have to land where they belong on it. This is the check that
   fails if the artwork is ever replaced with one framed differently. */
const at = name => pg.evaluate(n => {
  const s = document.querySelector('.planstage').getBoundingClientRect();
  const b = [...document.querySelectorAll('.pin')].find(e => e.title === n).getBoundingClientRect();
  return { x: Math.round(((b.left + b.right) / 2 - s.left) / s.width * 100),
           y: Math.round(((b.top + b.bottom) / 2 - s.top) / s.height * 100) };
}, name);
const sports = await at('Sports Area'), aqua = await at('Aquapark');
const lobby = await at('Lobby & Reception'), gaz = await at('Beach Gazebos');
ok('the sports ground sits out on the left', sports.x < 12, true);
ok('the lobby in the built-up top left', lobby.x > 22 && lobby.x < 38 && lobby.y < 28, true);
ok('the aquapark down at the far end', aqua.x > 65 && aqua.y > 62, true);
ok('and the gazebos out on the sand', gaz.x > 78, true);

/* A tap names the point on the artwork itself — the card is a scroll away on
   a phone, and a dot that answers with nothing reads as a dead map. */
await pg.evaluate(() => {
  const i = [...document.querySelectorAll('.pin')].findIndex(b => b.title === 'Main Restaurant');
  document.querySelectorAll('.pin')[i].click();
});
await pg.waitForTimeout(250);
ok('a tap names it on the plan', await pg.locator('.pin.on .pinlabel').innerText(), 'Main Restaurant');
ok('and opens the point', await pg.locator('#pinCard .vn').first().innerText(), 'Main Restaurant');
ok('with its hours on it', (await pg.locator('#pinCard .hrs').count()) > 0, true);
const href = await pg.locator('#pinCard a').getAttribute('href');
ok('and a Google Maps link naming the place and the hotel',
  href.startsWith('https://www.google.com/maps/search/?api=1&query=')
  && decodeURIComponent(href).includes('Main Restaurant Titanic Deluxe Golf Belek'), true);
const back = await pg.locator('a[href*="maps/dir"]').first().getAttribute('href');
ok('and walking directions back to a real latitude and longitude',
  back.includes('travelmode=walking') && back.includes('36.86854,30.97629'), true);

await pg.click('#pinCard [data-act="resortPin"]');
await pg.waitForTimeout(150);
ok('closing it puts the drawing back', await pg.locator('#pinCard').count(), 0);

/* Every target has to be big enough for a thumb. */
const tiny = await pg.evaluate(() =>
  [...document.querySelectorAll('.pin')].map(e => e.getBoundingClientRect())
    .filter(x => x.width < 30 || x.height < 30).length);
ok('every point is big enough to hit', tiny, 0);

/* Picking out of the list opens the same card — and on the panorama, which is
   four times as wide as it is tall, has to bring the point into view. */
await pg.locator('.plist .plink', { hasText: 'Aquapark' }).first().click();
await pg.waitForTimeout(250);
ok('picking from the list opens the same card',
  await pg.locator('#pinCard .vn').first().innerText(), 'Aquapark');
ok('and marks the row it came from', await pg.locator('.vrow.picked').count(), 1);
await pg.close();

const ph0 = await open(390, 844);
await ph0.click('[data-act="go"][data-a="resort"]');
await ph0.click('[data-act="resortTab"][data-a="plan"]');
await ph0.waitForTimeout(400);
const off = await ph0.evaluate(() => {
  const w = document.querySelector('.planwrap');
  return { over: w.scrollWidth - w.clientWidth, at: w.scrollLeft };
});
ok('on a phone the plan runs off the side, to be dragged', off.over > 200, true);
await ph0.locator('.plist .plink', { hasText: 'Aquapark' }).first().click();
await ph0.waitForTimeout(350);
const shown = await ph0.evaluate(() => {
  const w = document.querySelector('.planwrap').getBoundingClientRect();
  const p = document.querySelector('.pin.on').getBoundingClientRect();
  return p.left > w.left && p.right < w.right;
});
ok('and picking a far-off point brings it into view', shown, true);
await ph0.close();

/* ---- 5. the drawing the book falls back to, with no artwork ---- */
/* Every name has to be beside its own dot and on top of nothing else. The
   first version of this drew "Palm Bar & PatisserieSapore". */
const sc = await open(1280, 900, true);
await sc.click('[data-act="go"][data-a="resort"]');
await sc.click('[data-act="resortTab"][data-a="plan"]');
ok('with no artwork the book draws its own', await sc.locator('.planimg').count(), 0);

const overlaps = p => p.evaluate(() => {
  const s = document.querySelector('.plan').getBoundingClientRect();
  const t = [...document.querySelectorAll('.plan text')];
  const r = t.map(e => e.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    if (r[i].left < r[j].right - 1 && r[i].right > r[j].left + 1
     && r[i].top < r[j].bottom - 1 && r[i].bottom > r[j].top + 1) n++;
  return { labels: t.length, clashes: n,
           off: r.filter(x => x.left < s.left - 1 || x.right > s.right + 1).length };
});
const desk = await overlaps(sc);
ok('it names a useful number of them', desk.labels > 20, true);
ok('no two names sit on each other', desk.clashes, 0);
ok('and none runs off the paper', desk.off, 0);

/* The tap targets and the dots are laid out in two different coordinate
   systems. They have to agree, and they only agree if both are measured
   against the same box. */
const drift = await sc.evaluate(() => {
  const pins = [...document.querySelectorAll('.pin')];
  const dots = [...document.querySelectorAll('.plan .dot')];
  let worst = 0;
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i].getBoundingClientRect(), c = dots[i].getBoundingClientRect();
    worst = Math.max(worst, Math.hypot((a.left + a.right) / 2 - (c.left + c.right) / 2,
                                       (a.top + a.bottom) / 2 - (c.top + c.bottom) / 2));
  }
  return worst;
});
ok('every tap target sits on its own dot', drift < 1.5, true);
await sc.close();

/* The same, on a phone, where the type is proportionally far larger. */
const ph = await open(390, 844, true);
await ph.click('[data-act="go"][data-a="resort"]');
await ph.click('[data-act="resortTab"][data-a="plan"]');
const small = await overlaps(ph);
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
