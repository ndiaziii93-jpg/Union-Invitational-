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

/* The round is picked off a card where there is room for one, and off the
   line and the sheet behind it on a phone, where the cards are not drawn. */
const pickRound = async (pg, which) => {
  const card = pg.locator(which === 'practice' ? '.rcard.practice' : '.rcard:not(.practice)').first();
  if (await card.isVisible().catch(() => false)) { await card.click(); return; }
  await pg.locator('.setline').first().click(); await pg.waitForTimeout(400);
  await pg.locator('.scrim .sh-row', { hasText: which === 'practice' ? /Practice/ : /Round 1/ }).first().click();
};


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
  const tab = async t => { await shut(); await goTab(p, t);
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
  await pickRound(p, 'r1'); await p.waitForTimeout(600); await shut();
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
    bothFlagged: gs.every(g => !!g.querySelector('svg')),
  };
});
/* A FLAG IS WHOSE SIDE YOU ARE ON, so both ends carry one. It used to be
   shown only against whoever took the point, which left the loser of every
   match with an empty gutter — and on a day one squad wins the lot, not a
   single flag of the other side anywhere on the screen. The POINT is marked
   separately, on the winner's flag. */
ok('the squad that took the point is marked', won && won.onlyOneSide, true);
ok('and both golfers still carry their own flag', won && won.bothFlagged, true);
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
/* A FIXTURE READS ACROSS. This used to require the opposite — each golfer
   on a line of his own — which turned a match into three loose lines with a
   hand's width of dead paper down the middle of a phone. */
ok('the two golfers are on the same line', await A.p.evaluate(() => {
  const m = document.querySelector('.match');
  const ns = [...m.querySelectorAll('.mn')].map(e => e.getBoundingClientRect());
  if (ns.length !== 2) return 'no names found';
  return Math.abs((ns[0].top + ns[0].height / 2) - (ns[1].top + ns[1].height / 2)) < 4;
}), true);

/* ---------------------------------------------------------------- */
/* FULL RULES IS A FOOTNOTE TO THE BOARD, NOT A JOURNEY. It used to take the
   reader off to the rules page and leave them to find their way back to the
   board and the row they had been looking at. */
console.log('\nthe full rules, without leaving the board');
await A.tab('Boards');
await A.p.locator('.btab', { hasText: 'Team Comp' }).click(); await A.p.waitForTimeout(700); await A.shut();
const wasOn = await A.p.locator('.btab.on').innerText();
ok('the board offers them', await A.p.locator('.rulelink').count() > 0, true);
await A.p.locator('.rulelink').first().click(); await A.p.waitForTimeout(600);
ok('they open in a window', await A.p.locator('.rulemodal').count(), 1);
ok('named for the competition they belong to',
  (await A.p.locator('.rulemodal .mb-t').innerText()).trim(), 'Team Competition');
ok('carrying the whole rule', await A.p.locator('.rulemodal .ru-p').count() > 0, true);
ok('and the worked example', await A.p.locator('.rulemodal .ru-eg').count(), 1);
ok('the board behind it never moved', await A.p.locator('.btab.on').innerText(), wasOn);
await A.p.locator('.rulemodal [data-act="modalCancel"]').click(); await A.p.waitForTimeout(500);
ok('and closing puts nobody anywhere new', await A.p.locator('.btab.on').innerText(), wasOn);
/* Whoever wants the whole book can still have it, from inside the window. */
await A.p.locator('.rulelink').first().click(); await A.p.waitForTimeout(600);
await A.p.locator('[data-act="goRulePage"]').click(); await A.p.waitForTimeout(700);
ok('all the rules is still one tap away', await A.p.locator('.rule-item').count() > 0, true);
ok('and the window got out of the way', await A.p.locator('.rulemodal').count(), 0);

/* EVERY WINDOW OPENS THE SAME WAY: a pine band, the crest struck white on
   it, a name and a line saying what it is about. */
console.log('\nand every window wears the same band');
await A.tab('Boards');
await A.p.locator('.btab', { hasText: 'Team Comp' }).click(); await A.p.waitForTimeout(700); await A.shut();
await A.p.locator('.rulelink').first().click(); await A.p.waitForTimeout(600);
const band = await A.p.evaluate(() => {
  const b = document.querySelector('.scrim .mbanner');
  if (!b) return 'no banner';
  const cs = getComputedStyle(b);
  const crest = b.querySelector('.mb-c');
  const box = b.getBoundingClientRect();
  const win = b.closest('.modal').getBoundingClientRect();
  return {
    pine: cs.backgroundColor,
    hasTitle: !!b.querySelector('.mb-t'),
    crestIsWhite: !!crest && /invert\(1\)/.test(getComputedStyle(crest).filter),
    /* It has to reach both edges of the window, or it is a box inside a box. */
    flush: Math.abs(box.left - win.left) <= 1.5 && Math.abs(box.right - win.right) <= 1.5,
    atTop: Math.abs(box.top - win.top) <= 4,
  };
});
console.log('          (' + JSON.stringify(band) + ')');
/* The deep pine the bar, the strip and the buttons are drawn in. It used to
   be the mid green the book sets WORDS in, which reads flat across a band. */
