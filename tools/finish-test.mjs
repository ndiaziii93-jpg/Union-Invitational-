/* Finishing a round, group by group.
 *
 * The thing under test is not the animation. It is that ONE group finishing
 * closes ONE card: Group 1 walks off 18 an hour and a half before Group 3,
 * and for that hour and a half Group 3 must still be able to score. A finish
 * that locked the round for everybody would be the old Lock and conclude
 * wearing a crest.
 *
 * Also tested: that the window is raised by SAVING the 18th and by nothing
 * else — arriving at the hole, or saving the 17th, must not ask — that Not
 * yet does not nag, that saving the 18th again brings it back, and that a
 * finished card refuses a score rather than merely hiding the buttons.
 *
 * Run: node tools/finish-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/finish.html', '<!doctype html><html><head><meta charset="utf-8">'
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

/* Dismiss whatever is up — but never the finish window, which several
   assertions need to still be there. */
const shut = async () => { for (let i = 0; i < 6; i++) {
  if (await p.locator('.finishmodal').count()) return;
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/finish.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400); await shut();

// bands, so every card can be scored
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

const groupCount = await p.locator('.gchip').count();
ok('the card is split into real groups to finish', groupCount > 1, true);

/** Put a whole group's scores into the hole the screen is on, and save it. */
const scoreAndSave = async () => {
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let i = 0; i < c; i++) { await plus.nth(i).click(); await p.waitForTimeout(60); }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(800); await shut();
};
const gotoHole = async i => { await p.locator('.hcell').nth(i).click(); await p.waitForTimeout(420); await shut(); };
const group = async i => { await p.locator('.gchip').nth(i).click(); await p.waitForTimeout(500); await shut(); };

console.log('\nthe window is raised by the 18th and nothing else');

await group(0);
await gotoHole(16);                           // the 17th
await scoreAndSave();
ok('saving the 17th does not ask', await p.locator('.finishmodal').count(), 0);

// saving the 17th walks on to the 18th by itself
ok('and walks on to the 18th', await p.locator('.holehead h3').innerText(), 'Hole 18');
ok('arriving at the 18th does not ask either', await p.locator('.finishmodal').count(), 0);

await scoreAndSave();
ok('saving the 18th raises it', await p.locator('.finishmodal').count(), 1);
ok('it asks the question', (await p.locator('.finishmodal .fm-q').innerText()).trim(), 'Finish Round?');
const eyebrow = (await p.locator('.finishmodal .fm-eye').innerText()).trim();
console.log('          (the eyebrow reads: ' + eyebrow + ')');
ok('over the right group', /^GROUP 1\b/i.test(eyebrow), true);
ok('with the crest in it', await p.locator('.finishmodal .fm-crest img').count(), 1);
ok('and the halo that glows', await p.locator('.finishmodal .fm-crest .halo').count(), 1);
ok('it does not claim to be the last group', await p.locator('.finishmodal .fm-last').count(), 0);

/* The halo is an animation, not a still picture. Read it off the page
   rather than off the stylesheet, so a rule that never matched is caught. */
const anim = await p.locator('.finishmodal .fm-crest .halo')
  .evaluate(el => { const c = getComputedStyle(el); return [c.animationName, c.animationDuration]; });
ok('the halo breathes', anim, ['finishBreath', '2.6s']);

