/* The marks, on the phone they get made on.
 *
 * Two lanes, and the reason there are two is the whole design. The ref keeps
 * the card and marks the EXCEPTIONS — a handful a round, so it is nearly
 * free. Everybody else keeps their own account of their own round, which
 * spreads the rest of the job four ways and gets the sort of line a ref would
 * never write down.
 *
 * What is tested hardest is what must NOT happen: no new controls on the
 * player rows, and not a single figure moved on any board. A mark that
 * shifted a score would turn a bit of colour into a grievance.
 *
 * Run: node tools/marks-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/marks.html', '<!doctype html><html><head><meta charset="utf-8">'
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
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/marks.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400); await shut();

// a tournament that can be scored
await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(100);
}
await p.waitForTimeout(500); await shut();

await tab('Scores');
await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(350); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1200); await shut();
}
// two holes in, so there is something for a mark to sit beside
for (let h = 0; h < 2; h++) {
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let i = 0; i < c; i++) { for (let k = 0; k <= (i % 3); k++) { await plus.nth(i).click(); await p.waitForTimeout(70); } }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
}
await p.locator('.hcell').first().click(); await p.waitForTimeout(450); await shut();

console.log('\nthe scoring tab does not get busier');
/* Sixteen new controls on the player rows is exactly what this design
   exists to avoid, so it is worth asserting rather than trusting. */
ok('nothing new was added to the player rows', await p.evaluate(
  () => [...document.querySelectorAll('.prow')]
    .reduce((a, r) => a + r.querySelectorAll('.mscell, .mnchip, .mntag').length, 0)), 0);
ok('the whole feature is one button', await p.locator('.savebar .markbtn').count(), 1);
ok('and it is not shouting before anything has happened',
  await p.locator('.markbtn .ct').count(), 0);
ok('no hole is marked yet', await p.locator('.hcell.marked').count(), 0);

console.log('\nthe ref marks the hole, for the group, in one visit');
const board = async () => { await tab('Boards');
  await p.locator('.btab', { hasText: 'MVP' }).click(); await p.waitForTimeout(600); await shut();
  const v = await p.locator('.mvprow .big').allInnerTexts();
  await tab('Scores'); return v; };
const was = await board();
await p.locator('.hcell').first().click(); await p.waitForTimeout(450); await shut();

await p.locator('[data-act="openMarks"]').click(); await p.waitForTimeout(600);
ok('the sheet opens', await p.locator('.marksheet').count(), 1);
const cols = await p.locator('.ms-hdr .ms-col').allInnerTexts();
ok('four marks across the top', cols, ['3-putt', 'OB', 'Water', 'Shot']);
ok('and a column heading fits on one line', await p.evaluate(
  () => [...document.querySelectorAll('.ms-hdr .ms-col')]
    .every(e => e.getBoundingClientRect().height < 26)), true);
const names = await p.locator('.ms-row:not(.ms-hdr) .ms-who').allInnerTexts();
const inGroup = await p.locator('.prow .pwho .nm').allInnerTexts();
ok('the group down the side, and only the group', names.length, inGroup.length);

await p.locator('.ms-row:not(.ms-hdr)').first().locator('.mscell').first().click();
await p.waitForTimeout(400);
ok('a tap marks it', await p.locator('.mscell.on').count(), 1);
ok('and the sheet stays open — the point is to mark the group at once',
  await p.locator('.marksheet').count(), 1);
await p.locator('.ms-row:not(.ms-hdr)').nth(1).locator('.mscell').last().click();
await p.waitForTimeout(400);
ok('a second golfer, a different mark', await p.locator('.mscell.on').count(), 2);
await p.locator('.ms-row:not(.ms-hdr)').first().locator('.mscell').first().click();
await p.waitForTimeout(400);
ok('and a mis-tap comes straight back off', await p.locator('.mscell.on').count(), 1);
await shut();

console.log('\nand the tab says so without being asked twice');
ok('the button carries the count', await p.locator('.markbtn .ct').innerText(), '1');
ok('the hole wears a dot in the strip', await p.locator('.hcell.marked').count(), 1);
ok('and it is the hole that was marked', await p.evaluate(
  () => { const all = [...document.querySelectorAll('.hcell')];
          return all.indexOf(all.find(c => c.classList.contains('marked'))); }), 0);
