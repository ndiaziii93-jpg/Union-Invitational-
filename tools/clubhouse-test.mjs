/* THE FRONT PAGE, AND WHAT IT PROMISES.
 *
 * Six games run at once and the book used to make you tap six tabs to find
 * out where any of them stood — with the answer to each one buried under the
 * reference material for that game. The Team Competition standing started
 * 2,111 pixels down a 2,620-pixel page on a phone: par, length, stroke
 * index, three band allowances, the cap, the hole strip and the diagram all
 * came first.
 *
 * Three promises came out of that, and this file holds all three to account:
 *
 *   1. the front page answers all six without scrolling and without tapping
 *   2. every board opens on the answer to that board
 *   3. nothing was lost — the hole and everything on it is still there
 *
 * It sets a real tournament up through the app, because a front page that
 * only works on an empty book is not a front page.
 *
 * Run: node tools/clubhouse-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const goTab = async (pg, t) => {
  const direct = pg.locator('.tab:visible, .navbtn:visible', { hasText: t });
  if (await direct.count()) { await direct.first().click(); return; }
  const door = pg.locator('.masthead [data-act="manageOpen"]');
  if (await door.count()) {
    await door.first().click(); await pg.waitForTimeout(400);
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
const W = S + '/club.html';
writeFileSync(W, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const NAMES = ['Duncan McAllister', 'Norberto Diaz Jr', 'Norberto Diaz III',
  'Christopher Wainwright', 'Alexander Fitzgerald', 'Bartholomew Enriquez'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await goTab(p, t); await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + W);
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(500); await shut();

/* ---------------- an empty book still has a front page ---------------- */
console.log('\nbefore a ball is struck');
await tab('Boards');
ok('the boards open on the front page, not on a board',
  await p.locator('.club').count(), 1);
ok('all six games are on it', await p.locator('.cc').count(), 6);
ok('and each one says what it is waiting for', await p.evaluate(
  () => [...document.querySelectorAll('.cc--empty .cc-none')].every(n => n.textContent.trim().length > 10)), true);

/* ---------------- set a tournament up ---------------- */
await tab('Roster');
for (let i = 0; i < NAMES.length; i++) {
  const c = p.locator('.rtable tbody tr').nth(i).locator('.cellin').first();
  await c.fill(NAMES[i]); await c.blur(); await p.waitForTimeout(150);
}
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(85);
}
for (let i = 0; i < 12; i++) {
  const f = p.locator('.rtable tbody tr').nth(i).locator('[data-act="cycleSquad"]');
  for (let k = 0; k <= (i % 2); k++) { await f.click(); await p.waitForTimeout(85); }
}
await p.waitForTimeout(400); await shut();

await tab('Scores');
await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
/* A round will not open until the two nominated holes are chosen, which is
   the book refusing to start a round nobody can win a prize on. */
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(350); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1200); await shut();
}
for (let h = 0; h < 9; h++) {
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let i = 0; i < c; i++) {
    const taps = ((i + h) % 4);
    for (let k = 0; k < taps; k++) { await plus.nth(i).click(); await p.waitForTimeout(50); }
  }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(620); await shut();
}

/* ---------------- 1. the whole tournament, no scrolling ---------------- */
console.log('\nthe front page answers all six at once');
await p.locator('.navbtn', { hasText: 'Boards' }).first().click(); await p.waitForTimeout(800); await shut();
ok('six cards', await p.locator('.cc').count(), 6);
/* The promise is that the six GAMES are on the glass at once, not that the
   page has no scrollbar: the status line at the foot of every screen sits
   under them and is allowed to be below the fold. What must never be below
   it is a game. */
const fits = await p.evaluate(() => {
  const cs = [...document.querySelectorAll('.cc')];
  const bar = document.querySelector('.tabbar').getBoundingClientRect();
  return { last: Math.round(bar.top - cs[cs.length - 1].getBoundingClientRect().bottom),
           allSeen: cs.every(c => { const r = c.getBoundingClientRect();
             return r.top >= 0 && r.bottom <= bar.top; }),
           at: Math.round(window.scrollY) };
});
console.log('          (the sixth card clears the bar by ' + fits.last + 'px)');
ok('every one of them on the glass at once', fits.last >= 0, true);
ok('without a finger being moved', fits.allSeen && fits.at === 0, true);
ok('and it never scrolls sideways either', await p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);

/* The Cup is the only one of the six with a clock on it, so it leads. */
ok('the Cup is the first card', await p.evaluate(
  () => document.querySelector('.cc').classList.contains('cc--cup')), true);
ok('with a flag at each end of its score', await p.locator('.cc--cup svg').count(), 2);

/* A card is an ANSWER, not a label. */
const team = p.locator('.cc', { hasText: 'Team Competition' });
ok('the team card names a leader', (await team.locator('.cc-n').innerText()).trim().length > 2, true);
ok('with the figure that decides it', (await team.locator('.cc-f').innerText()).trim().length > 0, true);
ok('and who he is ahead of, by how much',
  /ahead of .+ by \d+|tied with|the only card/.test(await team.locator('.cc-b').innerText()), true);
ok('a game with a live round carries the gold', await p.locator('.cc--live').count() > 0, true);

