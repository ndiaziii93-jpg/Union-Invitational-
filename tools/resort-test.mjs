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
/* The timetable is set behind the line that names it: open the sheet, pick,
   and the sheet closes on the pick. */
const season = async (pg, v) => {
  await pg.click('[data-act="hoursSheet"]'); await pg.waitForTimeout(300);
  await pg.click('.shmodal [data-act="resortSeason"][data-a="' + v + '"]'); await pg.waitForTimeout(350);
};
const open = async (w, h, schematic) => {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  /* The tab draws the hotel's artwork when it has it and its own schematic
     when it does not. Both ship, so both are tested: taking the picture away
     before the book loads is what puts it on the fallback. */
  /* The tab is a clock as much as a page: what is serving depends on the
     hour, so a test that reads the real one passes in the afternoon and
     fails at midnight. Every page here opens at one in the afternoon at the
     resort, when there is plenty on. */
  await pg.addInitScript(() => {
    const fixed = Date.UTC(2026, 9, 28, 10, 0);        // 13:00 at the resort
    const D = Date;
    window.Date = class extends D {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed; }
    };
  });
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

/* Nine tabs name a job; this one names a place, and is set like a name. The
   pointer is moved off first — a click leaves it hovering, and hover has a
   colour of its own, which is how this was first mis-measured. */
await pg.mouse.move(4, 4);
const named = await pg.evaluate(() => {
  const t = document.querySelector('.tab.named');
  const other = [...document.querySelectorAll('.tab:not(.named)')]
    .find(e => !e.hasAttribute('aria-current'));
  const c = getComputedStyle(t), o = getComputedStyle(other);
  return { on: t.dataset.a, tf: c.textTransform, track: parseFloat(c.letterSpacing),
           gold: c.color, plain: o.color, sameAsOthers: c.color === o.color };
});
ok('the tab set apart is the one that names a place', named.on, 'resort');
ok('it is set in capitals', named.tf, 'uppercase');
ok('tracked wide', named.track >= 2, true);
ok('and in an ink of its own', named.sameAsOthers, false);

const order = await pg.$$eval('.tabs .tab', els => els.map(e => e.dataset.a));
/* Four tabs, in the order of the week: where you are, what you are writing
   down, what it adds up to, and the hotel you go back to. */
ok('The Titanic is the last of the five', order,
  ['today', 'entry', 'boards', 'calendar', 'resort']);

await pg.click('[data-act="go"][data-a="resort"]:visible');
await pg.waitForTimeout(300);
/* The tab opens on its front: a search, six "what do you want" tiles, and
   what is open now for the one lit. */
ok('and opens on its front, hungry lit', await pg.locator('.tc-tile.on b').innerText(), 'Hungry');
ok('six tiles, each a question', await pg.locator('.tc-tile').count(), 6);

/* The plate at the head of the guide: the hotel's aerial with the name set
   on it, credited to the hotel. */
const plate = await pg.evaluate(() => {
  const f = document.querySelector('.rhero');
  if (!f) return null;
  const img = f.querySelector('img'), cap = f.querySelector('figcaption');
  const h = document.querySelector('.head');
  return { h: Math.round(img.getBoundingClientRect().height),
           described: (img.alt || '').length > 40,
           captioned: !!cap && cap.innerText.length > 20,
           credited: /Titanic Hotels/.test(f.innerText),
           beforeHeading: f.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0,
           loaded: img.naturalWidth > 600 };
});
ok('the guide opens on a plate', !!plate, true);
ok('and it meets the paper as a clean edge', await pg.evaluate(() => {
  const c = getComputedStyle(document.querySelector('.rhero img'));
  const m = String(c.maskImage || c.webkitMaskImage || 'none');
  return m === 'none' || m === '';
}), true);
const firstScreen = await pg.evaluate(() => {
  const tiles = document.querySelector('.tc-tiles').getBoundingClientRect();
  const title = document.querySelector('.rt-words .head').getBoundingClientRect();
  const wx = document.querySelector('.wx');
  const w = wx ? wx.getBoundingClientRect() : null;
  return { tilesTop: Math.round(tiles.top), view: window.innerHeight,
           beside: !!w && w.left > title.right - 2 && w.top < title.bottom && w.bottom > title.top };
});
ok('the tiles start on the first screen', firstScreen.tilesTop < firstScreen.view, true);
ok('and on a wide screen the weather is beside the title', firstScreen.beside, true);
ok('the photograph actually loaded', plate && plate.loaded, true);
ok('it is a band, not a page', plate && plate.h > 150 && plate.h < 320, true);
ok('it sits above the heading', plate && plate.beforeHeading, 1);
ok('it says what it is, for a reader who cannot see it', plate && plate.described, true);
ok('and carries a caption', plate && plate.captioned, true);
ok('and the hotel’s credit', plate && plate.credited, true);

