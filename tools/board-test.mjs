/* The two boards people actually stare at, on the phone they stare at them on.
 *
 * Two complaints, both from a real iPhone:
 *
 *   The Ryder Cup head-to-heads coloured the result pill for the winning
 *   squad, which asks you to know that pine means UK and red means USA. The
 *   point itself now flies a flag, in a gutter at the row's outer edge.
 *
 *   The MVP board is seven columns — Pos, Player, Band, Thru, Today, Pts,
 *   Total — and at 390px the names ran straight over the band figures and
 *   the total hung off the right-hand edge.
 *
 * So this sets a tournament up through the app itself — bands, squads, a
 * full eighteen holes for one group — and then measures the boxes.
 *
 * Run: node tools/board-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/board.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* Names long enough to be the problem. Two Norbertos and a Duncan is what
   the book is actually carrying, and it is the surnames that did the
   damage. */
const NAMES = ['Duncan McAllister', 'Norberto Diaz Jr', 'Norberto Diaz III',
  'Christopher Wainwright', 'Alexander Fitzgerald', 'Bartholomew Enriquez'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* A tournament, set up the way a person would set one up. `level` gives every
   golfer the same band and the same score on every hole, which is the only
   reliable way to make a match finish halved. */
async function setUp(level) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
  const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
    if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
  const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
    await p.waitForTimeout(650); await shut(); };

  await p.goto('file://' + S + '/board.html');
  await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400); await shut();

  await tab('Roster');
  for (let i = 0; i < NAMES.length; i++) {
    const c = p.locator('.rtable tbody tr').nth(i).locator('.cellin').first();
    await c.fill(NAMES[i]); await c.blur(); await p.waitForTimeout(200);
  }
  const rows = await p.locator('.rtable tbody tr').count();
  for (let i = 0; i < rows; i++) {
    const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
    const n = await bs.count(); if (!n) continue;
    await bs.nth(level ? 0 : i % n).click(); await p.waitForTimeout(110);
  }
  // squads: even rows to the United States, odd rows to the United Kingdom
  for (let i = 0; i < 12; i++) {
    const f = p.locator('.rtable tbody tr').nth(i).locator('[data-act="cycleSquad"]');
    for (let k = 0; k <= (i % 2); k++) { await f.click(); await p.waitForTimeout(110); }
  }
  await p.waitForTimeout(500); await shut();

  await tab('Scores');
  await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
  for (const f of ['ctpHole', 'ldHole']) {
    const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
    if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(350); await shut(); }
  }
  if (await p.locator('[data-act="openRound"]').count()) {
    await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1200); await shut();
  }
  for (let h = 0; h < 18; h++) {
    const plus = p.locator('.step.plus'); const c = await plus.count();
    for (let i = 0; i < c; i++) {
      const taps = level ? 1 : (i % 3) + 1;
      for (let k = 0; k < taps; k++) { await plus.nth(i).click(); await p.waitForTimeout(70); }
    }
    await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(750); await shut();
  }
  return { ctx, p, tab, shut };
}

/* ---------------------------------------------------------------- */
console.log('\nthe point flies a flag');
const A = await setUp(false);
await A.tab('Ryder');
await A.p.waitForSelector('.match.done', { timeout: 15000 }).catch(() => {});

