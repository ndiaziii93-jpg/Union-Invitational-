/* SCORE ENTRY, ON A PHONE.
 *
 * The screen's job is one thing — put a number against a name on the hole
 * you are standing on — and it was asking for four hundred points of
 * scrolling before it let you. Four round cards, a row of group chips, a
 * hole head, a hole strip and a drawing of the fairway all sat above the
 * first golfer, and the one control you press on every hole was a banner
 * halfway down a page three and a half thousand points long.
 *
 * What it is now:
 *   - one line for where you are standing, and a sheet behind it;
 *   - a band of pine that STICKS, carrying the hole, the par, the index and
 *     all eighteen as a ribbon you can thumb;
 *   - the hole itself, lit, carrying what the group has already done;
 *   - and Save nailed to the foot, above the tabs, on every hole.
 *
 * Three of those are furniture that covers the page, so most of what is
 * tested here is that nothing they cover is lost: that the band stops
 * UNDER the strip rather than behind it, that the bar at the foot is one
 * row rather than three, and above all that neither of them swallows a tap
 * meant for the page. A fixed box pinned top AND bottom — which is what the
 * bar became when it inherited `top:0` from the rule for tablets — covers
 * the whole glass and eats every press on the screen behind it.
 *
 * The wider screens are not touched by any of this and the last block says
 * so: on a laptop the drawing is still beside the card, the round cards are
 * still there, and nothing is stuck to anything.
 *
 * Run: node tools/entry-phone-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

/* THE KEYPAD. A score goes in by tapping the golfer's tile and then the
   number on the pad that rises. These emulate n taps of the old plus or
   minus (from an empty cell the first plus landed on par, the first minus
   one under) so the arithmetic of every scenario below is unchanged. */
const __pad = async (pg, i, taps, dir) => {
  const tiles = pg.locator('.ptile[data-act="padOpen"]');
  if (await tiles.count() <= i) return;
  await tiles.nth(i).focus().catch(() => {}); await tiles.nth(i).dispatchEvent('click'); await pg.waitForTimeout(140);
  const kp = pg.locator('.keypad'); if (!await kp.count()) return;
  if (taps <= 0) return;
  const par = +(await kp.getAttribute('data-par')), cap = +(await kp.getAttribute('data-cap'));
  const curS = await kp.getAttribute('data-cur'); const cur = curS ? +curS : null;
  let v = cur == null ? par + (dir > 0 ? taps - 1 : -taps) : cur + dir * taps;
  v = Math.max(1, Math.min(cap, v));
  const key = kp.locator('.key[data-b="' + v + '"]'); await key.focus().catch(() => {}); await key.dispatchEvent('click'); await pg.waitForTimeout(120);
};
const __plus = (pg, i, taps = 1) => __pad(pg, i, taps, 1);
const __minus = (pg, i, taps = 1) => __pad(pg, i, taps, -1);
const __open = (pg, i) => __pad(pg, i, 0, 1);


const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const W = S + '/entry-phone.html';
writeFileSync(W, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* ================================ the phone ================================ */
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });

const shut = async () => { for (let i = 0; i < 8; i++) {
  if (!await p.locator('.scrim').count()) return;
  const m = p.locator('.scrim [data-act="modalCancel"], .scrim [data-act="modalOk"], .scrim .acts .btn');
  if (await m.count()) await m.first().click({ force: true }).catch(() => {});
  else await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(250); } };
/* A driver's own auto-scroll uses Chrome's scrollIntoViewIfNeeded, which
   knows nothing about sticky bands or fixed bars and parks a target against
   whichever edge is nearer. A thumb presses what it can see, so put the
   target in the middle of the glass and then press it. */
const tap = async loc => { await loc.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(140); await loc.click({ timeout: 10000 }); };
const box = s => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null;
  const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
  return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height),
    w: Math.round(r.width), pos: c.position, z: c.zIndex }; }, s);

await p.goto('file://' + W);
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(900); await shut();
await p.locator('.navbtn:visible', { hasText: 'Scores' }).first().click();
await p.waitForTimeout(800); await shut(); await p.waitForTimeout(300);