/* Every row is a way in to the place it names, with the hotel's photograph
   where there is one. */
const rows = await pg.evaluate(() => {
  const c = [...document.querySelectorAll('.tc-top .tc-row')];
  return { n: c.length, allButtons: c.every(e => e.tagName === 'BUTTON' && e.dataset.act === 'resortVenue'),
           photos: c.filter(e => e.querySelector('img.tc-th')).length };
});
ok('one o’clock: lunch is on, and listed', rows.n > 3, true);
ok('and every row opens', rows.allButtons, true);
ok('most of them with the hotel’s photograph', rows.photos >= Math.ceil(rows.n / 2), true);

await pg.locator('.tc-top .tc-row', { hasText: 'Main Restaurant' }).first().click();
await pg.waitForTimeout(300);
ok('a row opens the place’s card', await pg.locator('.venuemodal').count(), 1);
ok('named', await pg.locator('.venuemodal .mb-t').innerText(), 'Main Restaurant');
ok('led by the hotel’s photograph', await pg.locator('.venuemodal .ps-slides img').count() >= 1, true);
ok('with one timetable in it', [await pg.locator('.venuemodal .hrs').count(), await pg.locator('.venuemodal .hrs.two').count()], [1, 0]);
ok('open or shut, at a glance', (await pg.locator('.venuemodal .ps-fact').first().innerText()).includes('Open'), true);
ok('and where it is, from the air', await pg.locator('.venuemodal [data-act="resortArea"][data-a="main"]').count(), 1);
/* The way on is our own plan, not a street map that has never heard of the
   resort's footpaths. */
ok('and offers to show it on the plan', await pg.locator('[data-act="resortShowOnMap"]').count(), 1);
ok('and does not send you to Google instead', await pg.locator('.venuemodal a[href*="google"]').count(), 0);
ok('no close buttons: the card goes by a tap off it, or a swipe', await pg.locator('.venuemodal .ps-x, .venuemodal [data-act="modalCancel"]').count(), 0);
await pg.click('[data-act="resortShowOnMap"]');
await pg.waitForTimeout(500);
ok('which goes to the plan', await pg.locator('.planimg').count(), 1);
ok('closing the window behind it', await pg.locator('.venuemodal').count(), 0);
ok('with that place named on it', await pg.locator('.pin.on .pinlabel').innerText(), 'Main Restaurant');
ok('and the card on the plan is where Google is offered',
  await pg.locator('#pinCard a[href*="google.com/maps"]').count(), 1);
ok('and the landmarks named beside it, to judge the distance by',
  await pg.locator('.pin.mark .pinlabel').count(), 2);
ok('with a way back to the front', await pg.locator('.tc-backbar').count(), 1);
await pg.click('[data-act="resortZoom"][data-a="fit"]');

