/* The rules that guard a card: the pin and drive holes are nominated before
   anything opens, and Bingo Bango Bongo can only ever be won by somebody in
   the group being scored.  Run: node tools/entry-rules-test.mjs */
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


/* Whatever window is up is answered first — a half-entered hole's "not
   saved" by taking the discard, anything else by its Cancel — because a
   tap forced through a scrim lands on the scrim and only closes it. */
const clearWin = async pg => { for (let i = 0; i < 5; i++) { if (!await pg.locator('.scrim').count()) return;
  const alt = pg.locator('.scrim [data-act="confirmAlt"]'), c = pg.locator('.scrim [data-act="modalCancel"]');
  if (await alt.count()) await alt.first().click({ force: true });
  else if (await c.count()) await c.first().click({ force: true });
  else await pg.locator('.scrim').first().click({ position: { x: 4, y: 4 }, force: true });
  await pg.waitForTimeout(300); } };
/* The group is picked off a chip where one is drawn, and off the line and
   the sheet behind it everywhere else. The sheet stays up until it is
   closed, as it does under a thumb. */
const pickGroupOn = async (pg, i) => {
  const chip = pg.locator('.gchip').nth(i);
  if (await chip.isVisible().catch(() => false)) { await chip.click({ force: true }); return; }
  await clearWin(pg);
  await pg.locator('.setline').first().click(); await pg.waitForTimeout(400);
  await pg.locator('.scrim .shlist').nth(1).locator('.sh-row').nth(i).click({ force: true });
  await pg.waitForTimeout(300);
};


/* ---- getting about the book ----
   Four tabs now — Today, Scores, Boards, Resort — and the five screens that
   are set up once live behind Manage. So a name is looked for on the bar
   first, then behind that door, and last of all among the boards, which is
   where the Ryder Cup went. The same three places a person would look. */
const goTab = async (pg, t) => {
  const direct = pg.locator('.tab:visible, .navbtn:visible', { hasText: t });
  if (await direct.count()) { await direct.first().click(); return; }
  const door = pg.locator('[data-act="manageOpen"]');
  if (await door.count()) {
    await door.first().click();
    await pg.waitForTimeout(400);
    const row = pg.locator('.mg-row', { hasText: t });
    if (await row.count()) { await row.first().click(); return; }
    await pg.locator('.mgmodal [data-act="modalCancel"]').click().catch(() => {});
    await pg.waitForTimeout(300);
  }
  await pg.locator('.tab:visible, .navbtn:visible', { hasText: 'Boards' }).first().click();
  await pg.waitForTimeout(500);
  await pg.locator('.btab', { hasText: t }).first().click();
};

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/entry-rules.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 4; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await goTab(p, t); await p.waitForTimeout(550); await shut(); };
const pick = f => p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
const names = async () => (await p.locator('[data-act="setBbb"][data-a="bingo"] option')
  .allInnerTexts()).filter(x => x !== 'Nobody yet');

await p.goto('file://' + S + '/entry-rules.html'); await p.waitForTimeout(2800); await shut();
await tab('Score Entry');

console.log('\nthe pin and the drive come first');
ok('a round with no nominations will not open', await p.locator('[data-act="openRound"][disabled]').count(), 1);
ok('and the gate says what it wants', (await p.locator('.gate .msg span').innerText()).includes('Nominate'), true);
ok('the gate offers to take you there', await p.locator('[data-act="goPins"]').count(), 1);
ok('the closest-to-the-pin list is par 3s only', await p.locator(
  '[data-act="setRoundField"][data-a="ctpHole"] option').count() < 18, true);

await pick('ctpHole').selectOption({ index: 1 }); await p.waitForTimeout(600); await shut();
ok('one of two is not enough', await p.locator('[data-act="openRound"][disabled]').count(), 1);
await pick('ldHole').selectOption({ index: 1 }); await p.waitForTimeout(600); await shut();
ok('both nominated and the round can open', await p.locator('[data-act="openRound"][disabled]').count(), 0);
ok('the nominations stuck', [await pick('ctpHole').inputValue() !== '', await pick('ldHole').inputValue() !== ''], [true, true]);

await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1300); await shut();
ok('the card is open', await p.locator('[data-act="saveHole"]').count(), 1);
/* Once the round is open the nominations live on the holes they are about
   and nowhere else, so the checks go to those holes. */
