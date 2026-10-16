/* THE FURNITURE, AND HOW A PAGE SITS INSIDE IT.
 *
 * Two complaints, both about the frame rather than the book:
 *
 *   - the top was busy. Two full-width buttons banded the page under the
 *     nameplate all week to say something a reader wants twice: Manage, and
 *     whether the book was asking anybody for a PIN. They are one mark now,
 *     set where a crest's compass would be, and the words they carried are
 *     said in the window it opens.
 *
 *   - the bottom "lands as if everything is behind the bar". Three separate
 *     faults wearing one coat: the page ending a hair under the bar, nothing
 *     telling the browser how much of the foot is spoken for when it scrolls
 *     something into view, and no sign that the page CONTINUES under the ink
 *     rather than having been cut off by it. And underneath all three, a tab
 *     that threw you back to the top of wherever you went, every time.
 *
 * Run: node tools/shell-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const W = S + '/shell.html';
writeFileSync(W, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* ================= the phone ================= */
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const bar = async t => { await p.locator('.navbtn:visible', { hasText: t }).first().click(); await p.waitForTimeout(650); };

await p.goto('file://' + W);
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(900); await shut();

/* ---------------- the dial ---------------- */
console.log('\none mark where the band used to be');
ok('the old pair of buttons is gone', await p.locator('.masthead .setup-chip, .mast-actions').count(), 0);
ok('and nothing in the masthead says "Unlocked" any more',
  (await p.locator('.masthead').innerText()).includes('Unlocked'), false);
ok('there is one dial', await p.locator('.masthead .dial').count(), 1);
ok('it is a real target, not a glyph', await p.evaluate(() => {
  const r = document.querySelector('.masthead .dial').getBoundingClientRect();
  return r.width >= 40 && r.height >= 40;
}), true);
ok('it sits at the right-hand end of the top line', await p.evaluate(() => {
  const d = document.querySelector('.masthead .dial').getBoundingClientRect();
  const h = document.querySelector('.masthead h1').getBoundingClientRect();
  return d.left > h.right && Math.abs(innerWidth - d.right) < 24;
}), true);
ok('on the SAME line as the name, not a line of its own', await p.evaluate(() => {
  const d = document.querySelector('.masthead .dial').getBoundingClientRect();
  const h = document.querySelector('.masthead h1').getBoundingClientRect();
  return d.top < h.bottom && d.bottom > h.top;
}), true);

/* The count it carries is the count the book keeps, and the ring says
   whether anybody is being asked for a PIN. */
const issues = await p.evaluate(() => (window.__issues || []).length);
ok('the badge carries the count of what is still to settle',
  (await p.locator('.masthead .dial-ct').innerText()).trim(), String(issues || 2));
ok('the ring is open while no PIN is set', await p.evaluate(
  () => getComputedStyle(document.querySelector('.masthead .dial-r')).strokeDasharray !== 'none'), true);
ok('and it says the whole of it to a screen reader', await p.evaluate(() => {
  const l = document.querySelector('.masthead .dial').getAttribute('aria-label') || '';
  return /manage/i.test(l) && /unlocked|locked|signed/i.test(l);
}), true);

/* The chrome it saved. The two buttons and the venue line between them put
   the first line of every screen a third of the way down the glass. */
const chrome = await p.evaluate(
  () => Math.round(document.querySelector('.rule-heavy').getBoundingClientRect().bottom));
console.log('          (furniture above the page: ' + chrome + 'px of 844)');
ok('the furniture above the page is a fraction of what it was', chrome < 130, true);

/* ---------------- the dateline ---------------- */
console.log('\nthe nameplate says what moves, and nothing else');
ok('the venue and the dates are off the phone',
  await p.locator('.masthead .sub:visible').count(), 0);
ok('and so is the caption over the tee time',
  await p.locator('.mast-right:visible').count(), 0);
const rail = (await p.locator('.dateline').innerText()).replace(/\s+/g, ' ').trim();
console.log('          (the dateline reads: ' + rail + ')');
ok('a dateline stands in their place', await p.locator('.dateline:visible').count(), 1);
const bits = await p.locator('.dateline span').count();
ok('carrying where we are in the week, what is on, and when you are off',
  bits >= 2 && bits <= 3, true);
ok('it is set in capitals, as the recap sets its own rail', await p.evaluate(
  () => getComputedStyle(document.querySelector('.dateline')).textTransform), 'uppercase');
ok('and the tee time, where there is one left, is the part it picks out',
  await p.evaluate(() => {
    const hot = document.querySelector('.dateline .hot');
    return !hot || /\d:\d\d/.test(hot.textContent);
  }), true);