/* ---------- 1. what used to stand above the first golfer ---------- */
console.log('\nthe four hundred points above the first score');
ok('the four round cards are gone from the phone', await p.locator('.rcards:visible').count(), 0);
ok('so is the row of group chips', await p.locator('.grouprow:visible').count(), 0);
ok('and the hole head that repeated the band', await p.locator('.holehead:visible').count(), 0);
ok('one line stands for all of it', await p.locator('.setline:visible').count(), 1);
/* A button sizes itself to its words whatever its display is, so this is
   the one that has to be spelled out: it must run the full width. */
ok('and it runs the full width of the glass', await p.evaluate(() =>
  Math.round(document.querySelector('.setline').getBoundingClientRect().width) >= innerWidth - 1), true);
ok('the paragraph explaining gross and net stands down here',
  await p.locator('.page.scoring > .lede:visible').count(), 0);

/* ---------- 2. the sheet behind the line ---------- */
console.log('\nand the sheet it opens says the same two things in full');
await p.locator('.setline').click(); await p.waitForTimeout(600);
ok('every round is in it', await p.locator('.scrim .shlist').first().locator('.sh-row').count(), 4);
ok('with a tick against the one you are on', await p.locator('.scrim .sh-row.on .tick').first().innerText(), '✓');
ok('each group names who is in it', (await p.locator('.scrim .sh-row', { hasText: 'Group 1' }).first().innerText()).includes('Norberto III'), true);
ok('rows are a thumb tall', await p.evaluate(() =>
  [...document.querySelectorAll('.scrim .sh-row')].every(e => e.getBoundingClientRect().height >= 44)), true);
ok('and the sheet never runs off the glass', await p.evaluate(() => {
  const m = document.querySelector('.shmodal'); return m.getBoundingClientRect().height <= innerHeight; }), true);

/* move to the round that is played for something, and open it */
await p.locator('.scrim .sh-row', { hasText: /Round 1/ }).first().click();
await p.waitForTimeout(700); await shut();
ok('picking a round moves the line', (await p.locator('.setline').innerText()).toUpperCase().includes('ROUND 1'), true);

for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(300); await shut(); }
}
const g = p.locator('[data-act="openRound"]');
if (await g.count()) { await g.first().click({ force: true }); await p.waitForTimeout(900); await shut(); }
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(350);
ok('the round opens for scoring', await p.locator('.gate').count(), 0);

/* ---------- 3. the bar at the foot ---------- */
console.log('\nsave, nailed to the foot');
const sb = await box('.savebar');
ok('it is fixed, not a banner in the middle of the page', sb.pos, 'fixed');
ok('it sits above the tabs, not under them', sb.b < 844 && sb.b > 700, true);
/* The one that bit: the rule for tablets makes this sticky to top:0, and a
   fixed box that keeps that `top` while taking a `bottom` stretches the
   whole glass and swallows every press on the page behind it. */
ok('it is ONE row, not a full-height sheet', sb.h <= 80, true);
ok('and it does not reach the top of the glass', sb.t > 400, true);
ok('a tap meant for the page reaches the page', await p.evaluate(() => {
  const r = document.querySelector('.holeplate').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30);
  return !!hit && !!hit.closest('.holeplate'); }), true);

/* ---------- 4. the band of pine ---------- */
console.log('\nthe hole, at the head of the screen, and all eighteen with it');
ok('the band sticks', (await box('.entryhd')).pos, 'sticky');
ok('all eighteen are on the ribbon', await p.locator('.entryhd .hstrip .hcell').count(), 18);
await tap(p.locator('.entryhd .hcell').nth(2));
await p.waitForTimeout(600); await shut();
ok('thumbing to a hole moves the band', await p.locator('.ehd-n').innerText(), '3');
ok('and the ribbon lights the one you moved to', await p.locator('.entryhd .hcell.on .n').innerText(), '3');

await p.evaluate(() => scrollTo(0, 1400)); await p.waitForTimeout(500);
const hd = await box('.entryhd'), ts = await box('.topstrip');
ok('scrolled away, the band is still on the glass', hd.t >= 0 && hd.t < 200, true);
ok('it stops UNDER the strip rather than behind it', hd.t >= ts.b - 1, true);
ok('so the hole number is still readable', await p.evaluate(() => {
  const r = document.querySelector('.ehd-n').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && !!hit.closest('.entryhd'); }), true);
ok('and a press on the ribbon is not swallowed by the bar', await p.evaluate(() => {
  const r = document.querySelector('.entryhd .hcell').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && !!hit.closest('.entryhd'); }), true);

