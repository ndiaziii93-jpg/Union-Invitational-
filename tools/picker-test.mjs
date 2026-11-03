/* THE PICKERS. Every choice in the book is made in one of its own windows:
   a person in the Window (A), a time on the Sheet (B), a hole on the Tiles
   (C) — the pin only on the par threes, the drive only on the par fives.
   The phone's own dropdown is never shown and never opened, and a choice
   saves through the same path the dropdown did.
   Run: node tools/picker-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/picker.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
/* the phone's clock set to the week before the trip: the week can still be arranged, whatever the real date */
await p.clock.install({ time: new Date('2026-10-24T08:00:00Z') });
await p.goto('file://' + S + '/picker.html'); await p.waitForTimeout(3500);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(250); } else break; } };
const r1 = () => p.evaluate(() => { const r = window.__T.config.rounds[Object.keys(window.__T.config.rounds)[0]]; return { ctp: r.ctpHole, ld: r.ldHole, ctpW: r.ctpWinner, state: r.state, tee: r.tees[0].time }; });
const field = a => p.locator('.pk:has(select[data-a="' + a + '"]) .pkf').first();
await shut();
await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(800); await shut();

console.log('\nno phone dropdown is ever shown');
ok('every select on the screen sits unseen under a field', await p.evaluate(() =>
  [...document.querySelectorAll('#app select')].every(s => s.classList.contains('pk-sel') && getComputedStyle(s).opacity === '0'
    && getComputedStyle(s).pointerEvents === 'none' && s.tabIndex === -1 && s.previousElementSibling && s.previousElementSibling.classList.contains('pkf'))), true);

console.log('\nC: the hole, as coins');
await field('ctpHole').scrollIntoViewIfNeeded();
/* the words of the label open the window, never the phone's own wheel */
await p.locator('label:has(select[data-a="ctpHole"])').first().click({ position: { x: 20, y: 8 } }); await p.waitForTimeout(500);
ok('a tap on the label opens the window', await p.locator('.pkscrim .pk-c').count(), 1);
ok('and nothing is focused under it', await p.evaluate(() => document.activeElement.tagName !== 'SELECT'), true);
const pars = await p.evaluate(() => [...document.querySelectorAll('.pk-hc small')].map(x => x.textContent.split('·')[0].trim()));
ok('the pin offers only the par threes', pars.length > 0 && pars.every(x => x === 'par 3'), true);
const firstCtp = +(await p.locator('.pk-hc b').first().innerText());
await p.locator('.pk-hc').first().tap(); await p.waitForTimeout(600);
ok('a coin nominates the hole', (await r1()).ctp, firstCtp);
ok('and the window is gone', await p.locator('.pkscrim').count(), 0);
ok('the field shows the hole as a coin', (await field('ctpHole').locator('.pk-coin').innerText()).trim(), String(firstCtp));
await field('ldHole').tap(); await p.waitForTimeout(500);
const ldPars = await p.evaluate(() => [...document.querySelectorAll('.pk-hc small')].map(x => x.textContent.split('·')[0].trim()));
ok('the drive offers only the par fives', ldPars.length > 0 && ldPars.every(x => x === 'par 5'), true);
await p.locator('.pk-hc').last().tap(); await p.waitForTimeout(600);
const ld = (await r1()).ld;
ok('and it is nominated', await p.evaluate(n => { const c = window.__T.config.courses; return Object.values(c).some(k => k.holes[n - 1] && k.holes[n - 1].par === 5); }, ld), true);