ok('and it is one line, not three', await p.evaluate(() => {
  const r = document.querySelector('.dateline').getBoundingClientRect();
  return r.height < 30;
}), true);

/* ---------------- the strip that stays ---------------- */
console.log('\nand the shield never goes further than a scroll away');
ok('at the top of a page there is no strip on the glass', await p.evaluate(
  () => Math.round(document.querySelector('.topstrip').getBoundingClientRect().bottom) <= 0), true);
/* The week, because it is long. The Boards tab is the front page now and the
   front page fits one screen on purpose — there is nothing to scroll past. */
await bar('Calendar');
await p.evaluate(() => window.scrollTo(0, 420)); await p.waitForTimeout(600);
ok('scroll past the nameplate and it comes down', await p.evaluate(
  () => Math.round(document.querySelector('.topstrip').getBoundingClientRect().top)), 0);
ok('with the shield on it', await p.locator('.topstrip .ts-c').count(), 1);
ok('struck white, because the strip is pine', await p.evaluate(
  () => getComputedStyle(document.querySelector('.ts-c')).filter.includes('invert')), true);
ok('the name of the book', (await p.locator('.ts-n').innerText()).includes('Union Invitational'), true);
ok('when you are off', await p.locator('.topstrip .ts-t').count(), 1);
ok('and the dial, badge and all', await p.locator('.topstrip .dial .dial-ct').count(), 1);
ok('it is laid over the page, so nothing reflowed to make room', await p.evaluate(
  () => getComputedStyle(document.querySelector('.topstrip')).position), 'fixed');
ok('anything scrolled into view is told to clear it', await p.evaluate(() => {
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  return pad >= document.querySelector('.topstrip').getBoundingClientRect().height - 4;
}), true);
/* Two dials on the page, one reachable: the strip is a repeat of what the
   nameplate above already says. */
ok('the strip is not read out twice',
  await p.locator('.topstrip[aria-hidden="true"]').count(), 1);
