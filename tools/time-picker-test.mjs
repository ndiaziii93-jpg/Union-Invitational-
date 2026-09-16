/* Every time in the book is picked from wheels, never typed, and lands in the
   store in 24-hour form. Run: node tools/time-picker-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
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
  const tab = async t => { await clear(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(450); await clear(); };
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

  // --- a morning tee time on the Leaderboards round picker ---
  await tab('Leaderboards');
  const tee = p.locator('.teetimes .timepick').first();
  ok('a tee time is three wheels', await tee.locator('select').count(), 3);
  ok('the minute wheel offers every minute', await tee.locator('select').nth(1).locator('option').count(), 61);
  ok('the hour wheel is 1 to 12', await tee.locator('select').nth(0).locator('option').count(), 13);
  await set(tee, '7', '40', 'AM');
  ok('7:40 AM is kept as 07:40', (await teeTimes())[0], '07:40');

  // --- the afternoon is not the morning ---
  await set(p.locator('.teetimes .timepick').first(), '1', '05', 'PM');
  ok('1:05 PM is kept as 13:05', (await teeTimes())[0], '13:05');
  // noon and midnight are where 12-hour clocks go wrong
  await set(p.locator('.teetimes .timepick').first(), '12', '00', 'PM');
  ok('12:00 PM is noon, not midnight', (await teeTimes())[0], '12:00');
  await set(p.locator('.teetimes .timepick').first(), '12', '30', 'AM');
  ok('12:30 AM is after midnight', (await teeTimes())[0], '00:30');

  // --- half a time must not be written ---
  const second = p.locator('.teetimes .timepick').nth(1);
  ok('the second group starts unset', (await teeTimes())[1], null);
  await set(second, '9', null, null);
  ok('an hour alone writes nothing', (await teeTimes())[1], null);
  await set(p.locator('.teetimes .timepick').nth(1), null, '20', null);
  ok('an hour and a minute still write nothing', (await teeTimes())[1], null);
  await set(p.locator('.teetimes .timepick').nth(1), null, null, 'AM');
  ok('the third wheel completes it', (await teeTimes())[1], '09:20');

  // --- and it can be cleared again ---
  await set(p.locator('.teetimes .timepick').nth(1), '', '', '');
  ok('clearing all three empties the slot', (await teeTimes())[1], null);

  // --- calendar fixtures pick the same way ---
  await tab('Calendar');
  await p.locator('[data-act="calView"][data-a="day"]').click(); await p.waitForTimeout(500); await clear();
  const fx = p.locator('.fx').filter({ has: p.locator('.timepick') }).first();
  ok('a fixture is picked too', await fx.locator('.timepick select').count(), 3);
  await set(fx.locator('.timepick'), '6', '15', 'PM');
  ok('6:15 PM is kept as 18:15', await firstFixture(), '18:15');

  // --- the wider control must not push anything off the screen ---
  for (const t of ['Leaderboards', 'Calendar', 'Course Setup']) {
    await tab(t);
    ok(t + ' does not scroll sideways', await p.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }
  await p.close();
}
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nEvery time is picked, and lands where it should.');
process.exit(fails.length ? 1 : 0);