ok('a match has been settled', await A.p.locator('.match.done').count() > 0, true);
const won = await A.p.evaluate(() => {
  const m = [...document.querySelectorAll('.match.done')].find(x => x.querySelector('.mp.got'));
  if (!m) return null;
  const gs = [...m.querySelectorAll('.mp')];
  const left = gs[0].classList.contains('got'), right = gs[1].classList.contains('got');
  const flag = m.querySelector('.mp.got svg');
  return {
    onlyOneSide: left !== right,
    side: left ? 'left' : 'right',
    flag: flag ? flag.getAttribute('aria-label') : null,
    half: !!m.querySelector('.mp.got.half'),
    /* the winner's name carries the weight as well, so the row reads without
       anyone having to decode a colour */
    boldIsWinner: (() => { const ns = [...m.querySelectorAll('.mn')];
      return ns.filter(n => n.classList.contains('win')).length === 1
        && ns[left ? 0 : 1].classList.contains('win'); })(),
    empty: gs[left ? 1 : 0].innerHTML.trim() === '',
  };
});
ok('one side of a finished match is flagged', won && won.onlyOneSide, true);
ok('and the other side is left plain', won && won.empty, true);
ok('the flag names its squad out loud', (won && won.flag) === 'United Kingdom'
  || (won && won.flag) === 'United States', true);
ok('the United Kingdom flies on the left, the United States on the right',
  won && ((won.side === 'left') === (won.flag === 'United Kingdom')), true);
ok('the winner is the name in bold', won && won.boldIsWinner, true);
ok('a whole point is not marked as a half', won && won.half, false);

/* A match still out on the course must NOT be flagged — a flag there reads
   as a result, and the pill already says who is up. */
ok('nothing is flagged before a match is finished', await A.p.evaluate(
  () => [...document.querySelectorAll('.match:not(.done)')]
    .every(m => !m.querySelector('.mp.got'))), true);
ok('and the gutters are still there, so the names stay in line', await A.p.evaluate(
  () => [...document.querySelectorAll('.match')].every(m => m.querySelectorAll('.mp').length === 2)), true);

console.log('\nand the whole fixture fits the phone');
ok('nothing on the page scrolls sideways', await A.p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);
ok('no match row spills past the page', await A.p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  return [...document.querySelectorAll('.match')].every(m => {
    const r = m.getBoundingClientRect();
    return r.left >= -1 && r.right <= w + 1;
  });
}), true);
ok('the two golfers are on lines of their own', await A.p.evaluate(() => {
  const m = document.querySelector('.match');
  const ns = [...m.querySelectorAll('.mn')].map(e => e.getBoundingClientRect());
  if (ns.length !== 2) return 'no names found';
  return ns[1].top >= ns[0].bottom - 1;   // the second name starts below the first
}), true);

/* ---------------------------------------------------------------- */
console.log('\nthe MVP board, on a 390px screen');
await A.tab('Boards');
await A.p.locator('.btab', { hasText: 'MVP' }).click(); await A.p.waitForTimeout(700); await A.shut();
ok('there are golfers on it', await A.p.locator('.rows .row').count() > 0, true);

const boxes = await A.p.evaluate(() => {
  const out = [];
  for (const row of document.querySelectorAll('.mvprow')) {
    const r = el => { const x = el.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom }; };
    const who = r(row.querySelector('.who'));
    const total = r(row.querySelector('.big'));
    const meta = [...row.querySelectorAll('.mvpmeta .n')].map(r);
    out.push({ who, total, meta, box: r(row),
      name: row.querySelector('.who').textContent.trim(),
      /* an ellipsis is a deliberate answer to a long name; a name drawn wider
         than the box it sits in is the bug */
      spills: row.querySelector('.who').getBoundingClientRect().right > r(row).r + 1 });
  }
  return out;
});
ok('every row has all four working figures', boxes.every(x => x.meta.length === 4), true);
ok('no name is drawn over the figures', boxes.every(x =>
  x.who.r <= x.total.l + 1 || x.who.b <= x.total.t + 1), true);
ok('the figures do not sit on top of each other', boxes.every(x =>
  x.meta.every((m, i) => i === 0 || m.l >= x.meta[i - 1].r - 1)), true);

/* The bug was not boxes overlapping — the name's BOX shrank politely and
   its TEXT carried straight on over the band figure, because nothing
   clipped it. So the question is not "does the box fit" but "is anything
   drawn outside the box it belongs to", and, separately, "does any box hang
   off the end of its row" — which is what took the Total column off the
   right-hand edge of the screen. */