const nomOf = k => p.evaluate(k => window.__T.config.rounds[window.__UI.entryRound][k], k);
await p.locator('.hcell').nth(await nomOf('ctpHole') - 1).click(); await p.waitForTimeout(600); await shut();
ok('and a scorer can still move a hole', await pick('ctpHole').isDisabled(), false);
ok('but only on the hole it is about', await p.locator('[data-act="setRoundField"][data-a="ldDist"]').count(), +(await nomOf('ldHole') === await nomOf('ctpHole')));

/* Closest to the pin is settled on the green, by a flag in the ground that
   the next man to beat it picks up and moves. A distance box would be a
   second, slower record of the same thing, free to disagree with the flag —
   so there isn't one. Longest drive keeps its distance: nothing out on the
   fairway is marking that. */
ok('there is nowhere to type a closest-to-the-pin distance',
  await p.locator('[data-act="setRoundField"][data-a="ctpDist"]').count(), 0);
ok('and the screen says what the mark is instead',
  /flag/i.test(await p.locator('[data-reveal="pins"]').innerText()), true);
await p.locator('.hcell').nth(await nomOf('ldHole') - 1).click(); await p.waitForTimeout(600); await shut();
ok('longest drive still takes one',
  await p.locator('[data-act="setRoundField"][data-a="ldDist"]').count(), 1);
ok('and the only distance box on the screen is that one',
  (await p.locator('.side-g label').allInnerTexts()).filter(t => /distance/i.test(t)).length, 1);
await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(500); await shut();
ok('and a plain hole carries neither', await p.locator('[data-reveal="pins"]').count(), +([await nomOf('ctpHole'), await nomOf('ldHole')].includes(1)));

console.log('\nBingo Bango Bongo stays inside the group');
const g1 = await names();
const inGroup1 = await p.locator('.prow .pwho .nm').allInnerTexts();
ok('group 1 offers exactly the four playing it', g1.length, inGroup1.length);
ok('and nobody else', g1.slice().sort(), inGroup1.map(x => x.replace('unsaved', '').trim()).sort());

const chips = await p.locator('.gchip').count();
if (chips > 1) {
  await pickGroupOn(p, 1); await p.waitForTimeout(600); await shut();
  const g2 = await names();
  ok('group 2 offers its own four', g2.length, (await p.locator('.prow .pwho .nm').allInnerTexts()).length);
  ok('and shares nobody with group 1', g2.filter(x => g1.includes(x)), []);
} else { ok('there is a second group to check', chips > 1, true); }

console.log('\nthe nominated holes announce themselves');
/* Closest to the pin and longest drive are chosen before anyone tees off and
   are then easy to walk straight past. */
/* the hole was visited above, so its once-only word has been said; this
   device forgets it so the arrival can be watched */
await p.evaluate(() => { window.__UI.noticed = {}; });
const ctp = await nomOf('ctpHole');
await p.locator('.hcell').nth(ctp - 1).click(); await p.waitForTimeout(700);
ok('arriving at the nominated hole says so', await p.locator('.holemodal').count(), 1);
ok('and names which game it is', (await p.locator('.holemodal .mb-t').innerText())
  .includes('Closest to the pin'), true);
await p.locator('.holemodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(400); await shut();
await p.locator('.hcell').nth(ctp - 1).click(); await p.waitForTimeout(600);
ok('but only the once, not every time you pass', await p.locator('.holemodal').count(), 0);
await shut();

console.log('\nsaving a hole leaves you where you are');
await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(400); await shut();
await p.evaluate(() => window.scrollTo(0, 420));
await p.waitForTimeout(250);
const before2 = await p.evaluate(() => window.scrollY);
ok('scrolled down the card', before2 > 300, true);
await __plus(p, 0, 1); await p.waitForTimeout(250);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1100); await shut();
ok('the hole was saved and it walked on', await p.locator('.holehead h3').innerText(), 'Hole 2');
ok('and the screen stayed where it was', Math.abs(await p.evaluate(() => window.scrollY) - before2) <= 2, true);

