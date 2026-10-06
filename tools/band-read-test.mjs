/* What Tuesday says about a band.
 *
 * Everybody picks their own band for the practice round, and this reads the
 * cards back and says whether they picked right. A band IS the strokes you
 * receive, so the arithmetic is not subtle — net is gross minus band, and a
 * band is right when net lands near level par.
 *
 * The two corrections are what this leans on hardest. The score is CAPPED
 * before it is read, because Tuesday's raw total can carry a nine and
 * Thursday's cannot — reading the raw number would send a man up two bands
 * for one hole the tournament was never going to charge him for. And a short
 * card is projected, because nine holes at six over is not a band of six.
 *
 * Run: node tools/band-read-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import * as E from '../src/engine.js';
import { defaultConfig, blankCard } from '../src/store.js';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* ---------------- the arithmetic ---------------- */
console.log('\nthe arithmetic, with cards built by hand');

const mkT = () => ({ config: defaultConfig(), scores: {}, bbb: {}, recaps: {}, photos: {}, notes: {} });
/** Give a golfer a practice card: `overs` is strokes over par, hole by hole. */
const give = (T, pid, overs) => {
  const holes = E.courseOf(T, 'practice').holes;
  const c = blankCard();
  overs.forEach((o, h) => { if (o == null) return; c.raw[h] = holes[h].par + o; c.by[h] = 's1'; c.at[h] = 1; });
  T.scores['practice__' + pid] = c;
};
const readFor = (T, pid) => E.bandRead(T, 'practice').find(r => r.id === pid);

ok('nearest band rounds to the real four',
  [10, 17, 18, 22, 23, 28, 40].map(E.nearestBand), [15, 15, 20, 20, 25, 30, 30]);

/* A round at exactly +20 off a band of 20 is the band. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = 20;
  give(T, 'g1', Array.from({ length: 18 }, (_, i) => (i < 2 ? 2 : 1)));   // 16×1 + 2×2 = 20
  const r = readFor(T, 'g1');
  ok('a card at +20 reads as +20', r.projected, 20);
  ok('and a band of 20 is holding', r.verdict, 'right');
}

/* Nine shots clear of the band they chose. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = 20;
  give(T, 'g1', Array.from({ length: 18 }, () => 1).map((v, i) => (i < 11 ? 2 : 1)));  // 11×2 + 7×1 = 29
  const r = readFor(T, 'g1');
  ok('a card at +29 reads as +29', r.projected, 29);
  ok('off a band of 20 that is nine light', r.gap, 9);
  ok('and the card says band 30', [r.verdict, r.suggested], ['light', 30]);
}

/* More shots than the round asked for. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = 30;
  give(T, 'g1', Array.from({ length: 18 }, (_, i) => (i < 15 ? 1 : 0)));   // +15
  const r = readFor(T, 'g1');
  ok('a card at +15 off a band of 30 is heavy', [r.verdict, r.suggested], ['heavy', 15]);
}

/* THE CAP. One nine on a par four is seven strokes over; the tournament
   charges three. Reading the raw number would move a man two bands for a
   hole that was never going to cost him that. */
{
  const T = mkT();
  const holes = E.courseOf(T, 'practice').holes;
  T.config.people.find(p => p.id === 'g1').band = 20;
  const overs = Array.from({ length: 18 }, (_, i) => (i < 2 ? 2 : 1));     // +20 clean
  give(T, 'g1', overs);
  const clean = readFor(T, 'g1').projected;
  /* now wreck three holes, far past the cap */
  const c = T.scores['practice__g1'];
  [3, 7, 11].forEach(h => { c.raw[h] = holes[h].par + 8; });
  const r = readFor(T, 'g1');
  ok('three disasters do not move it past the cap', r.projected, clean + 3 * (T.config.capOver - 1));
  ok('and the capped holes are counted and shown', r.hitCap, 3);
  /* UNCAPPED those three holes read +8 apiece, which is +41 for the round
     and a band of 30 — two clear of where the man belongs, off three holes
     the tournament would have charged him three shots each for. Capped, the
     same card reads +26 and says 25. The cap does not make the disasters
     free; it stops them being counted at a price nobody will ever pay. */
  const raw = clean + 3 * (8 - 1);
  ok('uncapped, the same card would have said band 30', E.nearestBand(raw), 30);
  ok('capped, it says 25', r.suggested, 25);
  ok('which is one band of correction, not two', r.verdict, 'light');
}

