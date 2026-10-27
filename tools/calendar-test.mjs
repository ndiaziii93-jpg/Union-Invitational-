/* Writing an event while the book is talking to you.
 *
 * The calendar worked when I drove it and failed on the real thing, and the
 * difference was redraws. A live store polls: a snapshot lands every few
 * seconds, and every render replaces the whole screen. So this test does what
 * the real app does and the sandbox did not — it beats a redraw against the
 * page the entire time an event is being written — and asks for the two
 * things that were reported broken:
 *
 *   - picking the kind must not wipe the name
 *   - Save must save
 *
 * Run: node tools/calendar-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

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

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

writeFileSync(S + '/cale.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
/* A TAP IS NOT A CLICK. Playwright presses and releases inside one task, so
   anything the page queues on blur runs after the whole click is over. A
   finger holds the glass for a tenth of a second or more, and that gap is
   where a queued redraw lands — between the press and the release, replacing
   the button being pressed. Every tap here is held like a real one. */
const tap = async (loc) => {
  const n = await loc.count();
  if (n !== 1) { ok('tap found exactly one ' + loc, n, 1); return; }
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
  if (!box) { await loc.click(); return; }
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(160);
  await p.mouse.up();
};
const schedule = () => p.evaluate(() => { try {
  return JSON.parse(localStorage.getItem('union-invitational:v3')).config.schedule;
} catch (e) { return null; } });

/* the phone's clock two days before the trip, whenever this runs: the week ahead, whole */
await p.clock.install({ time: new Date('2026-10-24T08:00:00Z') });
await p.goto('file://' + S + '/cale.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(700); await shut();
await goTab(p, 'Calendar'); await p.waitForTimeout(700); await shut();

/* The two ceremonies are the formal bookends of the week, and they wear the
   crest on the calendar. Nothing else does — a mark everything carries is
   not a mark. */
console.log('\nthe ceremonies wear the crest');
/* The week is a plate for the day you are in and one line for each of the
   other seven; a ceremony is the line's headline on its day, so the crest
   sits on the line. */
ok('two crests on the week, and only two', await p.locator('.calgrid .dcrest').count(), 2);
ok('one on the opening',
  await p.locator('.wk, .de', { hasText: 'Opening Ceremony' }).locator('.dcrest').count(), 1);
ok('one on the closing',
  await p.locator('.wk, .de', { hasText: 'Closing Ceremony' }).locator('.dcrest').count(), 1);
ok('and none on the beers',
  await p.locator('.wk, .de', { hasText: 'Mandatory Team Beers' }).first().locator('.dcrest').count(), 0);
ok('it is decoration, so it carries no alt text',
  await p.locator('.dcrest').first().getAttribute('alt'), '');
ok('and it does not push the name off the line', await p.evaluate(() => {
  const line = [...document.querySelectorAll('.wk .wh, .de')].find(el => el.querySelector('.dcrest'));
  const l = line.getBoundingClientRect();
  const c = line.querySelector('.dcrest').getBoundingClientRect();
  return c.left > l.left && c.right <= l.right + 0.5 && c.top < l.bottom && c.bottom > l.top;
}), true);

/* THE WEEK IS SOMETHING TO READ. The tee times used to sit under it, which
   put the one control that moves everybody's morning on the page everybody
   opens. They live behind Manage now. The round on a day opens instead, and
   what opens cannot be changed — it tells you when you go out, on what, and
   with whom. */
console.log('\nthe week tells you about the round, it does not set it');
ok('no tee picker anywhere on the week', await p.locator('.teetimes, .teeblock, .timepick').count(), 0);
ok('the four days with golf are marked on the week', await p.locator('.wk.golf').count(), 4);
/* A line opens the day, and the round on the day opens the round. */
await tap(p.locator('.wk[data-a="4"]')); await p.waitForTimeout(600);
ok('a day opens in full', await p.locator('.dsmodal').count(), 1);
ok('with the round at the head of it', await p.locator('.dsmodal [data-act="roundOpen"]').count(), 1);
await tap(p.locator('.dsmodal [data-act="roundOpen"]'));
await p.waitForTimeout(600);
ok('the round window opens', await p.locator('.rdmodal').count(), 1);
ok('under the name of the round',
  (await p.locator('.rdmodal .mb-t').innerText()).includes('Round 1'), true);
ok('with the day and the course on it',
  (await p.locator('.rdmodal .mb-s').innerText()).toLowerCase().includes('olympos'), true);
ok('it is branded like every other window', await p.locator('.rdmodal .mb-c').count(), 1);
ok('it shows every group going out', await p.locator('.rdmodal .rd-row').count(), 3);
ok('with a time on each', await p.evaluate(
  () => [...document.querySelectorAll('.rdmodal .rd-t')].every(el => /\d/.test(el.textContent))), true);
ok('eight minutes apart, as they are booked', await p.evaluate(() => {
  const t = [...document.querySelectorAll('.rdmodal .rd-t')].map(el => el.textContent.trim());
  const m = s => { const x = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s); if (!x) return null;
    return ((+x[1] % 12) + (/pm/i.test(x[3]) ? 12 : 0)) * 60 + +x[2]; };
  const v = t.map(m);
  return v.every(x => x != null) && v[1] - v[0] === 8 && v[2] - v[1] === 8;
}), true);
ok('and nothing in it can be touched',
  await p.locator('.rdmodal select, .rdmodal input, .rdmodal .timepick').count(), 0);