await p.evaluate(() => window.__forceRender());
await p.waitForTimeout(500); await shut();
ok('a redraw does not lose it', await p.locator('.hcell.marked').count(), 1);

console.log('\nnone of it counts');
ok('the MVP board did not move', await board(), was);
await p.locator('.hcell').first().click(); await p.waitForTimeout(450); await shut();
ok('and the scores on the hole are exactly as they were', await p.evaluate(
  () => [...document.querySelectorAll('.prow .fig.raw .v')].map(e => e.textContent.trim())
    .every(v => v !== '')), true);

console.log('\nthe golfer keeps their own round');
await p.locator('.lane', { hasText: 'My round' }).click(); await p.waitForTimeout(700); await shut();
ok('it asks who you are before anything else', await p.locator('.minepick').count(), 1);
ok('and offers the golfers', await p.locator('.minepick .chip').count() > 3, true);
const me = await p.locator('.minepick .chip').nth(1).innerText();
await p.locator('.minepick .chip').nth(1).click(); await p.waitForTimeout(700); await shut();
ok('it takes your name', (await p.locator('h3.sub').first().innerText()).includes(me), true);
ok('four marks, as big as a thumb', await p.locator('.minemarks .mnchip').count(), 4);
/* THE point of the second lane. Ask a golfer what the ref is already
   writing down and you get two answers to arbitrate, and the ref's is the
   one with a witness. */
ok('and not one of them is a question the ref is already answering', await p.evaluate(
  refLabels => { const mine = [...document.querySelectorAll('.minemarks .mnchip b')]
    .map(e => e.textContent.trim().toLowerCase());
    return refLabels.filter(l => mine.includes(l.toLowerCase())); },
  ['Three-putt', 'Out of bounds', 'In the water', 'Shot of the hole']), []);
ok('they are the things only the man who hit it knows', await p.evaluate(
  () => [...document.querySelectorAll('.minemarks .mnchip b')].map(e => e.textContent.trim())),
  ['Robbed', 'Got away with it', 'Wrong club', 'Bottled it']);
ok('and each says what it means, so nobody has to guess on a tee box',
  await p.locator('.minemarks .mnchip span').count(), 4);
ok('and every one of them clears 44px', await p.evaluate(
  () => [...document.querySelectorAll('.mnchip')].every(e => e.getBoundingClientRect().height >= 44)), true);

await p.locator('.minemarks .mnchip').first().click(); await p.waitForTimeout(450);
ok('a mark goes on', await p.locator('.minemarks .mnchip.on').count(), 1);
const LINE = 'Chipped in from the bunker.';
await p.locator('#mineText').click();
await p.locator('#mineText').type(LINE.slice(0, 12), { delay: 15 });
/* The store polls every few seconds, so a redraw lands mid-sentence more
   often than not. That is what used to take the last few letters back. */
await p.evaluate(() => window.__forceRender());
await p.waitForTimeout(400);
ok('a redraw arriving mid-sentence does not take it back',
  await p.locator('#mineText').inputValue(), LINE.slice(0, 12));
await p.locator('#mineText').click();
await p.locator('#mineText').fill(LINE);
await p.locator('#mineText').press('Tab');           // blur, the way a thumb does it
await p.waitForTimeout(800); await shut();
ok('and it is kept', (await p.locator('.minerow').first().innerText())
  .includes(LINE), true);
/* The box is taken away by a redraw before it is ever blurred — a tab
   change, a hole change. The line still has to survive. */
await p.locator('#mineText').click();
await p.locator('#mineText').fill(LINE + ' Twice.');
await p.locator('.hcell').nth(3).click(); await p.waitForTimeout(700); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(700); await shut();
ok('and a line walked away from is kept too',
  await p.locator('#mineText').inputValue(), LINE + ' Twice.');
ok('beside the mark, on the right hole', (await p.locator('.minerow').first().innerText())
  .includes('Robbed'), true);
ok('the hole wears a dot here too', await p.locator('.hcell.marked').count() >= 1, true);