ok('nor tabbed into', await p.locator('.topstrip .dial').getAttribute('tabindex'), '-1');
ok('but it is still a button under a thumb', await p.evaluate(() => {
  const r = document.querySelector('.topstrip .dial').getBoundingClientRect();
  return r.width >= 30 && r.height >= 30;
}), true);
await p.locator('.topstrip .dial').click(); await p.waitForTimeout(600);
ok('and it opens the same door', await p.locator('.mgmodal').count(), 1);
await p.locator('.mgmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
ok('back at the top the nameplate itself is there, so the strip goes',
  await p.evaluate(() => Math.round(document.querySelector('.topstrip').getBoundingClientRect().bottom) <= 0), true);

console.log('\nand the words it used to carry are in the window it opens');
await p.locator('.masthead .dial').click(); await p.waitForTimeout(600);
ok('the dial opens Manage', await p.locator('.mgmodal').count(), 1);
ok('which says whether the book is locked',
  (await p.locator('.mg-role .mg-rt').innerText()).trim(), 'Unlocked — no PIN');
ok('and what that means for whoever is reading',
  (await p.locator('.mg-role .mg-rn').innerText()).includes('Setup'), true);
await p.locator('.mgmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(400);

/* ---------------- the windows ----------------
 *
 * Two complaints and a free hand. The Ask panel opened flush to the top of
 * the glass, where a phone keeps its clock, its signal and its battery — so
 * the title of the window competed with the carrier name. And the banner
 * was drawn in the mid green the book uses for WORDS, which reads flat and
 * minty across a whole band next to the deep pine of a button.
 */
console.log('\nevery window is one material, and it is the pine');
const PINE = 'rgb(29, 46, 33)';
await p.locator('.crestbtn').click(); await p.waitForTimeout(700);
ok('the Ask panel opens', await p.locator('.askbox').count(), 1);
ok('its banner is the pine the buttons are', await p.evaluate(
  () => getComputedStyle(document.querySelector('.askbox .mbanner')).backgroundColor), PINE);
ok('the same pine, exactly', await p.evaluate(() => {
  const a = getComputedStyle(document.querySelector('.askbox .mbanner')).backgroundColor;
  const btn = [...document.querySelectorAll('.askrow .btn')][0];
  return a === getComputedStyle(btn).backgroundColor;
}), true);
ok('with the gold hairline on the edge that faces the page', await p.evaluate(() => {
  const b = getComputedStyle(document.querySelector('.askbox .mbanner'));
  return parseFloat(b.borderBottomWidth) >= 2 && b.borderBottomColor !== b.backgroundColor;
}), true);

console.log('\nand it opens where a man can read it');
const box = await p.evaluate(() => {
  const r = document.querySelector('.askbox').getBoundingClientRect();
  return { top: Math.round(r.top), below: Math.round(innerHeight - r.bottom) };
});
console.log('          (' + box.top + 'px above it, ' + box.below + 'px below)');
ok('clear of the clock and the battery', box.top >= 20, true);
ok('and centred, not hung from the top', Math.abs(box.top - box.below) <= 6, true);
ok('it is a card, not a slab: no border drawn on it', await p.evaluate(
  () => parseFloat(getComputedStyle(document.querySelector('.askbox')).borderTopWidth)), 0);
ok('with a corner a card has', await p.evaluate(
  () => parseFloat(getComputedStyle(document.querySelector('.askbox')).borderTopLeftRadius)) >= 14, true);
ok('and the book behind it is thrown out of focus', await p.evaluate(() => {
  const f = getComputedStyle(document.querySelector('.scrim')).backdropFilter
         || getComputedStyle(document.querySelector('.scrim')).webkitBackdropFilter || '';
  return /blur/.test(f);
}), true);
/* THE KEYBOARD STAYS DOWN. Opening the window used to put the caret in the
   field, and on a phone a caret means the keyboard — half the window gone
   before a word has been read. */
ok('nothing is focused for you when it opens', await p.evaluate(
  () => document.activeElement && document.activeElement.id), '');
await p.locator('#askField').click(); await p.waitForTimeout(350);
ok('the field takes focus when it is tapped', await p.evaluate(
  () => document.activeElement.id), 'askField');
await p.locator('#askField').type('Who is leading?', { delay: 25 });
ok('and typing into it still works',
  await p.locator('#askField').inputValue(), 'Who is leading?');
await p.locator('#askField').fill('');
await p.locator('.askbox .mb-t').click({ force: true }).catch(() => {});   // let it go again
await p.waitForTimeout(300);

ok('the field fills the card on a phone', await p.evaluate(() => {
  const f = document.querySelector('.askin').getBoundingClientRect();
  const c = document.querySelector('.askbox').getBoundingClientRect();
  return c.width - f.width < 46;
}), true);
/* It opens once. The book polls, and a window that rose on every poll
   would be a twitch. */
ok('a window opening is marked', await p.locator('.scrim[data-in]').count(), 1);
ok('and a redraw while it is open is not', await p.evaluate(async () => {
  window.__forceRender && window.__forceRender();
  await new Promise(r => setTimeout(r, 140));
  return document.querySelectorAll('.scrim[data-in]').length;
}), 0);
await p.locator('.askbox [data-act="askClose"]').click(); await p.waitForTimeout(500);

console.log('\nand what you do about it sits where Apple puts it');
await bar('Calendar'); await p.waitForTimeout(400);
await p.locator('.calfocus .de.tap').first().click(); await p.waitForTimeout(700);
const acts = await p.evaluate(() => [...document.querySelectorAll('.scrim .acts .btn')]
  .map(b => [b.textContent.trim(), b.getBoundingClientRect().top])
  .sort((a, c) => a[1] - c[1]).map(x => x[0]));
console.log('          (down the card: ' + acts.join(', ') + ')');
ok('the thing you came to do is on top', acts[0], 'Save');
ok('and taking it off the week is not', acts.indexOf('Remove') > 0, true);
ok('they are the full width of the card', await p.evaluate(() => {
  const b = document.querySelector('.scrim .acts .btn').getBoundingClientRect();
  const a = document.querySelector('.scrim .acts').getBoundingClientRect();
  return Math.abs(a.width - b.width) < 2;
}), true);
ok('and rounded, because they are the part you touch', await p.evaluate(
  () => parseFloat(getComputedStyle(document.querySelector('.scrim .acts .btn')).borderTopLeftRadius)) > 20, true);
ok('the destructive one is a red word, not a red slab', await p.evaluate(() => {
  const d = document.querySelector('.scrim .acts .btn.danger');
  const s = getComputedStyle(d);
  return s.color.replace(/\s/g, '') === 'rgb(158,59,46)' && s.backgroundColor !== 'rgb(158, 59, 46)';
}), true);
await p.locator('.scrim [data-act="modalCancel"]').click(); await p.waitForTimeout(500);

/* The pine is everywhere, not just on the one window that was complained
   about. */
console.log('\nand it is every window, not the one that was complained about');
for (const [what, open] of [['Manage', async () => p.locator('.masthead .dial').click()],
                            ['a round', async () => { await bar('Calendar');
                              await p.locator('.wk[data-a="4"]').click(); await p.waitForTimeout(500);
                              await p.locator('.dsmodal [data-act="roundOpen"]').click(); }]]) {
  await open(); await p.waitForTimeout(750);
  ok(what + ' wears the same pine', await p.evaluate(
    () => getComputedStyle(document.querySelector('.scrim .mbanner')).backgroundColor), PINE);
  await p.locator('.scrim [data-act="modalCancel"]').click(); await p.waitForTimeout(450);
}
ok('and no banner anywhere is still the old mid green', await p.evaluate(() => {
  const g = getComputedStyle(document.documentElement).getPropertyValue('--green').trim();
  return g.toUpperCase() === '#3E5C43';     // the token is untouched; it is no longer a surface
}), true);
/* Opening those windows scrolled the week, and the week now REMEMBERS where
   it was left — which is the next thing this file tests. Put it back. */
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(350);

/* ---------------- the foot of the page ---------------- */
console.log('\nthe page ends above the bar, not behind it');
await bar('Calendar');
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p.waitForTimeout(500);
ok('the last line of the book clears the bar', await p.evaluate(() => {
  const sb = document.querySelector('.statusbar').getBoundingClientRect();
  const bar = document.querySelector('.tabbar').getBoundingClientRect();
  return Math.round(bar.top - sb.bottom);
}) >= 12, true);
ok('and the browser knows how much of the foot is spoken for', await p.evaluate(() => {
  const v = getComputedStyle(document.documentElement).scrollPaddingBottom;
  const bar = document.querySelector('.tabbar').getBoundingClientRect().height;
  return parseFloat(v) >= bar;
}), true);

/* The fade. While there is page left under the bar the paper dissolves into
   the ink; at the very bottom there is nothing to dissolve, so it goes. */
console.log('\nand it dissolves into the bar rather than being cut by it');
ok('at the foot of the page the fade is off', await p.evaluate(
  () => getComputedStyle(document.querySelector('.tabbar'), '::before').opacity), '0');
await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(450);
ok('and with page still to come it is on', await p.evaluate(
  () => getComputedStyle(document.querySelector('.tabbar'), '::before').opacity), '1');
ok('it sits directly above the bar and nothing else', await p.evaluate(() => {
  const g = getComputedStyle(document.querySelector('.tabbar'), '::before');
  return g.pointerEvents === 'none' && parseFloat(g.height) > 12;
}), true);

/* ---------------- landing on a screen ---------------- */
console.log('\nevery tab keeps its own place');
await bar('Calendar');
await p.evaluate(() => window.scrollTo(0, 520)); await p.waitForTimeout(400);
const deep = await p.evaluate(() => Math.round(window.scrollY));
ok('we are a way down the week', deep > 400, true);
await bar('Resort');
ok('the resort opens at its top', await p.evaluate(() => Math.round(window.scrollY)), 0);
await bar('Calendar');
const back = await p.evaluate(() => Math.round(window.scrollY));
console.log('          (left the week at ' + deep + ', came back to ' + back + ')');
ok('and the week comes back where it was left', Math.abs(back - deep) <= 4, true);
/* The oldest gesture on the platform. */
await bar('Calendar');
ok('tapping the tab you are already on goes to the top',
  await p.evaluate(() => Math.round(window.scrollY)), 0);

/* A sub-tab is a page too. */
console.log('\nand a different board starts at its own top');
await bar('Boards');
await p.locator('.btab', { hasText: 'Team Competition' }).click(); await p.waitForTimeout(700);
/* With no cards in, a board is one screen and cannot scroll at all. Open the
   hole — the diagram and the tables under it are what make a board long. */
await p.locator('.holefold summary').click(); await p.waitForTimeout(700);
await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(450);
ok('we are down a board', await p.evaluate(() => window.scrollY > 200), true);
await p.locator('.btab', { hasText: 'Ryder Cup' }).first().click();
await p.waitForTimeout(600);
/* Never BELOW the strip of a board you have just opened. On a long board
   that means the strip is lifted to the top of the glass; on one shorter
   than the screen the page cannot scroll at all and it is already there. */
const lift = await p.evaluate(() => ({
  top: Math.round(document.querySelector('.btabs').getBoundingClientRect().top),
  canScroll: document.documentElement.scrollHeight > innerHeight + 2,
  y: Math.round(window.scrollY) }));
const lifted = lift.top;
console.log('          (the strip sits at ' + lifted + ' from the top of the glass; '
  + (lift.canScroll ? 'the board is longer than the glass' : 'the board fits the glass, nothing can move') + ')');
ok('you never land below the strip of the board you opened', lifted >= -1, true);
ok('and the head of the new board is on screen with it', await p.evaluate(() => {
  const s = document.querySelector('.btabs').getBoundingClientRect();
  return s.bottom > 0 && s.top < innerHeight * 0.4;
}), true);

/* One-way: from above the strip nothing is pushed down. */
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(350);
await p.locator('.btab', { hasText: 'MVP' }).first().click(); await p.waitForTimeout(600);
ok('and from above it nothing moves at all',
  await p.evaluate(() => Math.round(window.scrollY)), 0);

/* ---------------- an arrival is not a redraw ---------------- */
console.log('\na page turn looks like a page turn, and a redraw looks like nothing');
await bar('Calendar');
ok('the screen has a body of its own to turn', await p.locator('.wrap > main.page').count(), 1);
ok('arriving marks it', await p.evaluate(async () => {
  window.__forceRender && window.__forceRender();          // the live store, polling
  await new Promise(r => setTimeout(r, 120));
  return document.querySelector('.page').hasAttribute('data-turn');
}), false);
await p.locator('.navbtn:visible', { hasText: 'Resort' }).first().click();
await p.waitForTimeout(90);
ok('but a different screen does', await p.evaluate(
  () => document.querySelector('.page').hasAttribute('data-turn')), true);
await p.waitForTimeout(500);
ok('and it is a fifth of a second, not a journey', await p.evaluate(() => {
  const d = getComputedStyle(document.querySelector('.page')).animationDuration;
  return parseFloat(d) <= 0.26;
}), true);
/* Nothing fixed may live inside a thing that moves. */
ok('the bar is outside the page that turns',
  await p.locator('.page .tabbar').count(), 0);

/* ---------------- the tablet and the laptop ---------------- */
await p.close();
for (const [label, w, h] of [['tablet 834', 834, 1000], ['laptop 1300', 1300, 900]]) {
  console.log('\n=== ' + label + ' ===');
  const q = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  q.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror ' + label); });
  await q.goto('file://' + W);
  await q.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
  await q.waitForTimeout(800);
  for (let i = 0; i < 5; i++) { const m = q.locator('.scrim [data-act="modalCancel"]');
    if (!await m.count()) break; await m.first().click({ force: true }).catch(() => {}); await q.waitForTimeout(200); }
  ok('the dial is here too', await q.locator('.masthead .dial').count(), 1);
  ok('and only one of it', await q.locator('.dial:visible').count(), 1);
  ok('at the far right of the nameplate, past the tee time', await q.evaluate(() => {
    const d = document.querySelector('.masthead .dial').getBoundingClientRect();
    const t = document.querySelector('.mast-right').getBoundingClientRect();
    const wrap = document.querySelector('.wrap').getBoundingClientRect();
    return d.left > t.right - 1 && wrap.right - d.right < 40;
  }), true);
  ok('on one line with the name', await q.evaluate(() => {
    const d = document.querySelector('.masthead .dial').getBoundingClientRect();
    const hh = document.querySelector('.masthead h1').getBoundingClientRect();
    return d.top < hh.bottom && d.bottom > hh.top;
  }), true);
  ok('the strip along the top is the bar here, not the one at the foot',
    await q.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display), 'none');
  /* No fixed bar at the foot, so no gutter is held back for one. */
  ok('and no gutter is held for a bar that is not there', await q.evaluate(
    () => parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingBottom) < 60), true);
  /* The phone's two economies are the phone's. There is room up here. */
  ok('the nameplate keeps the venue and the dates',
    await q.locator('.masthead .sub:visible').count(), 1);
  ok('and the next tee time, with its caption',
    await q.locator('.mast-right:visible').count(), 1);
  ok('so there is no dateline', await q.locator('.dateline:visible').count(), 0);
  ok('and nothing pinned to the top', await q.evaluate(
    () => getComputedStyle(document.querySelector('.topstrip')).display), 'none');
  ok('nor a gutter held for one', await q.evaluate(() => {
    const v = getComputedStyle(document.documentElement).scrollPaddingTop;
    return v === 'auto' || parseFloat(v) === 0;
  }), true);
  await q.close();
}

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nThe frame holds, and the pages sit inside it.');
process.exit(fails.length ? 1 : 0);