/* Deliberately NOT .mvprow: that class arrived with the fix, and a check
   that cannot even find the old markup cannot fail against it. `.rows .row`
   is what an MVP row was called before and still is. */
const spill = await A.p.evaluate(() => {
  const out = [];
  for (const row of document.querySelectorAll('.rows .row')) {
    const rb = row.getBoundingClientRect();
    for (const el of row.querySelectorAll('.pos, .who, .n, .big')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        what: (el.dataset.l || el.className.replace(/ num| quiet/g, '')).trim(),
        text: el.textContent.trim().slice(0, 24),
        drawnOutside: el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible',
        pastTheRow: r.right > rb.right + 1 || r.left < rb.left - 1,
      });
    }
  }
  return out;
});
ok('nothing is drawn outside the box it belongs to',
  spill.filter(x => x.drawnOutside).map(x => x.what + ' \u2014 ' + x.text), []);
ok('and nothing hangs off the end of its row',
  spill.filter(x => x.pastTheRow).map(x => x.what + ' \u2014 ' + x.text), []);
ok('the total is on the same line as the name, not below it', boxes.every(x =>
  x.total.t < x.who.b), true);
ok('and the working out is below both', boxes.every(x => x.meta[0].t >= x.who.b - 1), true);
ok('every figure says what it is', await A.p.evaluate(
  () => [...document.querySelectorAll('.mvprow .mvpmeta .n')].map(e => e.dataset.l)
    .slice(0, 4)), ['Band', 'Thru', 'Today', 'Pts']);
ok('the page still does not scroll sideways', await A.p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);
ok('a long name really was long enough to be a problem', boxes.some(
  x => /Norberto|Wainwright|McAllister/.test(x.name)), true);

console.log('\nand wide, it is the table it always was');
await A.p.setViewportSize({ width: 1280, height: 1000 }); await A.p.waitForTimeout(600); await A.shut();
ok('every golfer is back on one line', await A.p.evaluate(() =>
  [...document.querySelectorAll('.mvprow')].every(row => {
    const who = row.querySelector('.who').getBoundingClientRect();
    const last = row.querySelector('.mvpmeta .n:last-child').getBoundingClientRect();
    return Math.abs(who.top - last.top) < 12;
  })), true);
ok('the column headings are back', await A.p.locator('.rows.mvp .rowhead').isVisible(), true);
ok('and the labels are not printed twice', await A.p.evaluate(() => {
  const n = document.querySelector('.mvprow .mvpmeta .n');
  return n ? getComputedStyle(n, '::before').content : 'no figures found';
}), 'none');
await A.ctx.close();

/* ---------------------------------------------------------------- */
console.log('\na halved match gives both ends a half');
const H = await setUp(true);
await H.tab('Ryder');
await H.p.waitForSelector('.match.done', { timeout: 15000 }).catch(() => {});
const halved = await H.p.evaluate(() => {
  const m = [...document.querySelectorAll('.match.done')]
    .find(x => /halved/i.test(x.querySelector('.st').textContent));
  if (!m) return null;
  const gs = [...m.querySelectorAll('.mp')];
  return { both: gs.every(g => g.classList.contains('got') && g.classList.contains('half')),
    marks: gs.map(g => (g.querySelector('.pt') || {}).textContent || ''),
    flags: gs.map(g => { const s = g.querySelector('svg'); return s ? s.getAttribute('aria-label') : null; }),
    bold: [...m.querySelectorAll('.mn.win')].length };
});
ok('a match finished level', !!halved, true);
ok('both ends are flagged', halved && halved.both, true);
ok('each marked a half', halved && halved.marks, ['½', '½']);
ok('one flag each', halved && halved.flags, ['United Kingdom', 'United States']);
ok('and neither name is called the winner', halved && halved.bold, 0);
await H.ctx.close();

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
  : '\nThe point flies a flag, and the MVP board fits the phone.');
process.exit(fails.length ? 1 : 0);