/* A place the hotel does not mark says so rather than dropping a pin on a guess. */
await pg.click('.tc-backbar'); await pg.waitForTimeout(250);
await pg.click('.tc-search'); await pg.waitForTimeout(300);
ok('the search opens the full guide, ready to type', await pg.evaluate(() => document.activeElement && document.activeElement.id), 'resortQ');
await pg.keyboard.type('bistro'); await pg.waitForTimeout(200);
{ const hits = await pg.locator('.tc-results .tc-row:not([hidden]) .tc-nm').allInnerTexts();
  ok('typing narrows it to what matches', hits.length >= 1 && hits.length < 4 && /^Bistro/.test(hits[0]), true); }
await pg.locator('.tc-results .tc-row:not([hidden])').first().click();
await pg.waitForTimeout(300);
ok('a place the plan does not mark offers no pin', await pg.locator('[data-act="resortShowOnMap"]').count(), 0);
ok('and says why', (await pg.locator('.venuemodal').innerText()).includes('Not marked'), true);
ok('falling back to Google, which is what it is for',
  await pg.locator('.venuemodal a[href*="google.com/maps"]').count(), 1);
ok('with no photograph of its own, it shows its area from the air', await pg.locator('.venuemodal .ps-air').count(), 1);
await pg.mouse.click(12, 12);                         // a tap off the card puts it away
await pg.waitForTimeout(200);
ok('and it closes', await pg.locator('.venuemodal').count(), 0);
ok('nothing matching says so', await pg.evaluate(() => {
  const q = document.getElementById('resortQ'); q.value = 'zzzz'; q.dispatchEvent(new Event('input', { bubbles: true }));
  return !document.querySelector('.tc-results .tc-empty').hidden; }), true);
await pg.evaluate(() => { const q = document.getElementById('resortQ'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); q.blur(); });

