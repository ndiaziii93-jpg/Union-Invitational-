/* SHUTTLES. The airport runs, both ways: the commissioner pastes the plan in
   on Roster as plain lines, checks it, saves it; everyone on the trip sees
   their own shuttle on Today, with who they ride with and whose landing it
   waits for. The bleachers never see it.
   The phone's clock is set to Tuesday 27 October.
   Run: node tools/travel-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
writeFileSync(S + '/travel.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const shot = async name => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(300); };
const go = async (screen, who) => { await p.evaluate(([screen, who]) => { if (who !== undefined) { localStorage.setItem('union-invitational:whoami', who); window.__UI.who = undefined; }
  window.__UI.screen = screen; window.__forceRender(); scrollTo(0, 0); }, [screen, who]); await p.waitForTimeout(400); await shut(); };

/* the phone's clock set to Tuesday 27 October, 8am in Belek, whenever this runs */
await p.clock.install({ time: new Date('2026-10-27T05:00:00Z') });
await p.goto('file://' + S + '/travel.html'); await p.waitForTimeout(3500);
await shut();

console.log('\nthe plan, pasted in on Roster');
await go('roster');
ok('the commissioner has a shuttle box', await p.locator('#travelText').count(), 1);
await p.locator('#travelText').fill(`WEDNESDAY 28 Oct
ARRIVE Wed 28 Oct | pickup 16:00 | Arrivals hall, exit 4
Ray V | XX 123 | 13:45
Matt D | 15:10 | XX 456
Uncle Bob | XX 789 | 14:30
DEPART Mon 2 Nov | pickup 09:00 | Hotel lobby
Ray V | XX 124 | 12:40`);
await tap('[data-act="travelCheck"]');
ok('a line before any shuttle is pointed out', await p.locator('.trv-chk .xm-err').allInnerTexts(), ['Line 1: start with a shuttle heading first, like “ARRIVE Mon 26 Oct”.']);
ok('a name not on the roster is a warning, not a stop', (await p.locator('.trv-warn').allInnerTexts()).some(t => /Uncle Bob/.test(t)), true);
await tap('[data-act="travelSave"]');
ok('it will not save with a mistake in it', await p.evaluate(() => !!window.__T.config.travel), false);
await p.locator('#travelText').fill((await p.locator('#travelText').inputValue()).replace(/^WEDNESDAY 28 Oct\n/, ''));
await tap('[data-act="travelSave"]');
const tr = await p.evaluate(() => window.__T.config.travel);
ok('saved: two shuttles, the right days and pickups', tr.shuttles.map(s => [s.dir, s.dayIdx, s.pickup, s.meet]), [['arrive', 3, '16:00', 'Arrivals hall, exit 4'], ['depart', 8, '09:00', 'Hotel lobby']]);
ok('each rider with their flight and time, in any order', tr.shuttles[0].riders.map(r => [r.pid, r.name, r.flight, r.time]),
  [['g6', 'Ray V', 'XX 123', '13:45'], ['g3', 'Matt D', 'XX 456', '15:10'], [null, 'Uncle Bob', 'XX 789', '14:30']]);
ok('and the text kept, to edit later', /Ray V \| XX 124/.test(tr.text), true);
ok('the box says so', await p.locator('.trv-ok').innerText(), 'Saved: 2 shuttles, all good.');
await shot('travel-roster');

console.log('\non Today');
await go('today', 'g6');
ok('Ray V lands tomorrow: his shuttle is on Today, folded to a stub', [(await p.locator('.shuttle .sh-stub').innerText()).replace(/\s+/g, ' ').trim(), await p.locator('.shuttle .sh-body').count()],
  ['✈︎ YOUR SHUTTLE · TOMORROW AYT → Resort XX 123 · waits for XX 456 1:45 PM you land', 0]);
ok('with who else is riding, as faces', [await p.locator('.shuttle .sh-av').allInnerTexts(), (await p.locator('.shuttle .sh-foot').innerText()).replace(/\s+/g, ' ').trim()], [['UB', 'MD'], 'UB MD 3 riding · tap for all ▾']);
await shot('travel-folded');
await tap('.shuttle .sh-stub');
ok('a tap opens it', [await p.locator('.shuttle.open .sh-body').count(), await p.evaluate(() => localStorage.getItem('union-invitational:shuttleOpen'))], [1, '1']);
ok('when it leaves and where to meet', (await p.locator('.shuttle .sh-m').innerText()).replace(/\s+/g, ' '), 'Leaves 4:00 PM · Arrivals hall, exit 4');
ok('his own landing', (await p.locator('.shuttle .sh-you').innerText()).replace(/\s+/g, ' '), 'You land at 1:45 PM · XX 123');
ok('who he waits for, by flight', await p.locator('.shuttle .sh-w').innerText(), 'Waiting for XX 789 to land at 2:30 PM, then XX 456 to land at 3:10 PM');
ok('riders by flight, his own lit, the last one in marked', (await p.locator('.shuttle .sh-f').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()),
  ['XX 123 lands 1:45 PM Ray V you', 'XX 789 lands 2:30 PM Uncle Bob', 'XX 456 lands 3:10 PM last in Matt D']);
ok('with the count', await p.locator('.shuttle .sh-l').innerText(), 'RIDING TOGETHER · 3');
await shot('travel-today');
await tap('.shuttle .sh-foot');
ok('and the foot folds it away again, remembered', [await p.locator('.shuttle .sh-body').count(), await p.evaluate(() => localStorage.getItem('union-invitational:shuttleOpen'))], [0, '']);
await tap('.shuttle .sh-stub');
await go('today', 'g3');
ok('the last one in is told the shuttle waits for him', await p.locator('.shuttle .sh-w').innerText(), 'Yours is the last flight in: the shuttle waits for it');
await go('today', 'g9');
ok('someone not on a shuttle sees nothing', await p.locator('.shuttle').count(), 0);
await p.evaluate(() => { const T = window.__T; T.chat.guest_xd9 = { id: 'guest_xd9', k: 'g', pid: 'xd9', name: 'Aunt May', at: Date.now(), dev: 'd9' };
  T.config.travel.shuttles[0].riders.push({ pid: 'xd9', name: 'Aunt May', flight: 'XX 1', time: '10:00' }); });
await go('today', 'xd9');
ok('the bleachers never see the shuttles', await p.locator('.shuttle').count(), 0);
await go('roster', 'g6');
await p.evaluate(() => { window.__UI.role = 'viewer'; });

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