/* A SHORT CARD IS PROJECTED. Nine holes at six over is not a band of six. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = 15;
  give(T, 'g1', Array.from({ length: 18 }, (_, i) => (i < 9 ? 1 : null)));  // +9 through 9
  const r = readFor(T, 'g1');
  ok('nine holes at +9 projects to +18', [r.played, r.over, r.projected], [9, 9, 18]);
  ok('which is a band of 20, not 15', [r.verdict, r.suggested], ['light', 20]);
}

/* Too little to say anything. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = 20;
  give(T, 'g1', Array.from({ length: 18 }, (_, i) => (i < 4 ? 1 : null)));
  ok('four holes is not a read', readFor(T, 'g1').verdict, 'thin');
}

/* Played, but never picked a band. */
{
  const T = mkT();
  T.config.people.find(p => p.id === 'g1').band = null;
  give(T, 'g1', Array.from({ length: 18 }, () => 1));
  const r = readFor(T, 'g1');
  ok('an unbanded card still gets a suggestion', [r.verdict, r.suggested], ['unset', 20]);
}

ok('a golfer who has not teed off is left out of it',
  E.bandRead(mkT(), 'practice').length, 0);

/* ---------------- on the page ---------------- */
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/brd.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/brd.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400); await shut();

console.log('\nband 30 is written down with the other three');
await tab('Rules');
const bands = await p.locator('.rows .row .who').allInnerTexts();
ok('all four bands are documented',
  ['Band 15', 'Band 20', 'Band 25', 'Band 30'].every(x => bands.some(t => t.trim() === x)), true);
const b30 = await p.locator('.rows .row', { hasText: 'Band 30' }).innerText();
ok('and band 30 says what it gives', /stroke index 1–12/.test(b30), true);

console.log('\nthe read, on a phone');
await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(70);
}
await p.waitForTimeout(400); await shut();
await tab('Scores');
await p.locator('.rcard.practice').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(300); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut(); }
for (let h = 0; h < 10; h++) {
  await shut();
  await p.locator('.hcell').nth(h).click(); await p.waitForTimeout(250); await shut();
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let i = 0; i < c; i++) { const taps = (i * 2 + h) % 4;
    for (let k = 0; k <= taps; k++) { await plus.nth(i).click(); await p.waitForTimeout(35); } }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(450);
}
await shut();
await tab('Boards');
await p.locator('.btab', { hasText: 'Practice Day' }).click(); await p.waitForTimeout(800); await shut();

/* THE READ IS BEHIND A BUTTON NOW, set as the day's recap is set. It is not
   reference material — it is the one thing on Practice Day somebody has to
   act on — so it gets a face on the board and opens into a window. */
ok('the board carries a button, not the read itself', await p.locator('.br-row').count(), 0);
const face = p.locator('.recapbtn', { hasText: 'The Band Read' });
ok('and the button is there', await face.count(), 1);
console.log('          (it reads: ' + (await face.locator('.rb-s').innerText()).trim() + ')');
/* Both this and the day's recap are the same panel, and on a phone they run
   the full width of the screen: a 3px corner against the bezel reads as a
   slab rather than a card. */
ok('and on a phone it has soft corners', await face.evaluate(
  el => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 12), true);
/* It is lit when there is something to do about it, dark when there is not —
   the same glow the recap uses, because it is the same promise. */
const lit = await face.evaluate(el => el.classList.contains('ready'));
const says = await face.locator('.rb-s').innerText();
ok('lit exactly when somebody needs moving',
  lit, /wrong band|no band yet|to move/i.test(says));

/* The card above the button is seven columns on a 390px phone, and the name
   was being squeezed to nothing and spilling sideways over the band next to
   it. A name must stay inside its own box, whatever else is in the row. */
ok('the day\'s card keeps the name inside its own column', await p.evaluate(() => {
  const row = document.querySelector('.pboard .row');
  if (!row) return 'no card on the board';
  const who = row.querySelector('.p-who');
  const spill = who.scrollWidth > who.clientWidth + 1;
  const cells = Array.from(row.children).map(c => c.getBoundingClientRect());
  const onTop = cells.some((c, i) => i && c.left < cells[i - 1].right - 0.5);
  return spill || onTop;
}), false);

console.log('\nand it opens into a window');
await face.click(); await p.waitForTimeout(600);
ok('the window is up', await p.locator('.brmodal').count(), 1);
ok('the read is inside it', await p.locator('.brmodal .br-row').count() > 0, true);
ok('and it still says it is a read, not a ruling',
  /read, not a ruling/i.test(await p.locator('.brmodal .br-lede').innerText()), true);
ok('every row carries a verdict',
  await p.locator('.brmodal .br-tag').count(), await p.locator('.brmodal .br-row').count());
ok('and the working under it',
  await p.locator('.brmodal .br-line').count(), await p.locator('.brmodal .br-row').count());

/* The verdict and the suggested band were landing on top of each other on a
   phone, because the tag was forced into the column the number uses. */
