/* The three that get forgotten.
 *
 * Bingo Bango Bongo is three points a hole and the only thing on the card
 * that cannot be reconstructed afterwards. A stroke lives on a scorecard in
 * somebody's pocket; who was first on the green at the 7th is gone the
 * moment the group walks to the 8th tee.
 *
 * So saving a hole with any of the three blank says so, while the group is
 * still standing on the green. What is tested hardest is the restraint:
 * it is raised by SAVING and by nothing else, it does not fire on a hole
 * that is marked, and on the 18th it must stand in FRONT of the crest
 * rather than in place of it.
 *
 * Run: node tools/bbb-alert-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/bbb.html', '<!doctype html><html><head><meta charset="utf-8">'
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

/* Clear anything up EXCEPT the two windows under test. */
const shut = async () => { for (let i = 0; i < 6; i++) {
  if (await p.locator('.bbbmodal, .finishmodal').count()) return;
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/bbb.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400); await shut();

await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(80);
}
await p.waitForTimeout(400); await shut();

await tab('Scores');
await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(320); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut();
}

/* Clear the way first: walking on from a saved hole can put up the word
   about a nominated one, and a scrim swallows the tap on the hole strip. */
const gotoHole = async i => { await shut(); await p.locator('.hcell').nth(i).click();
  await p.waitForTimeout(420); await shut(); };
const score = async () => { await shut(); const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let i = 0; i < c; i++) { await plus.nth(i).click(); await p.waitForTimeout(60); } };
const save = async () => { await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); };
const setBbb = async (k, idx) => { await p.locator('[data-act="setBbb"][data-a="' + k + '"]')
  .selectOption({ index: idx }); await p.waitForTimeout(250); };

console.log('\nsaving a hole with nothing marked says so');
ok('no window before anything is saved', await p.locator('.bbbmodal').count(), 0);
await score();
ok('and entering strokes alone does not raise it', await p.locator('.bbbmodal').count(), 0);
await save();
ok('saving does', await p.locator('.bbbmodal').count(), 1);
ok('it names the hole', (await p.locator('.bbbmodal .hm-eye').innerText()).trim(), 'HOLE 1');   // the strip is uppercased by the stylesheet
ok('and says none of the three is marked',
  /no bingo bango bongo/i.test(await p.locator('.bbbmodal h3').innerText()), true);
ok('it offers a way to go and do it', await p.locator('[data-act="bbbGo"]').count(), 1);
ok('and a way to say there is nothing to mark',
  (await p.locator('.bbbmodal [data-act="modalCancel"]').innerText()).trim(), 'Nothing to mark');
/* It is a notice about a hole that SAVED. A red rule is the book's way of
   saying something is wrong or unsaved, and nothing here is either. */
ok('it does not read as a failure', await p.locator('.bbbmodal').evaluate(
  el => getComputedStyle(el).borderTopColor), 'rgb(140, 107, 47)');

console.log('\nMark them now goes back to the hole, at the boxes');
ok('the save had walked on to hole 2', await p.locator('.holehead h3').innerText(), 'Hole 2');
await p.locator('[data-act="bbbGo"]').click(); await p.waitForTimeout(700);
ok('and it walks back to hole 1', await p.locator('.holehead h3').innerText(), 'Hole 1');
ok('the window is gone', await p.locator('.bbbmodal').count(), 0);
ok('the three boxes are on screen', await p.locator('[data-act="setBbb"]').count(), 3);
ok('and the hole is still saved', /saved/i.test(await p.locator('.savebar .sv b').innerText()), true);

console.log('\na hole that IS marked is left alone');
for (const k of ['bingo', 'bango', 'bongo']) await setBbb(k, 1);
/* Choosing a name must wake the save bar up. The redraw used to be held
   back for any focused select — the wheel might be open — and a select that
   has just fired `change` has a shut wheel, so the bar sat there saying the
   hole was saved and Save hole stayed greyed out. The first tap on it did
   nothing, which is a poor reward for being sent here by a notice. */
ok('marking them wakes the bar up', await p.locator('.savebar.dirty').count(), 1);
ok('and Save hole can actually be pressed',
  await p.locator('[data-act="saveHole"]').isDisabled(), false);
await save();
ok('saving a fully marked hole says nothing', await p.locator('.bbbmodal').count(), 0);

console.log('\nand a partly marked one names only what is missing');
await gotoHole(2);
await score();
await setBbb('bingo', 1);
await save();
ok('it still asks', await p.locator('.bbbmodal').count(), 1);
const heading = await p.locator('.bbbmodal h3').innerText();
console.log('          (it reads: ' + heading + ')');
ok('it does not mention the one that is marked', /bingo/i.test(heading), false);
ok('it names Bango', /bango/i.test(heading), true);
ok('and Bongo', /bongo/i.test(heading), true);
await p.locator('.bbbmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(500);
ok('Nothing to mark closes it', await p.locator('.bbbmodal').count(), 0);
ok('and nothing else comes up behind it', await p.locator('.scrim').count(), 0);

console.log('\nwalking the holes never asks — only saving does');
await gotoHole(6); await gotoHole(7); await gotoHole(0);
ok('reading back through the card is silent', await p.locator('.bbbmodal').count(), 0);

console.log('\non the 18th it stands in front of the crest, not instead of it');
await gotoHole(17);
await score();
await save();
ok('the three come first', await p.locator('.bbbmodal').count(), 1);
ok('and the crest is not up yet', await p.locator('.finishmodal').count(), 0);
await p.locator('.bbbmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(700);
ok('closing them hands over to the crest', await p.locator('.finishmodal').count(), 1);

/* The scrim is another way out of the same window, and it must not lose the
   crest queued behind it. */
await p.locator('.finishmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
await p.locator('.step.plus').first().click(); await p.waitForTimeout(200);
await save();
ok('saving the 18th again asks about the three again', await p.locator('.bbbmodal').count(), 1);
await p.locator('.scrim').click({ position: { x: 5, y: 5 } }); await p.waitForTimeout(700);
ok('and dismissing it on the scrim still hands over', await p.locator('.finishmodal').count(), 1);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