ok('it is pine', band.pine, 'rgb(29, 46, 33)');
ok('it names the window', band.hasTitle, true);
ok('the crest on it is struck white', band.crestIsWhite, true);
ok('and it runs the full width of the window', band.flush, true);
ok('at the very top of it', band.atTop, true);
await A.p.locator('.rulemodal [data-act="modalCancel"]').click(); await A.p.waitForTimeout(400);

/* ---------------------------------------------------------------- */
console.log('\nthe MVP board, on a 390px screen');
await A.tab('Boards');
await A.p.locator('.btab', { hasText: 'MVP' }).click(); await A.p.waitForTimeout(700); await A.shut();
ok('there are golfers on it', await A.p.locator('.bdr.mvp').count() > 0, true);

/* THE ANSWER COMES FIRST. The board used to open on a title, a lede and then
   a seven-column table; the plate says who is winning before anything else
   on the screen. */
ok('a plate says who is leading', await A.p.locator('.plate').count(), 1);
ok('and it is above the table', await A.p.evaluate(() => {
  const pl = document.querySelector('.plate').getBoundingClientRect();
  const bd = document.querySelector('.bd').getBoundingClientRect();
  return pl.bottom <= bd.top + 1;
}), true);
ok('the name on the plate is the name in first place', await A.p.evaluate(() => {
  const a = document.querySelector('.pl-n').childNodes[0].textContent.trim();
  const b = document.querySelector('.bdr.mvp .w').textContent.trim();
  return a === b;
}), true);
ok('and the figure on it is the figure in the Total column', await A.p.evaluate(() => {
  const a = document.querySelector('.pl-big').textContent.trim();
  const b = document.querySelector('.bdr.mvp .t').textContent.trim();
  return a === b;
}), true);
/* The gap is the number a golfer talks in, and the leader has none. */
ok('the leader has no gap to himself',
  (await A.p.locator('.bdr.mvp .g').first().innerText()).trim(), '\u2014');
ok('and everybody behind has one', await A.p.evaluate(
  () => [...document.querySelectorAll('.bdr.mvp')].slice(1)
    .every(r => /^\+\d+$/.test(r.querySelector('.g').textContent.trim()))), true);

/* The bug this file was written for: the name's BOX shrank politely and its
   TEXT carried straight on over the band figure, because nothing clipped it.
   So the question is not "does the box fit" but "is anything drawn outside
   the box it belongs to", and "does any box hang off the end of its row". */
const spill = await A.p.evaluate(() => {
  const out = [];
  for (const row of document.querySelectorAll('.bdr')) {
    const rb = row.getBoundingClientRect();
    for (const el of row.querySelectorAll('.p, .w, .n, .t, .g')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        what: el.className.replace(/ num|under|over|level/g, '').trim(),
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
/* The property is the NAME on one line, not the row at some height: a row's
   height moves with its padding, a wrapped name is the actual bug. */
ok('every golfer is on one line', await A.p.evaluate(
  () => [...document.querySelectorAll('.bdr.mvp .w')]
    .every(w => w.getBoundingClientRect().height < 30)), true);
ok('the page still does not scroll sideways', await A.p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);
ok('a long name really was long enough to be a problem', await A.p.evaluate(
  () => [...document.querySelectorAll('.bdr.mvp .w')]
    .some(w => /Norberto|Wainwright|McAllister/.test(w.textContent))), true);

console.log('\nand wide, it is the same board with more room');
await A.p.setViewportSize({ width: 1280, height: 1000 }); await A.p.waitForTimeout(600); await A.shut();
ok('still one line a golfer', await A.p.evaluate(
  () => [...document.querySelectorAll('.bdr.mvp .w')]
    .every(w => w.getBoundingClientRect().height < 30)), true);
ok('the column headings are there', await A.p.locator('.bdh.mvp').isVisible(), true);
ok('and the plate is still the first thing on it', await A.p.evaluate(() => {
  const pl = document.querySelector('.plate').getBoundingClientRect();
  const bd = document.querySelector('.bd').getBoundingClientRect();
  return pl.bottom <= bd.top + 1;
}), true);
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
  return { both: gs.every(g => g.classList.contains('half') && !!g.querySelector('svg')),
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
