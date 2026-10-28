/* Clear scores, the night before the trip: every card, point, note and
   report goes and every round closes, while the people, their bands and
   squads, the pairs, the tee times, the calendar and the PINs stay exactly
   as they were. Run: node tools/clear-scores-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* ---- the button, on the phone ---- */
console.log('\nthe button');
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/clear.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.goto('file://' + S + '/clear.html'); await p.waitForTimeout(3000);
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]'); if (await m.count()) { await m.first().click({ force: true }); await p.waitForTimeout(200); } else return; } };
await shut();
/* a week of fictitious play, laid straight into the book */
await p.evaluate(() => { const T = window.__T;
  T.scores['r1__g1'] = { raw: [4, ...Array(17).fill(null)], by: {}, at: {}, marks: {}, mF: false, mB: false, bb: false };
  T.bbb.r1 = { holes: [] }; T.notes['r1__g1'] = { marks: { 0: ['robbed'] }, text: {}, at: {} }; T.recaps.r1 = { body: { headline: 'x' } };
  T.photos.ph1 = { id: 'ph1', rid: 'r1', url: 'x', at: 1 };
  T.config.people[0].band = 18; T.config.people[1].squad = 'UK';
  T.config.pins = { master: '4321', s1: '1111', s2: '2222' }; T.config.pinsChanged = true;
  const r = T.config.rounds.r1; r.state = 'open'; r.ctpHole = 5; r.ctpWinner = 'g2'; r.done = { t0: { at: 1 } };
  r.tees[0].players = ['g1', 'g2', 'g3', 'g4']; r.tees[0].time = '09:10';
  T.config.schedule.push({ id: 'x1', dayIdx: 3, time: '20:00', title: 'Quiz night', kind: 'social' });
  window.__pairsWere = JSON.stringify(T.config.pairs); });
await p.locator('[data-act="manageOpen"]').first().click(); await p.waitForTimeout(400);
await p.locator('.mg-row', { hasText: 'Setup' }).first().click(); await p.waitForTimeout(600); await shut();
ok('Setup offers to clear the scores', await p.locator('[data-act="resetScores"]').count(), 1);
ok('and nothing more dangerous than that', await p.locator('[data-act="resetAll"]').count(), 0);
ok('the PINs are never read back', await p.evaluate(() => [...document.querySelectorAll('.pinbox')].every(i => i.type === 'password' && i.value === '')), true);
await p.locator('[data-act="resetScores"]').click(); await p.waitForTimeout(800);
ok('the scores are gone', await p.evaluate(() => Object.keys(window.__T.scores).length), 0);
ok('and the points, notes, reports and photos', await p.evaluate(() => { const T = window.__T; return [Object.keys(T.bbb).length, Object.keys(T.notes).length, Object.keys(T.recaps).length, Object.keys(T.photos).length]; }), [0, 0, 0, 0]);
ok('every round is closed with nothing nominated', await p.evaluate(() => { const r = window.__T.config.rounds.r1; return [r.state, r.ctpHole, r.ctpWinner, r.done]; }), ['closed', null, null, {}]);
ok('the tee times and groups stay', await p.evaluate(() => { const r = window.__T.config.rounds.r1; return [r.tees[0].time, r.tees[0].players]; }), ['09:10', ['g1', 'g2', 'g3', 'g4']]);
ok('the bands and squads stay', await p.evaluate(() => [window.__T.config.people[0].band, window.__T.config.people[1].squad]), [18, 'UK']);
ok('the pairs stay', await p.evaluate(() => JSON.stringify(window.__T.config.pairs) === window.__pairsWere), true);
ok('the calendar stays', await p.evaluate(() => window.__T.config.schedule.some(e => e.id === 'x1')), true);
ok('and the PINs stay', await p.evaluate(() => window.__T.config.pins), { master: '4321', s1: '1111', s2: '2222' });
ok('and it lands on Today', await p.evaluate(() => window.__UI.screen), 'today');

console.log('\nthe PIN boxes');
await p.locator('[data-act="manageOpen"]').first().click(); await p.waitForTimeout(400);
await p.locator('.mg-row', { hasText: 'Setup' }).first().click(); await p.waitForTimeout(600); await shut();
await p.locator('#pin_master').fill('987654'); await p.locator('#pin_s1').fill('5555');
await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(300);
ok('what is typed survives a redraw', [await p.locator('#pin_master').inputValue(), await p.locator('#pin_s1').inputValue()], ['987654', '5555']);
ok('and nothing is written until Save', await p.evaluate(() => window.__T.config.pins.master), '4321');
await p.locator('[data-act="savePins"]').click(); await p.waitForTimeout(300);
ok('a short one is refused, and nothing is written', [/6 to 8 digits — Scorer 1/.test(await p.locator('.panel .eyebrow').innerText()), await p.evaluate(() => window.__T.config.pins.master)], [true, '4321']);
await p.locator('#pin_s1').fill('555555'); await p.locator('[data-act="savePins"]').click(); await p.waitForTimeout(400);
ok('Save writes the typed ones', await p.evaluate(() => [window.__T.config.pins.master, window.__T.config.pins.s1]), ['987654', '555555']);
ok('and keeps the one left blank', await p.evaluate(() => window.__T.config.pins.s2), '2222');
ok('then empties the boxes', await p.evaluate(() => [...document.querySelectorAll('.pinbox')].every(i => i.value === '')), true);
ok('and says so', /Saved/.test(await p.locator('.panel .eyebrow').innerText()), true);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