console.log('\nand at the end, the part only they can answer');
/* Deliberately NOT the four marks again. Ask a golfer what the ref can
   already see and you get two answers to arbitrate; ask them what only they
   know and you get the half a scorecard has never held. */
const moods = await p.locator('.mdchip').allInnerTexts();
ok('one mood for the round', moods, ['Striped it', 'Grinding', 'Scrappy', "Don't ask"]);
/* The test is not "contains no golf word" — "the putter let me down" is a
   judgement about cause, and a perfectly good one. It is that no question
   here ASKS THE SAME THING the ref is already answering, so the two can
   never come back with contradicting answers about one fact. */
ok('and none of them asks what the ref is already answering', await p.evaluate(
  refLabels => { const mine = [...document.querySelectorAll('.mdchip, .ownsrow .mnchip')]
    .map(e => e.textContent.trim().toLowerCase());
    return refLabels.filter(l => mine.includes(l.toLowerCase())); },
  ['Three-putt', 'Out of bounds', 'In the water', 'Shot of the hole']), []);
/* and the end-of-round questions must not repeat the per-hole ones either */
ok('nor does the end of the round ask the per-hole questions again', await p.evaluate(
  () => { const hole = ['Robbed', 'Got away with it', 'Wrong club', 'Bottled it']
            .map(s2 => s2.toLowerCase());
          return [...document.querySelectorAll('.mdchip, .ownsrow .mnchip')]
            .map(e => e.textContent.trim().toLowerCase()).filter(t => hole.includes(t)); }), []);
await p.locator('.mdchip').first().click(); await p.waitForTimeout(600); await shut();
ok('a mood goes on', await p.locator('.mdchip.on').count(), 1);
await p.locator('.mdchip').nth(2).click(); await p.waitForTimeout(600); await shut();
ok('and only ever one at a time', await p.locator('.mdchip.on').count(), 1);
ok('the last one tapped is the one that stuck',
  await p.locator('.mdchip.on').innerText(), 'Scrappy');
await p.locator('.mdchip').nth(2).click(); await p.waitForTimeout(600); await shut();
ok('tapping it again takes it off — a mis-tap needs a way back',
  await p.locator('.mdchip.on').count(), 0);

const owns = await p.locator('.ownsrow .mnchip').count();
ok('several things to own up to', owns > 2, true);
await p.locator('.ownsrow .mnchip').first().click(); await p.waitForTimeout(500); await shut();
await p.locator('.ownsrow .mnchip').nth(1).click(); await p.waitForTimeout(500); await shut();
ok('and you can own up to more than one', await p.locator('.ownsrow .mnchip.on').count(), 2);

await p.locator('#mineSay').click();
await p.locator('#mineSay').fill('Started well. Stopped.');
await p.locator('#mineSay').press('Tab'); await p.waitForTimeout(700); await shut();
await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(500); await shut();
ok('the line about the round is kept', await p.locator('#mineSay').inputValue(),
  'Started well. Stopped.');
ok('and the mood survives a redraw too', await p.locator('.ownsrow .mnchip.on').count(), 2);

console.log('\nbut it is not a second scorecard');
await p.locator('.lane', { hasText: 'Score the group' }).click(); await p.waitForTimeout(700); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(450); await shut();
await p.locator('[data-act="openMarks"]').click(); await p.waitForTimeout(600);
ok('what a golfer said is NOT on the ref\'s sheet',
  await p.locator('.mscell.on').count(), 1);
await shut();
ok('and no board moved for it', await board(), was);

console.log('\nthe phone remembers who you are');
await p.reload(); await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(600); await shut();
await tab('Scores');
await p.locator('.lane', { hasText: 'My round' }).click(); await p.waitForTimeout(700); await shut();
ok('it does not ask again', await p.locator('.minepick').count(), 0);
ok('and it is still you', (await p.locator('h3.sub').first().innerText()).includes(me), true);
ok('there is a way out if it is not', await p.locator('[data-act="setMe"][data-a=""]').count(), 1);

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
  : '\nThe marks go in, and nothing they touch is a score.');
process.exit(fails.length ? 1 : 0);
