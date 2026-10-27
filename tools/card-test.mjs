/* A GOLFER'S CARD, FROM ANY BOARD. Tap a name on the MVP board, the practice
   board, the recap or the turn, and the whole card comes up: every hole,
   par and index, strokes received, gross and net, the marks, the nines
   added up, while the round is still going. A team on the Team board opens
   both cards side by side with the better ball picked out.
   The phone's clock is set to Thursday 29 October, Round 1 under way.
   Run: node tools/card-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
writeFileSync(S + '/card.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
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
const text = async sel => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();

await p.clock.install({ time: new Date('2026-10-29T08:00:00Z') });
await p.goto('file://' + S + '/card.html'); await p.waitForTimeout(3500); await shut();
/* Round 1 live: Ray V (hcp 20) nine holes in with a birdie, a water ball and a pick-up; Drea (hcp 25) six holes in */
await p.evaluate(() => { const T = window.__T;
  T.config.pairs = [{ id: 'p1', members: ['g1', 'g2'] }, { id: 'p3', members: ['g6', 's4'] }];
  T.config.people.find(x => x.id === 's4').role = 'golfer';
  const bands = { g1: 20, g2: 25, g6: 20, s4: 25 };
  T.config.people.forEach(x => { if (bands[x.id]) x.band = bands[x.id]; });
  T.config.rounds.r1.state = 'open';
  const card = (raw, marks = {}) => ({ raw: raw.concat(Array(18 - raw.length).fill(null)), by: Object.fromEntries(raw.map((_, i) => [i, 's1'])), at: {}, marks, mF: true, mB: false, bb: false });
  T.scores['r1__g6'] = card([4, 2, 6, 4, 9, 4, 5, 3, 4], { 2: ['water'], 4: ['water', 'putt3'] });
  T.scores['r1__s4'] = card([5, 4, 6, 5, 7, 5]);
  T.scores['r1__g1'] = card([5, 4, 5, 4, 6, 4, 5, 3, 5]); T.scores['r1__g2'] = card([5, 5, 5, 4, 6, 5, 5, 4, 5]);
  T.scores['practice__g6'] = card([5, 3, 5, 4, 6, 4, 5, 3, 4, 5, 5, 4, 3, 5, 4, 5, 3, 6]);
  window.__UI.screen = 'boards'; window.__UI.boardTab = 'mvp'; window.__forceRender(); });
await p.waitForTimeout(400); await shut();
const course = await p.evaluate(() => { const c = window.__T.config.courses.olympos; return { par: c.holes.map(h => h.par), si: c.holes.map(h => h.si) }; });

console.log('\nfrom the MVP board');
ok('every name on the MVP board is a button', await p.locator('.bdr.mvp .namebtn').count(), await p.locator('.bdr.mvp').count());
await tap('.bdr.mvp .namebtn:has-text("Ray V")');
ok('tapping Ray V opens his card for the round being played', [await p.locator('.cardsheet').count(), await text('.cardsheet .mbanner')], [1, 'Ray V ROUND 1 · CULLINAN OLYMPOS · HCP 20 · THRU 9 · LIVE']);
ok('eighteen holes, nine played', [await p.locator('.cs-table .cs-row:not(.cs-head):not(.cs-sum)').count(), await p.locator('.cs-row.todo').count()], [18, 9]);
const h2 = p.locator('.cs-table .cs-row').nth(2);
ok('a hole reads par, index, strokes received, gross and net', (await h2.innerText()).replace(/\s+/g, ' ').trim(), `2 ${course.par[1]} ${course.si[1]} ${course.si[1] <= 2 ? 2 : 1} 2 ${2 - (course.si[1] <= 2 ? 2 : 1)}`);
ok('and is coloured for what it was', await h2.locator('.cs-g').getAttribute('class'), course.par[1] - 2 >= 2 ? 'cs-g eagle' : 'cs-g birdie');
const h5 = p.locator('.cs-table .cs-row').nth(5);
ok('the marks ride beside the gross: water and a three-putt on the 5th', await h5.locator('.cs-g i').innerText(), '≈3·');
ok('a nine on a par ' + course.par[4] + ' is capped for net, and says so', [await h5.locator('.cs-g').evaluate(e => e.classList.contains('capped')), (await h5.locator('.cs-n').innerText()).trim()],
  [9 > course.par[4] + 3, String(Math.min(9, course.par[4] + 3) - (course.si[4] <= 2 ? 2 : 1))]);
const out = await text('.cs-row.cs-sum:has-text("Out")');
const grossOut = [4, 2, 6, 4, 9, 4, 5, 3, 4].reduce((a, v) => a + v, 0);
ok('the front nine adds up', out.startsWith('Out ') && out.includes(' ' + grossOut + ' '), true);
ok('the tile says the round so far, raw and net', /^This round \d+ raw [+−E]\d* · net [+−E]\d* · thru 9$/i.test(await text('.cs-tile')), true);
ok('the mulligan spent is noted', /front mulligan/.test(await text('.cs-key')), true);
await shot('card-ray');
ok('Ray V has a practice card too, offered as a tab', await p.locator('.cs-rounds button').allInnerTexts(), ['Practice', 'Round 1']);
await tap('.cs-rounds button:has-text("Practice")');
ok('which flips the sheet to that round, all eighteen in', [await text('.cs-rounds button.on'), await p.locator('.cs-row.todo').count()], ['Practice', 0]);
await shut();

console.log('\nfrom the Team board');
await p.evaluate(() => { window.__UI.boardTab = 'pairs'; window.__UI.boardRound = 'r1'; window.__forceRender(); }); await p.waitForTimeout(300); await shut();
await tap('.bdr.pairs .namebtn:has-text("Ray V & Drea")');
ok('a team opens both cards side by side', [await p.locator('.cardsheet.two').count(), (await p.locator('.cs-head .cs-g').allInnerTexts()).map(t => t.toUpperCase())], [1, ['RV GROSS', 'D GROSS']]);
const r1 = p.locator('.cs-table .cs-row').nth(1);
ok('with the better ball picked out on each hole', (await r1.locator('.cs-b').innerText()).trim(), String(Math.min(4 - (course.si[0] <= 2 ? 2 : 1), 5 - (course.si[0] <= 7 ? 2 : 1))));
ok('and a hole only one of them has played takes that one', (await p.locator('.cs-table .cs-row').nth(7).locator('.cs-b').innerText()).trim(), String(5 - (course.si[6] <= 2 ? 2 : 1)));
await shot('card-pair');
ok('the two cards fit a phone without sideways scroll', await p.evaluate(() => { const t = document.querySelector('.cs-table'); return t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= innerWidth; }), true);
await shut();

console.log('\nfrom the practice board and the recap');
await p.evaluate(() => { window.__UI.boardTab = 'practice'; window.__forceRender(); }); await p.waitForTimeout(300); await shut();
await tap('.pboard .namebtn:has-text("Ray V")');
ok('the practice board opens the practice card', await text('.cs-rounds button.on'), 'Practice');
await shut();
await p.evaluate(() => { window.__UI.recapOpen = true; window.__UI.recap = { rid: 'r1', busy: false, err: '', stream: '', edit: false, view: 'report' }; window.__forceRender(); }); await p.waitForTimeout(500);
await tap('.recfield .namebtn:has-text("Drea")');
ok('and Every card in the recap opens that golfer’s', await text('.cardsheet .mbanner'), 'Drea ROUND 1 · CULLINAN OLYMPOS · HCP 25 · THRU 6 · LIVE');
await shut();

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