/* Nothing on the page should show its own markup. */
const raw = await pg.evaluate(() => document.getElementById('app').innerText);
ok('no escaped markup leaks into the type', /&(amp|lt|gt|quot|#39);/.test(raw), false);

/* The categories, and open now. */
await pg.click('[data-act="resortCat"][data-a="pools"]'); await pg.waitForTimeout(200);
ok('the pools category lists the twelve pools', await pg.locator('.tc-results .tc-row').count(), 12);
await pg.click('[data-act="resortCat"][data-a="eat"]'); await pg.waitForTimeout(200);
const allEat = await pg.locator('.tc-results .tc-row').count();
await pg.click('[data-act="resortOpen"]'); await pg.waitForTimeout(200);
const openEat = await pg.locator('.tc-results .tc-row').count();
ok('open now only takes the shut ones away', openEat > 0 && openEat < allEat, true);
await pg.click('[data-act="resortOpen"]');

/* An area of the grounds, a place in it, and back. */
await pg.click('.tc-backbar'); await pg.waitForTimeout(250);
await pg.locator('.tc-tag[data-a="river"]').click(); await pg.waitForTimeout(300);
ok('an area on the aerial opens', await pg.locator('.areamodal .mb-t').innerText(), 'Along the river');
ok('with its own photograph', await pg.locator('.areamodal .ps-slides img').count(), 1);
await pg.locator('.areamodal [data-act="resortVenue"][data-a="pascarella"]').click(); await pg.waitForTimeout(300);
ok('a place from the area', await pg.locator('.venuemodal .mb-t').innerText(), 'Pascarella');
ok('two photographs of it, to swipe between', await pg.locator('.venuemodal .ps-slides img').count(), 2);
await pg.click('[data-act="resortBack"]'); await pg.waitForTimeout(250);
ok('and back to the area it came from', await pg.locator('.areamodal').count(), 1);
await pg.mouse.click(12, 12); await pg.waitForTimeout(200);
ok('a tap off the card puts it away', await pg.locator('.areamodal').count(), 0);

/* The season sets the one timetable shown. The resort has confirmed summer
   hours for our week, so unset, the book reads summer and says so. */
await pg.click('[data-act="resortGuide"][data-a="search"]'); await pg.waitForTimeout(250);
await pg.evaluate(() => document.activeElement && document.activeElement.blur());
const closed = () => pg.evaluate(() => [...document.querySelectorAll('.tc-results .tc-row')].filter(r => /Closed/.test(r.innerText)).length);
ok('unset, the book reads the confirmed summer hours: nothing shut for the season', await closed(), 0);
ok('and the hours line says summer, confirmed', (await pg.locator('.setline.hours').innerText()).replace(/\s+/g, ' ').toLowerCase().includes('summer confirmed by the resort'), true);
await season(pg, 'winter');
ok('switched to winter, every room shut for it says so', await closed(), 21);
await season(pg, 'summer');
ok('and summer brings them all back', await closed(), 0);
await season(pg, '');

/* Anything the group writes is kept, and is there on the next visit. */
await pg.fill('#resortNote', 'Beef Grill was 25 euros a head and worth it.');
await pg.locator('#resortNote').blur();
await pg.waitForTimeout(150);
await pg.click('.tc-backbar'); await pg.waitForTimeout(150);
await pg.click('[data-act="resortGuide"][data-a="search"]'); await pg.waitForTimeout(250);
ok('a note survives leaving the guide',
  await pg.locator('#resortNote').inputValue(), 'Beef Grill was 25 euros a head and worth it.');
/* And a place has notes of its own. */
await pg.evaluate(() => document.activeElement && document.activeElement.blur());
await pg.locator('.tc-results .tc-row', { hasText: 'Beef Grill' }).first().click(); await pg.waitForTimeout(300);
await pg.fill('.venuemodal #resortNote', 'Ask for the window table.');
await pg.mouse.click(12, 12); await pg.waitForTimeout(200);
await pg.locator('.tc-results .tc-row', { hasText: 'Beef Grill' }).first().click(); await pg.waitForTimeout(300);
ok('a place keeps its own note', await pg.locator('.venuemodal #resortNote').inputValue(), 'Ask for the window table.');
await pg.mouse.click(12, 12); await pg.waitForTimeout(200);

/* ---- 4. the plan ---- */
await pg.click('[data-act="resortTab"][data-a="plan"]');
ok('the hotel’s own artwork is what gets drawn', await pg.locator('.planimg').count(), 1);

/* The key dots were sitting against their own labels. */
const keygap = await pg.evaluate(() => {
  const k = [...document.querySelectorAll('.pkey')].find(e => e.querySelector('.dotk'));
  const d = k.querySelector('.dotk').getBoundingClientRect();
  const r = document.createRange();
  r.selectNodeContents(k); r.setStart(k, 1);
  return Math.round(r.getBoundingClientRect().left - d.right);
});
ok('a key dot is clear of its own label', keygap >= 6, true);

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

/* Choosing a point is a request to see it closely, so the plan goes in —
   and the point has to still be on screen when it gets there. */
const zoomed = await pg.evaluate(() => {
  const w = document.querySelector('.planwrap'), s = document.querySelector('.planstage');
  const p = document.querySelector('.pin.on').getBoundingClientRect(), r = w.getBoundingClientRect();
  return { wide: s.getBoundingClientRect().width > r.width * 1.8,
           tall: w.scrollHeight > w.clientHeight + 1,
           inView: p.left > r.left && p.right < r.right && p.top > r.top && p.bottom < r.bottom };
});
ok('a tap takes the plan in close', zoomed.wide, true);
ok('far enough that it has to be dragged in both directions', zoomed.tall, true);
ok('and the point chosen is what you are looking at', zoomed.inView, true);
ok('with a way back out', await pg.locator('[data-act="resortZoom"][data-a="fit"]').count(), 1);
await pg.click('[data-act="resortZoom"][data-a="fit"]');
await pg.waitForTimeout(250);
ok('which shows the whole plan again', await pg.evaluate(() => {
  const w = document.querySelector('.planwrap');
  return w.scrollHeight <= w.clientHeight + 1;
}), true);

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
await ph0.click('[data-act="go"][data-a="resort"]:visible');
/* On a phone, the long names and their pills stay inside their rows. */
await ph0.waitForTimeout(300);
ok('on a phone nothing on the front pushes the page sideways', await ph0.evaluate(() => {
  const e = document.documentElement; return e.scrollWidth - e.clientWidth; }), 0);
ok('and every row fits the width of the glass', await ph0.evaluate(() =>
  [...document.querySelectorAll('.tc-row')].filter(r => r.scrollWidth > r.clientWidth + 1).length), 0);
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

/* ---- 4b. the plan under a thumb ----
   A map is a thing people already know how to use, so the gestures have to
   be the ones they already know: two fingers to zoom, a double tap to go in,
   and the point under the fingers staying where it was put. */
{
  const tctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await tp.addInitScript(() => {
    const fixed = Date.UTC(2026, 9, 28, 10, 0);
    const D = Date;
    window.Date = class extends D {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed; }
    };
  });
  await tp.goto('file://' + S + '/rt.html');
  await tp.waitForTimeout(4200);
  for (let i = 0; i < 6; i++) { const d = tp.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await tp.waitForTimeout(150); } else break; }
  await tp.click('[data-act="go"][data-a="resort"]:visible');
  await tp.click('[data-act="resortTab"][data-a="plan"]');
  /* The gesture is dispatched at viewport coordinates, so the fingers have to
     land on the part of the plan that is actually on screen. Half of it
     hanging below the fold was why the first attempt recorded no touches at
     all, and moving anything above the map broke it again — so the point is
     taken from where the plan and the viewport overlap, not from the plan. */
  const vp = tp.viewportSize();
  /* A gesture ends in a redraw, and a redraw puts the page back where it
     thinks it was — which is not necessarily where the last gesture left it.
     So the plan is brought back on screen before each one, and the point to
     touch is taken from where it is NOW. Computing it once and reusing it is
     how the second gesture came to be delivered to empty paper. */
  const aim = async () => {
    for (let k = 0; k < 5; k++) {
      const r = await tp.locator('.planwrap').boundingBox();
      if (r && r.y >= 0 && r.y + r.height <= vp.height) break;
      /* A redraw landing mid-gesture can leave the plan with no box at all
         for a moment. There is nothing to scroll to then — wait for the next
         paint rather than reading y off nothing, which is how this crashed
         under the load of a full suite run. */
      if (!r) { await tp.waitForTimeout(250); continue; }
      await tp.evaluate(([y, h, vh]) => window.scrollBy(0, y - Math.max(8, (vh - h) / 2)),
        [r.y, r.height, vp.height]);
      await tp.waitForTimeout(250);
    }
    const r = await tp.locator('.planwrap').boundingBox();
    if (!r) { ok('the plan has a box to aim at', false, true); return { x: 0, y: 0, visible: 0 }; }
    const top = Math.max(r.y, 0), bot = Math.min(r.y + r.height, vp.height);
    return { x: Math.round(r.x + r.width * 0.25), y: Math.round(top + (bot - top) * 0.34),
             visible: bot - top };
  };
  let a = await aim();
  ok('the plan is on screen to be touched', a.visible > 120, true);
  const ax = a.x, ay = a.y;
  const zoomOf = () => tp.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.planwrap')).getPropertyValue('--z')) || 1);
  const frac = (dx, dy) => tp.evaluate(([mx, my]) => {
    const w = document.querySelector('.planwrap'), st = document.querySelector('.planstage');
    return { fx: (w.scrollLeft + mx) / st.offsetWidth,
             fy: (w.scrollTop + my) / st.offsetHeight };
  }, [dx, dy]);
  const inWrap = async (p) => {
    const r = await tp.locator('.planwrap').boundingBox();
    return { dx: p.x - r.x, dy: p.y - r.y };
  };

  const cdp = await tctx.newCDPSession(tp);
  const pt = (x, y) => ({ x, y, radiusX: 8, radiusY: 8, force: 1 });

  /* One gesture, start to finish, with the measurements taken around it and
     nothing allowed to move in between. Aiming, measuring and touching were
     three separate steps, and a redraw between any two of them delivered the
     fingers to empty paper or compared two different places on the plan. */
  const gesture = async (from, to, steps) => {
    const p = await aim();
    const r = await tp.locator('.planwrap').boundingBox();
    const dx = p.x - r.x, dy = p.y - r.y;          // where the fingers are ON THE PLAN
    const before = await frac(dx, dy);
    const z0 = await zoomOf();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(p.x - from, p.y), pt(p.x + from, p.y)] });
    for (let k = 1; k <= steps; k++) {
      const d = from + (to - from) * (k / steps);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(p.x - d, p.y), pt(p.x + d, p.y)] });
      await tp.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tp.waitForTimeout(450);
    return { before, after: await frac(dx, dy), z0, z: await zoomOf() };
  };

  ok('the plan starts at the whole thing', await zoomOf(), 1);
  const wide = await gesture(30, 70, 10);
  ok('two fingers spread takes it in', wide.z > wide.z0 * 1.4, true);
  /* The whole feel of a map is this: what was under your fingers is still
     under your fingers. Recomputing the hold every frame instead of taking
     it once slid this a third of the way down the plan. */
  ok('and what was under them stays under them, across',
    Math.abs(wide.after.fx - wide.before.fx) < 0.02, true);
  ok('and down', Math.abs(wide.after.fy - wide.before.fy) < 0.02, true);

  const close = await gesture(70, 24, 10);
  ok('bringing them together takes it back out', close.z < close.z0, true);

  /* A double tap is the other half of what people expect. */
  await tp.evaluate(() => { document.querySelector('.planwrap').dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 700 })); });
  await tp.waitForTimeout(400);
  ok('a double tap goes in a step', await zoomOf() > 1, true);

  /* And the page must still scroll. A plain wheel belongs to the page; only
     a wheel with ctrl held — which is what a trackpad pinch sends — is ours. */
  const zBeforeWheel = await zoomOf();
  await tp.evaluate(() => { const w = document.querySelector('.planwrap');
    w.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200 })); });
  await tp.waitForTimeout(300);
  ok('a plain wheel is left to the page', await zoomOf(), zBeforeWheel);
  await tp.evaluate(() => { const w = document.querySelector('.planwrap');
    const r = w.getBoundingClientRect();
    w.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true,
      deltaY: -240, clientX: r.left + 60, clientY: r.top + 60 })); });
  await tp.waitForTimeout(400);
  ok('a trackpad pinch is not', await zoomOf() > zBeforeWheel, true);

  /* The buttons stay: they are how a keyboard gets there. */
  ok('and the buttons are still there for a keyboard',
    await tp.locator('[data-act="resortZoom"]').count() >= 2, true);
  await tp.close();
  await tctx.close();
}