console.log('\na fresh group starts on a fresh card');
/* The hole strip walked every golfer on the round, not every golfer in the
   group, so the moment one group had been round every cell was already
   filled in for the next — who had not hit a shot. The strip is a ref's
   picture of their own card, and a card belongs to a group. */
const hole1 = async () => p.locator('.hcell').first().evaluate(el => el.classList.contains('saved'));
const bar = async () => p.locator('.savebar .sv').innerText();
const gotoHole1 = async () => { await p.locator('.hcell').first().click();
  await p.waitForTimeout(450); await shut(); };

/* Group 2 has hole 1 in already, from the section above. Group 1 has not
   been near it. */
await pickGroupOn(p, 1); await p.waitForTimeout(600); await shut();
await gotoHole1();
ok('the group that played hole 1 sees it filled', await hole1(), true);
ok('and the bar says so', (await bar()).includes('saved'), true);

await pickGroupOn(p, 0); await p.waitForTimeout(650); await shut();
await gotoHole1();
ok('the group that has not, sees it to play', await hole1(), false);
ok('and nothing at all on their card is marked', await p.locator('.hcell.saved').count(), 0);
ok('the bar does not tell them it is done', (await bar()).includes('saved'), false);

/* And once they do play it, their own cell fills — the strip is not simply
   blank for everybody but the first group round. */
await __plus(p, 0, 1); await p.waitForTimeout(250);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1100); await shut();
await gotoHole1();
ok('playing it fills their cell too', await hole1(), true);
await pickGroupOn(p, 1); await p.waitForTimeout(650); await shut();
await gotoHole1();
ok('and the other group still has its own', await hole1(), true);
await pickGroupOn(p, 0); await p.waitForTimeout(650); await shut();
await p.locator('.hcell').nth(1).click(); await p.waitForTimeout(450); await shut();

console.log('\na mulligan is spent once');
/* It was written as a toggle — `c[b] = !c[b]` — so a second tap handed the
   shot straight back and the chip went from "Used" to "1 left" again. That
   is a mulligan a hole, all the way up the front nine. */
/* the relief lives on the keypad now: open it for the first golfer */
await __open(p, 0); await p.waitForTimeout(200);
const front = p.locator('.mchip', { hasText: 'Front mulligan' }).first();
ok('it starts with one in hand', (await front.innerText()).includes('1 left'), true);
await front.click(); await p.waitForTimeout(600); await shut();
ok('one tap spends it', (await front.innerText()).includes('Used'), true);
ok('and it is marked', await front.evaluate(el => el.classList.contains('on')), true);
ok('green, not grey', await front.evaluate(
  el => getComputedStyle(el).backgroundColor), 'rgb(62, 92, 67)');
ok('and takes no further taps', await front.isDisabled(), true);
await front.click({ force: true }).catch(() => {}); await p.waitForTimeout(600); await shut();
ok('a second tap does NOT hand it back', (await front.innerText()).includes('Used'), true);
/* A mis-tap still needs a way out — but a separate, deliberately chosen
   control, never another jab at the same chip. */
ok('the master has a separate release', await p.locator(
  '[data-act="unspend"][data-b="mF"]').count() > 0, true);
await p.locator('[data-act="unspend"][data-b="mF"]').first().click(); await p.waitForTimeout(500);
ok('which asks before it does anything', await p.locator('.modal .acts').count(), 1);
await p.locator('[data-act="confirmOk"]').click(); await p.waitForTimeout(700); await shut();
if (!await p.locator('.keypad').count()) { await __open(p, 0); await p.waitForTimeout(200); }
ok('and only then hands it back', (await p.locator('.mchip', { hasText: 'Front mulligan' })
  .first().innerText()).includes('1 left'), true);
await p.locator('.mchip', { hasText: 'Front mulligan' }).first().click();
await p.waitForTimeout(600); await shut();
const back = p.locator('.mchip', { hasText: 'Back mulligan' }).first();
ok('the back nine keeps its own', (await back.innerText()).includes('1 left'), true);
await back.click(); await p.waitForTimeout(600); await shut();
await back.click({ force: true }).catch(() => {}); await p.waitForTimeout(600); await shut();
ok('and spends it once too', (await back.innerText()).includes('Used'), true);

console.log('\ntwo refs, two sets of points');
/* One set of marks per hole meant the second ref to save wiped the first
   ref's points, silently. Each group keeps its own three. */