console.log('\nA: a name, in the window');
await p.locator('[data-act="openRound"]').first().click({ force: true }); await p.waitForTimeout(800); await shut();
await p.locator('[data-act="entryHole"][data-a="' + (firstCtp - 1) + '"]').first().dispatchEvent('click'); await p.waitForTimeout(600); await shut();
await field('ctpWinner').scrollIntoViewIfNeeded(); await field('ctpWinner').tap(); await p.waitForTimeout(500);
ok('the window opens with the book\'s banner', await p.locator('.pkscrim .pk-a .mbanner').count(), 1);
ok('Nobody yet is ticked', (await p.locator('.pk-li.on').innerText()).includes('Nobody yet'), true);
const who = (await p.locator('.pk-li:not(.none)').nth(2).innerText()).replace('✓', '').trim();
await p.locator('.pk-li:not(.none)').nth(2).tap(); await p.waitForTimeout(60);
ok('the row flashes as it is chosen', await p.locator('.pk-li.flash').count(), 1);
await p.waitForTimeout(500);
ok('the name is saved', await p.evaluate(() => { const r = window.__T.config.rounds[Object.keys(window.__T.config.rounds)[0]]; const g = window.__T.config.people.find(x => x.id === r.ctpWinner); return g ? g.display : null; }), who);
ok('and shown in the field', (await field('ctpWinner').innerText()).trim(), who);
await field('ctpWinner').tap(); await p.waitForTimeout(400);
await p.locator('.pkscrim [data-act="modalCancel"]').tap(); await p.waitForTimeout(400);
ok('Cancel leaves it as it was', (await field('ctpWinner').innerText()).trim(), who);

console.log('\nB: a time, on the sheet');
await p.locator('[data-act="manageOpen"]').first().click(); await p.waitForTimeout(400);
await p.locator('.mg-row', { hasText: 'Tee times' }).first().click(); await p.waitForTimeout(700); await shut();
const tf = p.locator('.timepick .pkf').first(); await tf.scrollIntoViewIfNeeded(); await tf.tap(); await p.waitForTimeout(600);
ok('the sheet rises from the foot', await p.locator('.pkscrim.bottom .pk-b').count(), 1);
ok('with three wheels', await p.locator('.pk-wheel').count(), 3);
await p.locator('.pk-wheel[data-k="0"] .pk-wi', { hasText: /^10$/ }).tap(); await p.waitForTimeout(450);
await p.locator('.pk-wheel[data-k="1"] .pk-wi', { hasText: /^20$/ }).tap(); await p.waitForTimeout(450);
await p.locator('.pk-wheel[data-k="2"] .pk-wi', { hasText: /^AM$/ }).tap(); await p.waitForTimeout(450);
await p.locator('[data-act="pickDone"]').tap(); await p.waitForTimeout(700);
ok('Set time saves it', (await r1()).tee, '10:20');
ok('and the field reads it', (await tf.innerText()).trim(), '10:20 AM');
await tf.tap(); await p.waitForTimeout(500);
const grab = await p.locator('.pk-grab').boundingBox();
await p.mouse.move(grab.x + grab.width / 2, grab.y + 10); await p.mouse.down();
await p.mouse.move(grab.x + grab.width / 2, grab.y + 200, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
ok('pulled down by its banner, the sheet goes away', await p.locator('.pkscrim').count(), 0);
ok('without changing the time', (await r1()).tee, '10:20');

console.log('\nB over a window: the time of an event');
await shut();
await p.locator('.navbtn[data-a="calendar"]').click(); await p.waitForTimeout(700); await shut();
await p.locator('[data-act="evNew"]').first().click({ force: true }); await p.waitForTimeout(600);
await p.locator('#evTitle').fill('Range session');
await p.locator('.evmodal .timepick .pkf').tap(); await p.waitForTimeout(500);
ok('the sheet lies over the event window', [await p.locator('.evmodal').count(), await p.locator('.pkscrim .pk-b').count()].join('/'), '1/1');
await p.locator('.pk-wheel[data-k="0"] .pk-wi', { hasText: /^2$/ }).tap(); await p.waitForTimeout(400);
await p.locator('.pk-wheel[data-k="2"] .pk-wi', { hasText: /^PM$/ }).tap(); await p.waitForTimeout(400);
await p.locator('[data-act="pickDone"]').tap(); await p.waitForTimeout(700);
ok('and hands the time back to it', /^2:\d\d PM$/.test((await p.locator('.evmodal .timepick .pkf').innerText()).trim()), true);
ok('with what was typed still there', await p.locator('#evTitle').inputValue(), 'Range session');

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