ok('it says where the times are set instead',
  /Manage|scorer|concluded/.test(await p.locator('.rdmodal .rd-note').innerText()), true);
await tap(p.locator('.rdmodal [data-act="modalCancel"]'));
await p.waitForTimeout(500);
ok('and it closes', await p.locator('.rdmodal').count(), 0);

/* Where they went. */
console.log('\nand the times are set behind Manage');
await goTab(p, 'Tee times'); await p.waitForTimeout(700);
ok('Tee times is a screen of its own now',
  (await p.locator('.mhead .mh-t').first().innerText()).trim(), 'Tee times');
ok('with a picker for every group of every round', await p.locator('.teeblock .timepick').count(), 12);
await goTab(p, 'Calendar'); await p.waitForTimeout(700); await shut();
ok('and back on the week there are still none', await p.locator('.timepick').count(), 0);

/* THE DRUMBEAT. This is the live store polling, and nothing else about this
   test matters without it: every one of these is a full rebuild of the page. */
console.log('\nwith a redraw landing every fifth of a second');
await p.evaluate(() => { window.__beat = setInterval(() => window.__forceRender && window.__forceRender(), 200); });

/* The day is a sheet now, and an event opened from it goes back to it when
   it is done with — so the day on screen is the sheet, through every one of
   these. */
await tap(p.locator('.wk[data-a="4"]')); await p.waitForTimeout(600);
const day4 = p.locator('.dsmodal');
/* Nothing is in local storage until the first write, so the count before is
   taken off the day itself. */
const before = await day4.locator('.de').count();
await tap(day4.locator('[data-act="evNew"]')); await p.waitForTimeout(600);
ok('the window opens', await p.locator('.evmodal').count(), 1);

const title = p.locator('#evTitle');
await title.click();
await title.type('Boat trip to Kekova', { delay: 45 });
ok('the name survives being typed', await title.inputValue(), 'Boat trip to Kekova');

/* The reported bug, exactly: tap the kind and the name is gone. */
console.log('\npicking the kind');
await tap(p.locator('.evk', { hasText: 'Travel' })); await p.waitForTimeout(500);
ok('the name is still there after picking a kind',
  await p.locator('#evTitle').inputValue(), 'Boat trip to Kekova');
ok('and the kind actually took',
  await p.locator('.evk.on').innerText(), 'Travel');