const overlap = await p.evaluate(() => {
  const r = document.querySelector('.brmodal .br-row');
  const next = r.querySelector('.br-next'), tag = r.querySelector('.br-tag');
  if (!next || !tag) return 'missing';
  const a = next.getBoundingClientRect(), c = tag.getBoundingClientRect();
  if (!a.width) return false;                       // nothing to collide with
  return !(a.right <= c.left + 0.5 || c.right <= a.left + 0.5);
});
ok('the suggested band and the verdict do not overlap', overlap, false);
ok('it fits the phone across', await p.evaluate(() => {
  const m = document.querySelector('.brmodal').getBoundingClientRect();
  return m.left >= -0.5 && m.right <= window.innerWidth + 0.5;
}), true);
ok('nothing runs off the side', await p.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1), false);

/* ---- THE VERDICT IS THE CONTROL ----
   Tapping it moves the golfer to the band his card asks for. Nowhere to go,
   nothing to find, and the window you were reading stays open. */
console.log('\ntaking the recommendation');
const act = p.locator('.brmodal .br-tag.act');
ok('a verdict that recommends a move can be tapped', await act.count() > 0, true);
if (await act.count()) {
  const row = p.locator('.brmodal .br-row').filter({ has: p.locator('.br-tag.act') }).first();
  const who = (await row.locator('.br-who').innerText()).split('\n')[0].trim();
  const wasBand = (await row.locator('.br-now b').innerText()).trim();
  const wants = (await row.locator('.br-next b').innerText()).trim();
  console.log('          (' + who + ' chose ' + wasBand + ', the card says ' + wants + ')');
  ok('and it is recommending a different band', wasBand === wants, false);

  const idx = await p.locator('.brmodal .br-row').evaluateAll((rows) =>
    rows.findIndex(r => r.querySelector('.br-tag.act')));
  /* Where we are standing, so the tap can be shown not to move us. */
  const whereBefore = await p.locator('.btab.on').innerText();
  await row.locator('.br-tag.act').click(); await p.waitForTimeout(700);

  const after = p.locator('.brmodal .br-row').nth(idx);
  ok('the window stayed open', await p.locator('.brmodal').count(), 1);
  ok('and it did not take us to another tab to do it',
    await p.locator('.btab.on').innerText(), whereBefore);
  ok('the golfer is on the band his card asked for',
    (await after.locator('.br-now b').innerText()).trim(), wants);
  ok('and the row now reads as holding',
    await after.evaluate(el => el.className.includes('br-right')), true);
  ok('the working says what just happened',
    /Moved to band /.test(await p.locator('.brmodal .br-line').nth(idx).innerText()), true);

  /* A tap that does the thing on the spot needs a way back from a wrong tap. */
  console.log('\nand a wrong tap has a way back');
  ok('an undo is offered', await p.locator('.brmodal .br-undo').count() > 0, true);
  await p.locator('.brmodal .br-line').nth(idx).locator('.br-undo').click();
  await p.waitForTimeout(700);
  ok('undo puts the band back',
    (await p.locator('.brmodal .br-row').nth(idx).locator('.br-now b').innerText()).trim(), wasBand);
  ok('and the verdict can be taken again',
    await p.locator('.brmodal .br-row').nth(idx).locator('.br-tag.act').count(), 1);
  await p.locator('.brmodal .br-row').nth(idx).locator('.br-tag.act').click();
  await p.waitForTimeout(700);

  /* IT EDITED THE ROSTER, not the window. That is the whole point: the tap
     does the thing, rather than showing you where to go and do it. */
  console.log('\nand the tap edited the roster, not the window');
  await p.locator('.brmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(500);
  await tab('Roster');
  /* The roster's names live in input fields, not in the row's text, so the
     row is found by what is typed in one — not by hasText, which reads the
     labels on the buttons and nothing else. */
  const onBand = await p.locator('.rtable tbody tr').evaluateAll((rows, name) => {
    const row = rows.find(r => Array.from(r.querySelectorAll('input'))
      .some(i => i.value.trim() === name));
    if (!row) return 'no row for ' + name;
    const on = row.querySelector('[data-act="setBand"].on');
    return on ? on.getAttribute('data-b') : null;
  }, who);
  ok('the roster itself carries the new band', onBand, wants);

  await tab('Boards');
  await p.locator('.btab', { hasText: 'Practice Day' }).click(); await p.waitForTimeout(700); await shut();
  await p.locator('.recapbtn', { hasText: 'The Band Read' }).click(); await p.waitForTimeout(600);
  ok('and a fresh open carries no stale undo', await p.locator('.brmodal .br-undo').count(), 0);
}

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