/* ---- 4c. a card on a phone: three quarters of the glass, pulled down to go ---- */
{
  const sctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const sp = await sctx.newPage();
  sp.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await sp.addInitScript(() => {
    const fixed = Date.UTC(2026, 9, 28, 10, 0);
    const D = Date;
    window.Date = class extends D {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed; }
    };
  });
  await sp.goto('file://' + S + '/rt.html');
  await sp.waitForTimeout(4200);
  for (let i = 0; i < 6; i++) { const d = sp.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await sp.waitForTimeout(150); } else break; }
  await sp.click('[data-act="go"][data-a="resort"]:visible'); await sp.waitForTimeout(400);
  const openCard = async () => { await sp.locator('.tc-top .tc-row').first().tap(); await sp.waitForTimeout(600); };
  await openCard();
  const top = await sp.evaluate(() => Math.round(document.querySelector('.psheet').getBoundingClientRect().top));
  ok('a card rises three quarters of the way up the glass', Math.abs(top - 844 / 4) <= 12, true);
  ok('with a handle that says it can be pulled', await sp.locator('.psheet .ps-grab').count(), 1);
  const cdp = await sctx.newCDPSession(sp);
  const pt = (x, y) => [{ x, y, radiusX: 5, radiusY: 5, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200, top + 300) });
  for (let k = 1; k <= 10; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(200, top + 300 + k * 20) });
    await sp.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sp.waitForTimeout(500);
  ok('pulled down, it goes', await sp.locator('.psheet').count(), 0);
  await openCard();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200, top + 300) });
  for (let k = 1; k <= 3; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(200, top + 300 + k * 10) });
    await sp.waitForTimeout(60);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sp.waitForTimeout(500);
  ok('a little nudge and it settles back', await sp.locator('.psheet').count(), 1);
  await sp.touchscreen.tap(200, 60); await sp.waitForTimeout(400);
  ok('a tap on the quarter above puts it away', await sp.locator('.psheet').count(), 0);
  ok('the Resort tab is drawn in gold, open or not', await sp.evaluate(() => {
    const r = getComputedStyle(document.querySelector('.navbtn[data-a="resort"]')).color;
    const t = getComputedStyle(document.querySelector('.navbtn[data-a="today"]')).color;
    return r !== t && /^rgb\((2[0-2]\d), (1[6-9]\d), (8\d|9\d|1[01]\d)\)$/.test(r);
  }), true);
  await sp.close(); await sctx.close();
}