/* The front page and the board behind it cannot disagree. */
const cardLead = (await team.locator('.cc-n').innerText()).trim();
const cardFig = (await team.locator('.cc-f').innerText()).trim();
await team.click(); await p.waitForTimeout(800);
ok('tapping it opens that board', await p.locator('.bdh.pairs').count(), 1);
ok('and the leader on the card is the leader on the board',
  (await p.locator('.bdr.pairs .w').first().innerText()).trim(), cardLead);
ok('with the same figure', (await p.locator('.bdr.pairs .t').first().innerText()).trim(), cardFig);

/* ---------------- 2. every board opens on its own answer ---------------- */
console.log('\nand every board opens on the answer to that board');
for (const [name, grid] of [['Team Competition', '.bdh.pairs'], ['MVP', '.bdh.mvp']]) {
  await p.locator('.btab', { hasText: name }).click(); await p.waitForTimeout(700);
  const where = await p.evaluate(sel => {
    const pl = document.querySelector('.plate');
    const bd = document.querySelector(sel);
    return { plate: !!pl, top: pl ? Math.round(pl.getBoundingClientRect().top + scrollY) : null,
             board: bd ? Math.round(bd.getBoundingClientRect().top + scrollY) : null,
             page: document.documentElement.scrollHeight };
  }, grid);
  console.log('          (' + name + ': plate at ' + where.top + ', table at ' + where.board
    + ', page ' + where.page + ')');
  ok(name + ' leads with a plate', where.plate, true);
  ok('and the table is within one screen of the top', where.board < 844, true);
}

/* The gap column — the number a golfer actually talks in. */
ok('the leader is not given a gap to himself',
  (await p.locator('.bdr.mvp .g').first().innerText()).trim(), '—');

/* ---------------- 3. nothing was lost ---------------- */
console.log('\nand the hole is all still there, one tap away');
await p.locator('.btab', { hasText: 'Team Competition' }).click(); await p.waitForTimeout(700);
ok('the hole is folded away, under the standing', await p.evaluate(() => {
  const f = document.querySelector('.holefold');
  const bd = document.querySelector('.bd');
  return !!f && !f.open && f.getBoundingClientRect().top > bd.getBoundingClientRect().top;
}), true);
ok('and its face says which hole it is',
  /Hole \d+/.test(await p.locator('.holefold summary').innerText()), true);
await p.locator('.holefold summary').click(); await p.waitForTimeout(600);
const inside = await p.evaluate(() => {
  const f = document.querySelector('.holefold');
  const t = f.innerText;
  return {
    strip: f.querySelectorAll('.hcell, .cell').length,
    par: /Par/.test(t), length: /Length/.test(t), index: /Stroke index/.test(t),
    bands: (t.match(/Band \d+ receives/g) || []).length,
    cap: /Picks up at/.test(t),
    teams: /Teams on this hole/.test(t),
    diagram: f.querySelectorAll('.diagram img').length,
  };
});
console.log('          (' + JSON.stringify(inside) + ')');
ok('the hole strip is in it', inside.strip >= 18, true);
ok('par, length and stroke index', inside.par && inside.length && inside.index, true);
ok('what each of the three bands receives', inside.bands, 3);
ok('where the hole picks up', inside.cap, true);
ok('who has played it', inside.teams, true);
ok('and the diagram', inside.diagram, 1);
ok('no name in it wraps to a second line', await p.evaluate(
  () => [...document.querySelectorAll('.holefold .bdr.oh .w')]
    .every(w => w.getBoundingClientRect().height < 30)), true);

/* ---------------- the way back ---------------- */
console.log('\nand the way back is where you left it');
ok('the strip carries the front page first', await p.evaluate(
  () => document.querySelector('.btab').dataset.a), 'home');
ok('it reads as a way back while you are on a board',
  (await p.locator('.btab.home').innerText()).includes('‹'), true);
await p.locator('.btab.home').click(); await p.waitForTimeout(700);
ok('and it takes you there', await p.locator('.club').count(), 1);
ok('where it stops being a way back',
  (await p.locator('.btab.home').innerText()).includes('‹'), false);
/* The long name is still in the page for anything that reads it out. */
ok('every tab still carries its full name', await p.evaluate(
  () => [...document.querySelectorAll('.btab')].map(b => b.getAttribute('aria-label'))),
  ['All games', 'Team Competition', 'MVP', 'Bingo Bango Bongo', 'Ryder Cup',
   'Longest Drive & Closest to the Pin', 'Practice Day']);

/* ---------------- the laptop ---------------- */
console.log('\n=== laptop 1300 ===');
await p.setViewportSize({ width: 1300, height: 950 }); await p.waitForTimeout(700); await shut();
ok('the front page is here too', await p.locator('.club').count(), 1);
ok('with all six cards the same width', await p.evaluate(() => {
  const w = [...document.querySelectorAll('.cc')].map(c => Math.round(c.getBoundingClientRect().width));
  return w.length === 6 && new Set(w).size === 1;
}), true);
ok('and every tab fits without scrolling', await p.evaluate(() => {
  const s = document.querySelector('.btabs');
  return s.scrollWidth <= s.clientWidth + 1;
}), true);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ')
  : '\nSix games, six answers, and the hole still under them.');
process.exit(fails.length ? 1 : 0);