/* ---------- 5. the hole, carrying what the group has done ---------- */
console.log('\nthe plate, and the three of four already in');
await tap(p.locator('.entryhd .hcell').nth(0)); await p.waitForTimeout(600); await shut();
ok('the hole is drawn', await p.locator('.holeplate img:visible').count(), 1);
ok('nothing is in yet', (await p.locator('.hp-foot').innerText()).toLowerCase().includes('0 of 4 in'), true);
for (let i = 0; i < 3; i++) {
  await __plus(p, i, 4);
}
await p.locator('[data-act="saveHole"]').first().click(); await p.waitForTimeout(800); await shut();
await tap(p.locator('.entryhd .hcell').nth(0)); await p.waitForTimeout(700); await shut();
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
ok('three markers stand on the hole', await p.locator('.holeplate .hp-pill').count(), 3);
ok('each one names a golfer and his score',
  (await p.locator('.holeplate .hp-pill').first().innerText()).includes('Norberto III'), true);
ok('and the foot counts them', (await p.locator('.hp-foot').innerText()).toLowerCase().includes('3 of 4 in'), true);
ok('the ribbon marks the hole as scored', await p.locator('.entryhd .hcell.saved').count(), 1);
/* A hole where everyone off every band gets the same shot used to read
   "Tee +1 · +1 · +1 · +0". Each number is given once, and a nought is not
   a stroke. */
ok('the tee marker never says the same thing twice', await p.evaluate(() => {
  const e = document.querySelector('.hp-tee'); if (!e) return true;
  const n = e.innerText.match(/\+\d+/g) || [];
  return new Set(n).size === n.length && !n.includes('+0'); }), true);

/* ---------- 6. the workflow itself is untouched ---------- */
console.log('\nand the way a hole is scored has not moved');
ok('every golfer still has a way to score', await p.locator('.prow .ptile[data-act="padOpen"]').count(), 4);
ok('the score is still the big number on the row', await p.locator('.prow .fig.raw').count(), 4);
ok('the hole is still saved by hand', await p.locator('[data-act="saveHole"]').count(), 1);
ok('and marks are still one button', await p.locator('.savebar .markbtn').count(), 1);
ok('which still asks the whole question out loud',
  (await p.locator('.savebar .markbtn').getAttribute('aria-label')).includes('What happened'), true);
await p.screenshot({ path: S + '/entry-phone.png' });
await ctx.close();

/* ================================ the laptop ================================ */
console.log('\nand a laptop wears the same furniture, fitted to its room');
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 860 } });
const q = await ctx2.newPage();
await q.goto('file://' + W);
await q.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await q.waitForTimeout(900);
for (let i = 0; i < 8; i++) { const m = q.locator('.scrim [data-act="modalCancel"], .scrim [data-act="modalOk"], .scrim .acts .btn');
  if (!await q.locator('.scrim').count()) break;
  if (await m.count()) await m.first().click({ force: true }).catch(() => {}); await q.waitForTimeout(250); }
await q.locator('.tab:visible, .navbtn:visible', { hasText: 'Score Entry' }).first().click();
await q.waitForTimeout(800);
ok('the round cards are gone here too', await q.locator('.rcards:visible').count(), 0);
ok('and the row of group chips', await q.locator('.grouprow:visible').count(), 0);
ok('one line stands for both', await q.locator('.setline:visible').count(), 1);
ok('the band sticks at the head', await q.evaluate(() => getComputedStyle(document.querySelector('.entryhd')).position), 'sticky');
ok('with the par under every number', await q.locator('.entryhd .hcell .p:visible').count(), 18);
ok('the hole stands beside the rows', await q.evaluate(() => {
  const pl = document.querySelector('.egr .holeplate').getBoundingClientRect();
  const rows = document.querySelector('.egl').getBoundingClientRect();
  return pl.left > rows.right - 2 && pl.top < rows.bottom; }), true);
ok('whole, in a tall card', await q.evaluate(() => {
  const r = document.querySelector('.holeplate').getBoundingClientRect(); return r.height > r.width; }), true);
ok('and the card keeps its place while the rows scroll',
  await q.evaluate(() => getComputedStyle(document.querySelector('.egr')).position), 'sticky');
ok('the paragraph is still read on a laptop', await q.locator('.page.scoring > .lede:visible').count(), 1);
ok('the drawing beside the card is gone, the plate having taken its place', await q.locator('.cside:visible').count(), 0);
await q.screenshot({ path: S + '/entry-laptop.png' });

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