/* ---- 5. the drawing the book falls back to, with no artwork ---- */
/* Every name has to be beside its own dot and on top of nothing else. The
   first version of this drew "Palm Bar & PatisserieSapore". */
const sc = await open(1280, 900, true);
await sc.click('[data-act="go"][data-a="resort"]:visible');
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
await ph.click('[data-act="go"][data-a="resort"]:visible');
await ph.click('[data-act="resortTab"][data-a="plan"]');
const small = await overlaps(ph);
ok('on a phone too, nothing clashes', small.clashes, 0);
ok('and nothing is cut off', small.off, 0);
ok('and it is still worth looking at', small.labels > 8, true);

/* ON A PHONE THE STRIP IS GONE and the bar is along the bottom, under the
   thumb. Four marks on one surface, all on one line, and the page has to end
   above it rather than behind it. */
const bar = await ph.evaluate(() => {
  const nav = document.querySelector('.tabbar');
  const btns = [...nav.querySelectorAll('.navbtn')];
  const tops = new Set(btns.map(e => Math.round(e.getBoundingClientRect().top)));
  const r = nav.getBoundingClientRect();
  return {
    stripHidden: getComputedStyle(document.querySelector('.tabs')).display === 'none',
    n: btns.length,
    rows: tops.size,
    atBottom: Math.abs(window.innerHeight - r.bottom) <= 1,
    fullWidth: Math.abs(r.width - window.innerWidth) <= 1,
    /* The last of the page's CONTENT clears the bar. Not the wrapper, whose
       box now includes the padding put there to make that room — measuring
       that only ever proves the padding exists. */
    clears: (function () {
      const last = document.querySelector('.statusbar');
      if (!last) return false;
      window.scrollTo(0, document.documentElement.scrollHeight);
      return last.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1;
    }()),
  };
});
ok('the strip at the top is gone on a phone', bar.stripHidden, true);
ok('six tabs along the bottom', bar.n, 6);
ok('all on one line', bar.rows, 1);
ok('sitting on the bottom edge', bar.atBottom, true);
ok('the full width of the screen', bar.fullWidth, true);
ok('and the page ends above it, not behind it', bar.clears, true);
await ph.close();

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