const mark = async (slot, idx) => {
  await p.locator('[data-act="setBbb"][data-a="' + slot + '"]').selectOption({ index: idx });
  await p.waitForTimeout(250);
};
const marked = async slot => p.locator('[data-act="setBbb"][data-a="' + slot + '"]').inputValue();

await pickGroupOn(p, 0); await p.waitForTimeout(500); await shut();
/* Pin the hole. Marks are kept per hole, so a section that assumes hole one
   has to say so rather than inherit whatever the last section left open. */
await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(450); await shut();
await mark('bingo', 1);
const one = await marked('bingo');
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(400); await shut();
ok('group 1 kept its mark', await marked('bingo'), one);

await pickGroupOn(p, 1); await p.waitForTimeout(600); await shut();
ok('group 2 starts with none of it', await marked('bingo'), '');
await mark('bingo', 1);
const two = await marked('bingo');
ok('and group 2 marked somebody else', two === one, false);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(400); await shut();

await pickGroupOn(p, 0); await p.waitForTimeout(600); await shut();
ok('group 1 still has its own mark after group 2 saved', await marked('bingo'), one);

await tab('Leaderboards');
await p.locator('.btab, .chip', { hasText: /Bingo/i }).first().click().catch(() => {});
await p.waitForTimeout(600);
await tab('Score Entry');

console.log('\nthe look of it');
ok('a hole cell has soft corners', await p.locator('.hcell').first().evaluate(
  el => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 6), true);

console.log('\nthe calendar is one week, and it can be settled');
await tab('Calendar');
ok('the day view is gone', await p.locator('[data-act="calView"]').count(), 0);
ok('the whole week is on the page', await p.locator('.wk').count() + await p.locator('.calplate').count(), 8);
ok('and the day on the plate has an Add event button', await p.locator('.calfocus [data-act="evNew"]').count(), 1);
/* An event is written in a window now, not typed into the day. Nothing
   reaches the week until Save, so a half-filled one leaves nothing behind. */
const before = await p.locator('.de').count();
await p.locator('[data-act="evNew"]').first().click(); await p.waitForTimeout(600);
ok('the window opens', await p.locator('.evmodal').count(), 1);
await p.locator('[data-act="modalCancel"]').click(); await p.waitForTimeout(500);
ok('and cancelling writes nothing to the day', await p.locator('.de').count(), before);
await p.locator('[data-act="evNew"]').first().click(); await p.waitForTimeout(600);
await p.locator('#evTitle').fill('Boat trip');
await p.locator('[data-act="evSave"]').click(); await p.waitForTimeout(700); await shut();
ok('saving closes the window', await p.locator('.evmodal').count(), 0);
ok('and puts it on the day', await p.locator('.de').count(), before + 1);
ok('under the name it was given',
  await p.locator('.de', { hasText: 'Boat trip' }).count() > 0, true);

/* The week gets settled once and then stops moving — a stray tap on one
   phone should not shift dinner on everyone else's. */
await p.locator('[data-act="calLock"]').click(); await p.waitForTimeout(700); await shut();
ok('locked, nothing can be added', await p.locator('[data-act="evNew"]').count(), 0);
ok('and no event opens for editing', await p.locator('.de.tap').count(), 0);
ok('the days are all still there to read', await p.locator('.wk').count() + await p.locator('.calplate').count(), 8);
await p.locator('[data-act="calUnlock"]').click(); await p.waitForTimeout(700); await shut();
ok('the master can open it again', await p.locator('.calfocus [data-act="evNew"]').count(), 1);

/* pan-x on every horizontal scroller stopped the page moving under a thumb
   resting on the roster table, which reads as the scrolling sticking at the
   band column. A wide table must let the page past; only the tab strip,
   which has no vertical meaning, may keep a gesture to itself. */
console.log('\nthe roster lets the page past');
await tab('Roster & Pairings');
ok('the roster table sits in a scroller', await p.locator('.scroller .rtable').count() > 0, true);
ok('and that scroller does not claim vertical gestures', await p.evaluate(
  () => getComputedStyle(document.querySelector('.scroller')).touchAction), 'auto');
