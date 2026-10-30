/* A GOLFER'S CARD, FROM ANY BOARD. Tap a name on the MVP board, the practice
   board, the recap or the turn, and the whole card comes up: every hole,
   par and index, strokes received, gross and net, the marks, the nines
   added up, while the round is still going. A team on the Team board opens
   both cards side by side with the better ball picked out.
   The phone's clock is set to Friday 30 October, Round 1 under way.
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

await p.clock.install({ time: new Date('2026-10-30T10:00:00Z') });
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
const course = await p.evaluate(() => { const c = window.__T.config.courses.aspendos; return { par: c.holes.map(h => h.par), si: c.holes.map(h => h.si) }; });

console.log('\nfrom the MVP board');
ok('every name on the MVP board is a button', await p.locator('.bdr.mvp .namebtn').count(), await p.locator('.bdr.mvp').count());
await tap('.bdr.mvp .namebtn:has-text("Ray V")');
ok('tapping Ray V opens his card for the round being played', [await p.locator('.cardsheet').count(), await text('.cardsheet .mbanner')], [1, 'Ray V ROUND 1 · CULLINAN ASPENDOS · YELLOW TEES · FRI 30 OCT · LIVE']);
const labels = async () => (await p.locator('.sc-nine').first().locator('.sc-r .sc-l').allInnerTexts()).map(t => t.toUpperCase());
const col = async (h, sel) => (await p.locator(`.sc-gross .sc-c[data-h="${h}"]`).first().evaluate((e, sel) => sel ? e.querySelector(sel) && e.querySelector(sel).textContent.trim() : e.className, sel));
ok('holes run across, the nines one under the other, eighteen cells with nine filled', [await p.locator('.sc-nine').count(), await p.locator('.sc-gross .sc-c').count(), await p.locator('.sc-gross .sc-c.has').count()], [2, 18, 9]);
ok('a row each for the hole, par, index and metres, then gross, net and the team game’s points', await labels(), ['HOLE', 'PAR', 'INDEX', 'METRES', 'GROSS', 'NET', 'PTS']);
/* the team game plays off 85% of the handicap: 20 becomes 17, one stroke a hole on index 1–17 and none on 18 */
const tst = (hcp, si) => { const h = Math.round(hcp * 0.85); return Math.floor(h / 18) + (si <= h % 18 ? 1 : 0); };
const pts = (gross, hcp, i) => Math.max(0, 2 + course.par[i] - (gross - tst(hcp, course.si[i])));
ok('the points row: the 2nd, a gross 2 off 17, is a birdie or better', await p.locator('.sc-pts .sc-c[data-h="2"] b').first().innerText(), String(pts(2, 20, 1)));
ok('and the 5th, a 9, is nought — no cap needed', await p.locator('.sc-pts .sc-c[data-h="5"] b').first().innerText(), String(pts(9, 20, 4)));
const st2 = course.si[1] <= 2 ? 2 : 1;
ok('the 2nd: the gross with a dot a stroke received, and the net under it', [await col(2, 'b'), (await col(2, '.sc-dots')).length, await p.locator('.sc-net .sc-c[data-h="2"] b').first().innerText()], ['2', st2, String(2 - st2)]);
ok('and a birdie wears a circle', (await col(2)).includes(course.par[1] - 2 >= 2 ? 'g2' : 'g1'), true);
ok('the capped 9 on the 5th wears two squares, says it was capped, and nets off the cap', [(await col(5)).includes('b2'), (await col(5)).includes('capped'), await p.locator('.sc-net .sc-c[data-h="5"] b').first().innerText()],
  [true, 9 > course.par[4] + 3, String(Math.min(9, course.par[4] + 3) - (course.si[4] <= 2 ? 2 : 1))]);
ok('the marks sit in the corner of the cell: water and a three-putt on the 5th', await col(5, 'i'), '≈3·');
const grossOut = [4, 2, 6, 4, 9, 4, 5, 3, 4].reduce((a, v) => a + v, 0);
ok('the front nine adds up at the end of the row', await p.locator('.sc-nine').first().locator('.sc-gross .sc-t').innerText(), String(grossOut));
ok('the tile says the round so far, gross and net, and the handicap he plays off in the team game', /^Ray V · hcp 20 · team 17 \d+ gross [+−E]\d* · net [+−E]\d* · thru 9$/i.test(await text('.cs-tile')), true);
ok('the mulligan spent is noted', /front mulligan/.test(await text('.cs-key')), true);
await shot('card-ray');
ok('Ray V has a practice card too, offered as a tab', await p.locator('.cs-rounds button').allInnerTexts(), ['Practice', 'Round 1']);
await tap('.cs-rounds button:has-text("Practice")');
ok('which flips the sheet to that round, all eighteen in', [await text('.cs-rounds button.on'), await p.locator('.sc-gross .sc-c.has').count()], ['Practice', 18]);
await shut();

console.log('\nfrom the Team board');
await p.evaluate(() => { window.__UI.boardTab = 'pairs'; window.__UI.boardRound = 'r1'; window.__forceRender(); }); await p.waitForTimeout(300); await shut();
await tap('.bdr.pairs .namebtn:has-text("Ray V & Drea")');
ok('a team opens both cards on one sheet: gross, net and points a golfer, then the team’s points', [await p.locator('.cardsheet.two').count(), await labels()],
  [1, ['HOLE', 'PAR', 'INDEX', 'METRES', 'RV', 'NET', 'PTS', 'D', 'NET', 'PTS', 'TEAM']]);
ok('the team takes the better partner’s points on each hole', await p.locator('.sc-best .sc-c[data-h="1"] b').first().innerText(), String(Math.max(pts(4, 20, 0), pts(5, 25, 0))));
ok('and a hole only one of them has played takes that one', await p.locator('.sc-best .sc-c[data-h="7"] b').first().innerText(), String(pts(5, 20, 6)));
ok('the total bar adds the team’s points up', /^Team \d+ pts better partner, each hole$/.test(await text('.sc-tv.team')), true);
await shot('card-pair');
ok('the card fits a phone without sideways scroll', await p.evaluate(() => [...document.querySelectorAll('.sc-nine')].every(t => t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= innerWidth)), true);
await shut();

console.log('\nfrom the practice board and the recap');
await p.evaluate(() => { window.__UI.boardTab = 'practice'; window.__forceRender(); }); await p.waitForTimeout(300); await shut();
await tap('.pboard .namebtn:has-text("Ray V")');
ok('the practice board opens the practice card', await text('.cs-rounds button.on'), 'Practice');
await shut();
await p.evaluate(() => { window.__UI.recapOpen = true; window.__UI.recap = { rid: 'r1', busy: false, err: '', stream: '', edit: false, view: 'report' }; window.__forceRender(); }); await p.waitForTimeout(500);
await tap('.recfield .namebtn:has-text("Drea")');
ok('and Every card in the recap opens that golfer’s', await text('.cardsheet .mbanner'), 'Drea ROUND 1 · CULLINAN ASPENDOS · YELLOW TEES · FRI 30 OCT · LIVE');
ok('with her handicap and how far she is on the tile', /^Drea · hcp 25 · team 21 \d+ gross .* · thru 6$/i.test(await text('.cs-tile')), true);
await shut();

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