console.log('\nNot yet means not yet, not never');
await p.locator('.finishmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(500);
ok('Not yet closes it', await p.locator('.finishmodal').count(), 0);
ok('the card is still open', await p.locator('[data-act="saveHole"]').count(), 1);
ok('and the bar keeps a way back in', await p.locator('[data-act="askFinish"]').count(), 1);
ok('which says what it does', (await p.locator('[data-act="askFinish"]').innerText()).trim(), 'Finish round');

/* A score on the 18th corrected after the window was waved away must bring
   it back — otherwise the correction is the last anybody hears of it. */
await p.locator('.step.plus').first().click(); await p.waitForTimeout(150);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(800);
/* The three names come first on every save now; shut() waves them past and
   stops at the crest behind them. */
await shut();
ok('editing the 18th and saving again asks once more', await p.locator('.finishmodal').count(), 1);

console.log('\none group finishes, one card closes');
/* A golfer on THIS card, noted while the controls are still live — what a
   page left open in somebody's pocket would still be holding. The window is
   waved away to read it, then raised again from the bar. */
await p.locator('.finishmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
const pid0 = await p.locator('.step.plus').first().getAttribute('data-a');
await p.locator('[data-act="askFinish"]').click(); await p.waitForTimeout(450);
await p.locator('.finishmodal [data-act="finishGroup"]').click(); await p.waitForTimeout(900); await shut();

ok('the bar says the group has finished',
  /has finished/.test(await p.locator('.savebar.done .sv b').innerText()), true);
ok('there is nothing left to save', await p.locator('[data-act="saveHole"]').count(), 0);
ok('and no way to put a stroke on the card', await p.locator('.step.plus').count(), 0);
ok('but a way to undo it', await p.locator('[data-act="reopenGroup"]').count(), 1);
ok('the mulligans take no more taps',
  await p.locator('.mchip:not([disabled])').count(), 0);
ok('and the group\u2019s Bingo Bango Bongo is shut with it',
  await p.locator('[data-act="setBbb"]:not([disabled])').count(), 0);

/* The heart of it. Group 2 is still on the course. */
await group(1);
ok('the next group is still scoring', await p.locator('[data-act="saveHole"]').count(), 1);
ok('with their buttons intact', await p.locator('.step.plus').count() > 0, true);
ok('and no finished bar over them', await p.locator('.savebar.done').count(), 0);
ok('nor a window asking them anything', await p.locator('.finishmodal').count(), 0);

console.log('\na finished card refuses the write, not just the button');
/* The buttons are gone from the screen, which is not the same as the store
   saying no. A page left open in a pocket still carries live handlers — and
   the hardest version of it is a control naming a FINISHED golfer, tapped
   while the screen is on the group still out on the course. Guarding the
   screen alone lets that through. */
await group(0);
const was = await p.locator('.prow').first().locator('.fig.raw .v').innerText();
await group(1);                                        // the group still playing
await p.evaluate(id => {
  const b = document.createElement('button');
  b.id = 'plantedBump';
  b.setAttribute('data-act', 'bump');
  b.setAttribute('data-b', '1');
  b.setAttribute('data-a', id);
  b.style.cssText = 'position:fixed;left:4px;top:4px;width:60px;height:30px;z-index:99999';
  /* inside #app, where the page's own delegated handler will hear it —
     a button on document.body is heard by nobody and proves nothing */
  document.getElementById('app').appendChild(b);
}, pid0);
ok('a stale control can be planted on the page', await p.locator('#plantedBump').count(), 1);
await p.locator('#plantedBump').click({ force: true }); await p.waitForTimeout(450);
ok('pressing it leaves nothing waiting to be saved', await p.locator('.savebar.dirty').count(), 0);

await p.evaluate(() => { const b = document.getElementById('plantedBump'); if (b) b.remove(); });
await group(0);
ok('the finished card is untouched', await p.locator('.prow').first().locator('.fig.raw .v').innerText(), was);
ok('and nothing on it is marked unsaved', await p.locator('.prow.pending').count(), 0);
ok('it is still a finished card', await p.locator('.savebar.done').count(), 1);

console.log('\nreopening hands the card back');
await p.locator('[data-act="reopenGroup"]').click(); await p.waitForTimeout(800); await shut();
ok('the group is scoring again', await p.locator('[data-act="saveHole"]').count(), 1);
ok('the finished bar is gone', await p.locator('.savebar.done').count(), 0);

console.log('\nthe last group off closes the round');
// finish every group
const gs = await p.locator('.gchip').count();
for (let i = 0; i < gs; i++) {
  await group(i);
  if (!await p.locator('[data-act="askFinish"]').count()) {
    await gotoHole(17);
    if (!await p.locator('[data-act="askFinish"]').count()) await scoreAndSave();
  }
  if (await p.locator('.finishmodal').count() === 0) {
    await p.locator('[data-act="askFinish"]').click(); await p.waitForTimeout(500);
  }
  if (i === gs - 1) ok('the last one says so', await p.locator('.finishmodal .fm-last').count(), 1);
  await p.locator('.finishmodal [data-act="finishGroup"]').click(); await p.waitForTimeout(900); await shut();
}
const gateTxt = await p.locator('.gate .msg b').count() ? await p.locator('.gate .msg b').first().innerText() : '';
ok('the round is concluded behind them', /is locked/.test(gateTxt), true);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