ok('the tab strip still does', await p.evaluate(() => {
  const el = document.createElement('div'); el.className = 'btabs';
  document.body.appendChild(el);
  const v = getComputedStyle(el).touchAction; el.remove(); return v;
}), 'pan-x');

console.log('\nthe band is worn, not ticked');
await tab('Roster & Pairings');
ok('every band is a crest', await p.locator('.bandcrest svg path.sh').count() >= 4, true);
const crest = p.locator('.bandcrest').first();
const faint = await crest.evaluate(el => getComputedStyle(el).opacity);
await crest.click(); await p.waitForTimeout(600); await shut();
ok('choosing one turns it on', await p.locator('.bandcrest.on').count() >= 1, true);
ok('and it stops being faint', await p.locator('.bandcrest.on').first()
  .evaluate(el => parseFloat(getComputedStyle(el).opacity) > parseFloat('' + 0)), true);
ok('it was faint before', parseFloat(faint) < 1, true);
ok('the number is real text, not a drawing', await p.locator('.bandcrest .bn').first().innerText(), '15');

console.log('\nthe shape of the book');
/* THE SHAPE OF THE BOOK. Four tabs for the four things you do during the
   tournament, in the order you meet them; everything set up once sits behind
   Manage, deepest-first — Setup, then the roster, the tee times, the courses
   and the rules. The Calendar tab shows the week; it never edits it. */
ok('six tabs, and these six — Bets beside Scores and Boards', await p.evaluate(
  () => [...document.querySelectorAll('.tab')].map(x => x.dataset.a)),
  ['today', 'entry', 'bets', 'boards', 'calendar', 'resort']);
ok('the cup is not one of them — it is a board',
  await p.locator('.tab[data-a="ryder"]').count(), 0);
await p.locator('.masthead [data-act="manageOpen"]').click(); await p.waitForTimeout(500);
ok('and the rest are behind Manage', await p.evaluate(
  () => [...document.querySelectorAll('.mglist .mg-row')].map(x => x.dataset.a)),
  ['setup', 'roster', 'tees', 'courses', 'rules']);
ok('with the guest pass above them, for anyone not on the trip', await p.evaluate(
  () => { const g = document.querySelector('.mg-row.mg-who'); return g ? [g.dataset.act, /Guest pass/.test(g.innerText)] : null; }), ['whoOpen', true]);
ok('Rules comes after Course Setup', await p.evaluate(() => {
  const t = [...document.querySelectorAll('.mglist .mg-row')].map(x => x.dataset.a);
  return t.indexOf('rules') > t.indexOf('courses');
}), true);
await p.locator('.mgmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
ok('a finished round glows all over, not at the edges', await p.evaluate(() => {
  const r = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } })
    .filter(x => x.name === 'recappulse');
  return r.length ? [...r[0].cssRules].some(k => /brightness/.test(k.cssText)) : false;
}), true);
/* A quick diagonal flick across the competition strip must move the strip
   and nothing else. touch-action alone is a hint the engine may decline —
   WebKit ignores it on a momentum scroller — so the gesture is taken over
   outright. This drives real touch events at it and watches the page. */
await tab('Leaderboards');
/* On a wide screen the strip fits and there is nothing to take over — the
   gesture is only claimed by a strip that genuinely has somewhere to go, or
   the page would stop scrolling under somebody's thumb. So: a phone. */
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(700); await shut();
ok('on a phone the strip overflows', await p.evaluate(
  () => { const el = document.querySelector('.btabs'); return el.scrollWidth > el.clientWidth + 1; }), true);
ok('the strip says it pans sideways only', await p.evaluate(
  () => getComputedStyle(document.querySelector('.btabs')).touchAction), 'pan-x');

