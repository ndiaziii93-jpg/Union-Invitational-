/* Why a match stands where it does.
 *
 * The pill on a cup row says "3&2", which answers a question nobody asked.
 * What gets asked at dinner is HOW — and the how is arithmetic nobody does
 * in their head: gross, capped at triple bogey, less the strokes your band
 * gives on that hole's index, lower net takes the hole.
 *
 * So the pill opens the working. What matters here is that the working
 * AGREES with the cup: the holes won in the window must add up to the
 * result on the row, because two ways of counting the same match is exactly
 * the sort of thing that starts an argument at Mandatory Team Beers.
 *
 * Run: node tools/match-why-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/mw.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });

const shut = async () => { for (let i = 0; i < 6; i++) {
  if (await p.locator('.mwmodal').count()) return;
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/mw.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400); await shut();

console.log('\nthe rules say how the cup is scored');
await tab('Rules');
const intro = await p.locator('.notice').first().innerText();
ok('the screen says the games count different currencies', /different currencies/i.test(intro), true);
ok('and names what the cup counts', /holes won/i.test(intro), true);
await p.locator('#rule-ryder summary').click(); await p.waitForTimeout(400);
const ryder = await p.locator('#rule-ryder .rule-body').innerText();
for (const [what, re] of [
  ['the cap comes off before the strokes', /cap it at triple bogey first/i],
  ['a point a match, half for a half', /half each/i],
  ['twelve points and six and a half to win', /twelve points.*six and a half/is],
  ['that strokes are NOT the cup', /strokes are not the cup/i],
  ['that the pairings do not feed it', /never from pairs/i],
  ['and that you can tap a match to see the working', /tap the result/i],
]) ok('it explains ' + what, re.test(ryder), true);

console.log('\nsquads, a card, and a match to ask about');
await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(80);
}
await p.waitForTimeout(400); await shut();
await tab('Ryder');
const sq = p.locator('[data-act="cycleSquad"]'); const nsq = await sq.count();
for (let i = 0; i < nsq; i++) { const t = (i % 2) ? 2 : 1;
  for (let k = 0; k < t; k++) { await sq.nth(i).click(); await p.waitForTimeout(80); } }
await p.waitForTimeout(500); await shut();

await tab('Scores');
await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(320); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut(); }

const groups = await p.locator('.gchip').count();
for (let g = 0; g < groups; g++) {
  await p.locator('.gchip').nth(g).click(); await p.waitForTimeout(450); await shut();
  for (let h = 0; h < 6; h++) {
    await shut();
    await p.locator('.hcell').nth(h).click(); await p.waitForTimeout(300); await shut();
    const plus = p.locator('.step.plus'); const c = await plus.count();
    for (let i = 0; i < c; i++) { for (let k = 0; k <= ((i + h) % 4); k++) {
      await plus.nth(i).click(); await p.waitForTimeout(45); } }
    await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(550);
  }
}
await shut();

console.log('\nthe pill is the way in');
await tab('Ryder');
const pills = p.locator('.match .st.why');
ok('every match with a hole in it can be asked about', await pills.count() > 0, true);
ok('the pill is a button, not a label',
  await pills.first().evaluate(el => el.tagName), 'BUTTON');
ok('and says what it opens', /hole by hole/i.test(
  await pills.first().getAttribute('aria-label') || ''), true);

const rowText = (await p.locator('.match').first().innerText()).replace(/\n/g, ' ');
console.log('          (the row reads: ' + rowText.trim() + ')');
await pills.first().click(); await p.waitForTimeout(700);
ok('it opens the working', await p.locator('.mwmodal').count(), 1);

console.log('\nand the working agrees with the row');
const verdict = (await p.locator('.mw-v').innerText()).trim();
console.log('          (the verdict reads: ' + verdict + ')');
const tally = await p.locator('.mw-tally b').allInnerTexts();
const [wonA, halved, wonB] = tally.map(Number);
const holes = await p.locator('.mw-row').count();
ok('every hole played is shown', wonA + halved + wonB, holes);
/* The lead in the window must be the lead on the row — two ways of counting
   one match is how arguments start. */
const lead = Math.abs(wonA - wonB);
ok('the holes won account for the lead', new RegExp(lead === 0 ? 'all square|halved' : String(lead)).test(verdict), true);

ok('each hole shows what came off the gross',
  /less \d|no shot/i.test(await p.locator('.mw-row').first().innerText()), true);
ok('the hole that was taken is marked', await p.locator('.mw-s.win').count() > 0, true);
ok('and it says what the match is worth',
  /point|banked/i.test(await p.locator('.mw-w').innerText()), true);
/* A match still on the course has paid nobody. */
ok('a match still out has banked nothing',
  /Nothing banked yet/i.test(await p.locator('.mw-w').innerText()), true);
ok('the working says where the numbers came from',
  /stroke index/i.test(await p.locator('.mw-note').innerText()), true);
ok('and it fits the phone', await p.evaluate(() => {
  const m = document.querySelector('.mwmodal').getBoundingClientRect();
  return m.left >= -0.5 && m.right <= window.innerWidth + 0.5 && m.height <= window.innerHeight;
}), true);
ok('no sideways scroll', await p.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1), false);

await p.locator('.mwmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
ok('it closes', await p.locator('.mwmodal').count(), 0);
ok('and leaves the cup behind it', await p.locator('.match').count() > 0, true);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
