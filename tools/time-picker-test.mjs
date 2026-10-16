/* Every time in the book is picked from wheels, never typed, and lands in the
   store in 24-hour form. Run: node tools/time-picker-test.mjs */
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
const W = S + '/tp.html';
writeFileSync(W, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [label, vp, mob] of [['phone 390', { width: 390, height: 844 }, true],
                                ['desktop 1300', { width: 1300, height: 900 }, false]]) {
  console.log('\n=== ' + label + ' ===');
  const p = await (await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob })).newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  const clear = async () => { for (let i = 0; i < 4; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
  const tab = async t => { await clear(); await goTab(p, t); await p.waitForTimeout(450); await clear(); };
  // the store is the truth: the wheels are 12-hour, what is kept is 24-hour
  const teeTimes = () => p.evaluate(() => { try {
    return JSON.parse(localStorage.getItem('union-invitational:v3')).config.rounds.r1.tees.map(t => t.time);
  } catch (e) { return null; } });
  const firstFixture = () => p.evaluate(() => { try {
    return JSON.parse(localStorage.getItem('union-invitational:v3')).config.schedule[0].time;
  } catch (e) { return null; } });
  const set = async (pick, h, m, ap) => { const s = pick.locator('select');
    if (h !== null) await s.nth(0).selectOption(h);
    if (m !== null) await s.nth(1).selectOption(m);
    if (ap !== null) await s.nth(2).selectOption(ap);
    await p.waitForTimeout(650); };

  await p.goto('file://' + W); await p.waitForTimeout(2200); await clear();

  ok('nothing anywhere asks you to type a time', await p.locator('input.tt-in, input.fxtime').count(), 0);

  /* --- a morning tee time, where tee times are now set ---
     They used to sit under the round picker on the Leaderboards, which put
     the one control that moves everybody's morning on a page whose job is to
     report. Behind Manage, with the rest of what is settled once. */
  await tab('Tee times');
  /* Every round has a block of its own on this screen and the practice round
     comes first, so the picker this file is about has to be named: it is the
     one the store keeps under rounds.r1. */
  const r1 = () => p.locator('.teeblock', { hasText: 'Round 1' }).locator('.timepick');
  const tee = r1().first();
  ok('a tee time is three wheels', await tee.locator('select').count(), 3);
  ok('the minute wheel offers every minute', await tee.locator('select').nth(1).locator('option').count(), 61);
  ok('the hour wheel is 1 to 12', await tee.locator('select').nth(0).locator('option').count(), 13);
  await set(tee, '7', '40', 'AM');
  ok('7:40 AM is kept as 07:40', (await teeTimes())[0], '07:40');

  // --- the afternoon is not the morning ---
  await set(r1().first(), '1', '05', 'PM');
  ok('1:05 PM is kept as 13:05', (await teeTimes())[0], '13:05');
  // noon and midnight are where 12-hour clocks go wrong
  await set(r1().first(), '12', '00', 'PM');
  ok('12:00 PM is noon, not midnight', (await teeTimes())[0], '12:00');
  await set(r1().first(), '12', '30', 'AM');
  ok('12:30 AM is after midnight', (await teeTimes())[0], '00:30');

  /* --- THE SECOND GROUP FOLLOWS THE FIRST ---
     The course sends groups out eight to ten minutes apart. Eight is not a
     number anybody should have to hold in their head at seven in the
     morning, so setting the first tee sets the second. */
  const second = r1().nth(1);
  ok('the second group is already eight minutes behind the first',
    (await teeTimes())[1], '00:38');

  /* A picker that HAS a time behaves like one: move a wheel and you get a
     time, because the other two wheels are already set. */
  await set(second, '9', null, null);
  ok('moving one wheel on a set time moves the time', (await teeTimes())[1], '09:38');

  /* Setting the SECOND by hand is exactly what it says — the first does not
     move with it. Only the first carries the other. */
  ok('and the first stayed where it was', (await teeTimes())[0], '00:30');
  await set(r1().first(), '7', '40', 'AM');
  ok('moving the first takes the second with it', (await teeTimes())[0], '07:40');
  ok('eight minutes behind, wherever it was', (await teeTimes())[1], '07:48');

  /* --- HALF A TIME MUST NOT BE WRITTEN ---
     A rule about a picker with nothing in it, which since the second group
     now always shows a time means the FIRST one, emptied. */
  await set(r1().first(), '', '', '');
  ok('the first can be emptied', (await teeTimes())[0], null);
  ok('and the second empties with it', (await teeTimes())[1], null);
  await set(r1().first(), '9', null, null);
  ok('an hour alone writes nothing', (await teeTimes())[0], null);
  await set(r1().first(), null, '20', null);
  ok('an hour and a minute still write nothing', (await teeTimes())[0], null);
  await set(r1().first(), null, null, 'AM');
  ok('the third wheel completes it', (await teeTimes())[0], '09:20');
  ok('and the second comes back with it', (await teeTimes())[1], '09:28');

  // --- and the second can be cleared on its own ---
  await set(r1().nth(1), '', '', '');
  ok('clearing all three empties the slot', (await teeTimes())[1], null);
  /* Cleared in the book, but the group still has a time on screen: a blank
     second slot is read as eight minutes behind the first rather than shown
     as a group with no tee time at all. That is what carries the rounds
     written before the gap was settled. */
  ok('and the group still shows one',
    await r1().nth(1).locator('select').first().inputValue(), '9');

  /* Calendar events pick the same way, in the window that writes them. The
     week is a week again: you tap an event to open it, not to type into it. */
  await tab('Calendar');
  ok('the week is the only view', await p.locator('[data-act="calView"]').count(), 0);
  ok('and every day of it is there', await p.locator('.wk').count() + 1, 8);
  await p.locator('.de.tap').first().click(); await p.waitForTimeout(600);
  const fx = p.locator('.evmodal .timepick');
  ok('the event window picks a time the same way', await fx.locator('select').count(), 3);
  await set(fx, '6', '15', 'PM');
  /* Nothing is written until Save — that is the point of the window. */
  ok('and holds it until Save', await firstFixture(), '14:00');
  await p.locator('.evmodal [data-act="evSave"]').click(); await p.waitForTimeout(700);
  ok('6:15 PM is kept as 18:15', await firstFixture(), '18:15');

  // --- the wider control must not push anything off the screen ---
  for (const t of ['Tee times', 'Leaderboards', 'Calendar', 'Course Setup']) {
    await tab(t);
    ok(t + ' does not scroll sideways', await p.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }
  await p.close();
}
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nEvery time is picked, and lands where it should.');
process.exit(fails.length ? 1 : 0);