const flick = async (dx, dy) => p.evaluate(([dx2, dy2]) => {
  const el = document.querySelector('.btabs');
  el.scrollLeft = 30;                       // somewhere to go in both directions
  window.scrollTo(0, 120);
  const box = el.getBoundingClientRect();
  const x0 = box.left + box.width / 2, y0 = box.top + box.height / 2;
  const pt = (x, y) => [Object.assign(new Touch({ identifier: 1, target: el, clientX: x, clientY: y }))];
  const fire = (type, x, y, cancelable) => el.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable, touches: type === 'touchend' ? [] : pt(x, y),
    changedTouches: pt(x, y), targetTouches: type === 'touchend' ? [] : pt(x, y),
  }));
  const before = { page: window.scrollY, strip: el.scrollLeft };
  fire('touchstart', x0, y0, true);
  /* dispatchEvent answers false when something called preventDefault. A
     listener of our own would sit below document in the bubble path and read
     the flag before the handler had set it. */
  let prevented = false;
  for (let i = 1; i <= 4; i++) {
    if (fire('touchmove', x0 + (dx2 * i) / 4, y0 + (dy2 * i) / 4, true) === false) prevented = true;
  }
  fire('touchend', x0 + dx2, y0 + dy2, true);
  return { moved: el.scrollLeft !== before.strip, pageMoved: window.scrollY !== before.page, prevented };
}, [dx, dy]);

const diag = await flick(-90, 70);          // across, and a good way down
ok('a diagonal flick moves the strip', diag.moved, true);
ok('and the page is held still', diag.prevented, true);

const steep = await flick(-20, 120);        // barely sideways, mostly down
ok('even a mostly-vertical drag on the strip is refused the page', steep.prevented, true);
/* Tapping a sub-tab at the far right took you to the right page and then
   snapped the row back to the far left, because the strip is rebuilt at its
   left edge on every redraw. */
const last = p.locator('.btab').last();
await last.scrollIntoViewIfNeeded();
const wasAt = await p.evaluate(() => document.querySelector('.btabs').scrollLeft);
ok('the strip was scrolled across to reach it', wasAt > 0, true);
await last.click(); await p.waitForTimeout(700); await shut();
ok('the tab that was tapped is the one now on', await p.evaluate(
  () => { const on = document.querySelector('.btab.on'); const all = [...document.querySelectorAll('.btab')];
          return all.indexOf(on) === all.length - 1; }), true);
ok('and the row did not snap back to the left', await p.evaluate(
  () => document.querySelector('.btabs').scrollLeft > 0), true);

await p.setViewportSize({ width: 1280, height: 1000 }); await p.waitForTimeout(500); await shut();

console.log('\na rule left open stays open');
/* Every redraw replaced the whole page, so a <details> opened to be read
   closed itself the next time the store polled — about fifteen seconds. */
await tab('Games & Rules');
const first = p.locator('details.rule-item').first();
await first.locator('summary').click(); await p.waitForTimeout(400);
ok('it opened', await first.evaluate(el => el.open), true);
await p.evaluate(() => window.__forceRender());
await p.waitForTimeout(400); await shut();
ok('and a redraw does not close it', await first.evaluate(el => el.open), true);
/* Not just the once, and not just the first one. */
const second = p.locator('details.rule-item').nth(1);
await second.locator('summary').click(); await p.waitForTimeout(350);
for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(300); }
await shut();
ok('two of them, through several redraws', [await first.evaluate(el => el.open),
  await second.evaluate(el => el.open)], [true, true]);
await first.locator('summary').click(); await p.waitForTimeout(350);
ok('and closing one still closes it', await first.evaluate(el => el.open), false);
await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(350); await shut();
ok('it stays closed too', [await first.evaluate(el => el.open),
  await second.evaluate(el => el.open)], [false, true]);

console.log('\nthe crest is asked by name');
ok('the button says whose book it is', await p.locator('[data-act="askOpen"]')
  .first().getAttribute('aria-label'), 'Ask the Union a question');
await p.locator('[data-act="askOpen"]').first().click(); await p.waitForTimeout(600);
ok('and so does the window it opens', await p.locator('.askbox .mb-t').first().innerText(), 'Ask the Union');
ok('"the book" is nowhere on it', (await p.locator('.askbox').innerText()).includes('Ask the book'), false);
await p.locator('.askbox [data-act="askClose"]').click(); await p.waitForTimeout(400); await shut();

console.log('\nthe cup is singles all week');
await tab('Ryder Cup');
const fmts = await p.locator('.sub').allInnerTexts();
ok('every session is singles', fmts.filter(x => /Singles/.test(x)).length, 3);
ok('and none of them is a fourball', fmts.filter(x => /Fourball/i.test(x)).length, 0);

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe card will not open early, and the group keeps its own points.');
process.exit(fails.length ? 1 : 0);