/* And the other one: Save does nothing. */
console.log('\nand saving it');
await p.locator('.evmodal .timepick select').nth(0).selectOption('2'); await p.waitForTimeout(250);
await p.locator('.evmodal .timepick select').nth(1).selectOption('30'); await p.waitForTimeout(250);
await p.locator('.evmodal .timepick select').nth(2).selectOption('PM'); await p.waitForTimeout(400);
await tap(p.locator('[data-act="evSave"]')); await p.waitForTimeout(800);
ok('the window closes', await p.locator('.evmodal').count(), 0);

ok('saving it goes back to the day', await p.locator('.dsmodal').count(), 1);
ok('one event is now on the day', await p.locator('.dsmodal .de').count(), before + 1);
const rows = await schedule();
ok('and the book has it', Array.isArray(rows), true);
const made = rows.find(r => r.title === 'Boat trip to Kekova');
ok('under the name that was typed', !!made, true);
if (made) {
  ok('on the day it was added to', made.dayIdx, 4);
  ok('at the time that was picked', made.time, '14:30');
  ok('and the kind that was tapped', made.kind, 'travel');
}
ok('under that name on screen',
  await p.locator('.dsmodal .de', { hasText: 'Boat trip to Kekova' }).count(), 1);
const saved = rows.length;

/* Editing one has the same two hazards. */
console.log('\nand changing one that is already there');
await tap(p.locator('.dsmodal .de.tap', { hasText: 'Boat trip to Kekova' }));
await p.waitForTimeout(600);
ok('it opens with what was saved', await p.locator('#evTitle').inputValue(), 'Boat trip to Kekova');
ok('and the kind it was given', await p.locator('.evk.on').innerText(), 'Travel');
await p.locator('#evTitle').fill('Boat trip to Kas');
await tap(p.locator('.evk', { hasText: 'Social' })); await p.waitForTimeout(500);
ok('the edited name survives the kind tap', await p.locator('#evTitle').inputValue(), 'Boat trip to Kas');
await tap(p.locator('[data-act="evSave"]')); await p.waitForTimeout(800);
const rows2 = await schedule();
ok('it is changed, not duplicated', rows2.length, saved);
const ed = rows2.find(r => r.id === (made || {}).id);
ok('to the new name', (ed || {}).title, 'Boat trip to Kas');
ok('and the new kind', (ed || {}).kind, 'social');

console.log('\nand taking one off');
await tap(p.locator('.dsmodal .de.tap', { hasText: 'Boat trip to Kas' }));
await p.waitForTimeout(600);
await tap(p.locator('[data-act="evRemove"]')); await p.waitForTimeout(800);
ok('the window closes', await p.locator('.evmodal').count(), 0);
ok('and it is off the week', (await schedule()).length, saved - 1);
ok('and off the day on screen', await p.locator('.dsmodal .de').count(), before);
await tap(p.locator('.dsmodal [data-act="modalCancel"]')); await p.waitForTimeout(400);
ok('and the day closes', await p.locator('.dsmodal').count(), 0);

/* IT WAS NEVER ONLY THE CALENDAR. Every tap in the book went through the
   same hazard — the screen is rebuilt whole, and a rebuild between the press
   and the release eats the click. The commonest tap of all, with the drumbeat
   still going: */
console.log('\nand the same hazard anywhere else');
/* The strip carries the short labels at this width: Boards, not Leaderboards. */
await tap(p.locator('.tab:visible, .navbtn:visible', { hasText: 'Boards' }));
/* Wait for the screen rather than counting the instant after the finger
   lifts: the question is whether the tap landed at all, not how quickly the
   redraw that follows it got there. */
const landed = await p.waitForSelector('.btabs', { timeout: 6000 }).then(() => true).catch(() => false);
ok('a held tap on a tab still changes the screen', landed, true);
/* And back to the week, which has a tab of its own. */
await tap(p.locator('.tab:visible, .navbtn:visible', { hasText: 'Calendar' }));
const back = await p.waitForSelector('.calgrid', { timeout: 6000 }).then(() => true).catch(() => false);
ok('and back again', back && await p.locator('.wk').count(), 7);

await p.evaluate(() => clearInterval(window.__beat));
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
