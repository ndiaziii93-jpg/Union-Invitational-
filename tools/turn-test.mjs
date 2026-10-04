/* The turn, on two phones at once.
 *
 * Nine holes in is the only moment in a round when everybody is still out
 * there and something is already decided. The point of this window is not
 * that the ref sees it — the ref just scored the hole and knows. It is that
 * it reaches the OTHER phones: the group behind, and whoever is by the pool.
 *
 * So the ninth is not a pop-up on one device. It is a write to the shared
 * book, and this test proves the second phone — which scored nothing and was
 * sitting on another screen — puts the same window up.
 *
 * Run: node tools/turn-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
/* The database snapshots live in the repo, not the scratchpad: the
   scratchpad is wiped when the container restarts, and a fixture a test
   cannot find is not a fixture. Rebuild them with tools/make-fixtures.mjs. */
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/\/$/, '');
const page = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8') + '</body></html>';
writeFileSync(S + '/turn.html', page('dist/union-invitational.html'));

const LIVE = JSON.parse(readFileSync(FIX + '/db7/config/tournament.json', 'utf8'));
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(FIX + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(FIX + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(FIX + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(FIX + '/restore/pairs/' + f, 'utf8'));

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const store = JSON.parse(JSON.stringify(seed));
const listeners = [];
const merge = (dst, src) => {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], v);
    else dst[k] = JSON.parse(JSON.stringify(v));
  }
  return dst;
};
const srvGet = path => (path in store ? JSON.parse(JSON.stringify(store[path])) : null);
const srvList = coll => Object.keys(store).filter(k => k.startsWith(coll + '/'))
  .map(k => ({ id: k.slice(coll.length + 1), body: JSON.parse(JSON.stringify(store[k])) }));
const srvSet = (path, d) => { store[path] = JSON.parse(JSON.stringify(d)); listeners.forEach(f => f(path)); };
const srvUpdate = (path, d) => { if (!(path in store)) throw new Error('not-found');
  merge(store[path], d); listeners.forEach(f => f(path)); };
const srvDelete = path => { delete store[path]; listeners.forEach(f => f(path)); };

const MOCK = () => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, e = true, id = '') => ({ id, exists: e, data: () => (e ? deepFreeze(b) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false } });
  const subs = { doc: {}, coll: {} };
  window.__deliver = async (path) => {
    const coll = path.split('/')[0];
    for (const fn of (subs.doc[path] || [])) { const d = await window.srvGet(path); fn(snap(d, !!d)); }
    for (const fn of (subs.coll[coll] || [])) {
      const rows = await window.srvList(coll);
      fn({ docs: rows.map(r => snap(r.body, true, r.id)) });
    }
  };
  const docRef = path => ({ id: path.split('/').pop(), path,
    get: async () => { const d = await window.srvGet(path); return snap(d, !!d); },
    set: async d => { await window.srvSet(path, clone(d)); },
    update: async d => { await window.srvUpdate(path, clone(d)); },
    delete: async () => { await window.srvDelete(path); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn);
      window.srvGet(path).then(d => fn(snap(d, !!d))); return () => {}; } });
  const collRef = c => ({ path: c, doc: id => docRef(c + '/' + id),
    get: async () => ({ docs: (await window.srvList(c)).map(r => snap(r.body, true, r.id)) }),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn);
      window.srvList(c).then(rows => fn({ docs: rows.map(r => snap(r.body, true, r.id)) })); return () => {}; } });
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
/* A CONTEXT EACH, not two tabs. Seen-ness is kept in localStorage — two
   people must both get the window, and neither should get it twice — and two
   pages in one context share that storage, so the second phone would read
   the first phone's "already seen" and stay silent. Two phones do not share
   a localStorage; two tabs do. */
const pages = [];
for (let i = 0; i < 2; i++) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR (device ' + (i + 1) + '):', String(e).split('\n')[0]); fails.push('pageerror'); });
  await p.exposeFunction('srvGet', srvGet);
  await p.exposeFunction('srvList', srvList);
  await p.exposeFunction('srvSet', (path, d) => { srvSet(path, d); });
  await p.exposeFunction('srvUpdate', (path, d) => { srvUpdate(path, d); });
  await p.exposeFunction('srvDelete', path => { srvDelete(path); });
  await p.addInitScript(MOCK);
  await p.goto('file://' + S + '/turn.html');
  pages.push(p);
}
listeners.push(path => { for (const p of pages) p.evaluate(x => window.__deliver(x), path).catch(() => {}); });
const [A, B] = pages;

/* Clear everything EXCEPT the window under test. */
const shut = async p => { for (let i = 0; i < 6; i++) {
  if (await p.locator('.turnmodal').count()) return;
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async (p, t) => { await shut(p); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(600); await shut(p); };
for (const p of pages) { await p.waitForTimeout(2800); await shut(p); }

// bands, so the figures in the window are real
await tab(A, 'Roster');
const rows = await A.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = A.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await A.waitForTimeout(90);
}
/* Squads, on the screen built for them.
   This was being done on the Roster tab, which carries a flag per golfer but
   no way to clear them — the clear button and the squad rows both live on
   the Ryder tab. So the clear silently did nothing, and the taps cycled the
   fixture's existing squads onwards (unassigned → USA → UK → unassigned),
   walking golfers off the board one at a time. */
await tab(A, 'Ryder');
if (await A.locator('[data-act="clearSquads"]').count()) {
  await A.locator('[data-act="clearSquads"]').click(); await A.waitForTimeout(800);
}
const sq = A.locator('.sqrow [data-act="cycleSquad"]');
const nsq = await sq.count();
for (let i = 0; i < nsq; i++) {
  const taps = (i % 2) ? 2 : 1;            // alternate USA and UK down the list
  for (let k = 0; k < taps; k++) { await sq.nth(i).click(); await A.waitForTimeout(90); }
}
await A.waitForTimeout(700); await shut(A);
/* Read them back rather than assuming the taps landed. Everything about the
   cup downstream is meaningless without two squads, and a test that goes on
   regardless reports three cup failures for one setup that did not take. */
const squads = await A.locator('.sqrow .sqlabel').allInnerTexts();
const nUK = squads.filter(t => /UK/.test(t)).length;
const nUS = squads.filter(t => /USA/.test(t)).length;
console.log('          (squads: UK ' + nUK + ', USA ' + nUS + ', unassigned '
  + (squads.length - nUK - nUS) + ')');
ok('both squads have golfers in them', nUK > 0 && nUS > 0, true);

await tab(A, 'Score Entry');
await A.locator('.rcard:not(.practice)').first().click(); await A.waitForTimeout(600); await shut(A);
for (const f of ['ctpHole', 'ldHole']) {
  const sel = A.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count() && !await sel.inputValue()) {
    const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
    if (opts.length) { await sel.selectOption(opts[0]); await A.waitForTimeout(450); await shut(A); }
  }
}
if (await A.locator('[data-act="openRound"]').count()) {
  await A.locator('[data-act="openRound"]').first().click(); await A.waitForTimeout(1300); await shut(A);
}
ok('a round is open', !!Object.values(store['config/tournament'].rounds).find(r => r.state === 'open'), true);
const rid = Object.entries(store['config/tournament'].rounds).find(([, r]) => r.state === 'open')[0];

// device B is somewhere else entirely, scoring nothing
await tab(B, 'Leaderboards');

const playHole = async (p, i) => {
  await shut(p);
  await p.locator('.hcell').nth(i).click(); await p.waitForTimeout(420); await shut(p);
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let k = 0; k < c; k++) { await plus.nth(k).click(); await p.waitForTimeout(60); }
  /* A name against Bingo, so the side game has a leader to put on the
     window — and so the notice about the three does not stand in the way of
     every single save. */
  const bg = p.locator('[data-act="setBbb"][data-a="bingo"]');
  if (await bg.count()) {
    /* The list holds "Nobody yet" and THIS GROUP's golfers, and a group is
       not always a fourball — a pair holding a non-golfer contributes fewer.
       Pick within what is actually there. */
    const opts = await bg.locator('option').count();
    if (opts > 1) { await bg.selectOption({ index: 1 + (i % (opts - 1)) }); await p.waitForTimeout(200); }
  }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(700);
};

console.log('\nthe first eight holes are not the turn');
const groups = await A.locator('.gchip').count();
ok('there is more than one group out', groups > 1, true);
console.log('          (' + groups + ' groups out)');

/* EVERY GROUP TEES OFF FIRST. A cup match counts only the holes BOTH
   players have finished, and the draw puts opponents in different groups —
   so with one group round and the rest on the tee, almost every match reads
   as not started and the cup has nothing to show. Groups go off back to
   back in life; two holes apiece is what that looks like. */
/* Forced, and scrolled to first. Two pages are live on one store here, so
   B's subscription redraws A underneath the pointer and a chip never settles
   long enough for Playwright to call it stable — it waits for calm that is
   not coming. The tap itself has never been in doubt. */
const pickGroup = async (g) => {
  for (let try_ = 0; try_ < 3; try_++) {
    const chip = A.locator('.gchip').nth(g);
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await chip.click({ force: true });
    await A.waitForTimeout(500);
    /* A half-entered hole is not thrown away silently: the switch raises
       "Hole n is not saved" and its Cancel means STAY. Take the discard. */
    const alt = A.locator('[data-act="confirmAlt"]');
    if (await alt.count()) { await alt.first().click({ force: true }); await A.waitForTimeout(500); }
    await shut(A);
    const on = await A.locator('.gchip.on').first().getAttribute('data-a').catch(() => null);
    if (String(on) === String(g)) return;
  }
  ok('the group chip takes a tap (' + g + ')', await A.locator('.gchip.on').first().innerText(), 'group ' + g);
};
for (let g = 1; g < groups; g++) {
  await pickGroup(g);
  for (let i = 0; i < 2; i++) await playHole(A, i);
}
await pickGroup(0);

for (let i = 0; i < 8; i++) await playHole(A, i);
await shut(A);
ok('nothing written to the book yet',
  Object.keys((store['config/tournament'].rounds[rid] || {}).turn || {}), []);
ok('and no window on either phone',
  [await A.locator('.turnmodal').count(), await B.locator('.turnmodal').count()], [0, 0]);

console.log('\nthe ninth goes in');
await playHole(A, 8);
await A.waitForTimeout(600);
ok('the turn is written to the shared book',
  Object.keys((store['config/tournament'].rounds[rid] || {}).turn || {}).length, 1);

/* The ref may have the Bingo Bango Bongo notice in the way first; that is by
   design, and the turn is behind it rather than lost. */
await shut(A); await A.waitForTimeout(700);
ok('the window is up on the phone that scored it', await A.locator('.turnmodal').count(), 1);

console.log('\nand it reaches the phone that scored nothing');
await B.waitForTimeout(1200);
ok('device B has it too', await B.locator('.turnmodal').count(), 1);
ok('having scored nothing and never left the boards',
  await B.locator('[data-act="saveHole"]').count(), 0);

console.log('\nwhat it actually says');
const txt = await A.locator('.turnmodal').innerText();
ok('it says who made the turn', /made the turn/i.test(txt), true);
ok('it is the first group through', /first group/i.test(await A.locator('.tn-pace').innerText()), true);
const cardLabels = (await A.locator('.tn-card .l').allInnerTexts()).map(t => t.trim().toLowerCase());
console.log('          (the cards are: ' + cardLabels.join(' / ') + ')');
/* The order the week is decided in: the pairing, then the golfer, then the
   side game. */
ok('team first, then the golfer, then the side game', cardLabels,
  ['leading pair', 'leading golfer', 'bingo bango bongo']);

/* The cup is not a card. It is match play, it belongs to the squads rather
   than to a pairing, and it is drawn the way it is drawn everywhere else in
   the book: two flags and the score. */
ok('the cup is a band of its own', await A.locator('.tn-cup').count(), 1);
ok('with both flags on it', await A.locator('.tn-cup svg').count(), 2);
/* The cup is points and nothing else. A stroke count under the flags read
   like part of the cup and settles no match — what DOES matter there is how
   many points are still to play for. */
const note = await A.locator('.tn-cupnote').count() ? await A.locator('.tn-cupnote').innerText() : '';
console.log('          (under the cup: ' + note.trim() + ')');
ok('it says how many points are still to play for', /match(es)? still out/.test(note), true);
ok('and nothing about strokes, which settle no match',
  /per card|stroke/i.test(note), false);

ok('every card in the field is listed', await A.locator('.tn-field .tn-row').count() > 0, true);
ok('with the group that turned marked out', await A.locator('.tn-field .tn-row.me').count() > 0, true);
/* IT FITS ACROSS, AND IT IS ALLOWED TO BE LONG. The window carries four
   bands and then every card in the field, so on a phone it runs past the
   bottom — and that is the shape that fixed the choppy sliding: the scrim
   is the one surface that scrolls, and the page behind it is pinned. */
const fit = await A.evaluate(() => {
  const m = document.querySelector('.turnmodal').getBoundingClientRect();
  const s = document.querySelector('.scrim');
  return { left: m.left, right: m.right, w: window.innerWidth, h: Math.round(m.height),
    vh: window.innerHeight,
    scrolls: s.scrollHeight > s.clientHeight + 1,
    pinned: document.documentElement.classList.contains('noscroll')
      && getComputedStyle(document.documentElement).overflow === 'hidden' };
});
console.log('          (' + Math.round(fit.right - fit.left) + 'px across in ' + fit.w
  + ', ' + fit.h + 'px down in ' + fit.vh + ')');
ok('it fits the phone across', fit.left >= -0.5 && fit.right <= fit.w + 0.5, true);
ok('and where it runs past the bottom, the scrim is what scrolls',
  fit.h <= fit.vh || fit.scrolls, true);
ok('with the page behind it pinned', fit.pinned, true);

console.log('\nonce seen, it is not shown again');
await A.locator('.turnmodal [data-act="modalCancel"]').click(); await A.waitForTimeout(800);
ok('it closes', await A.locator('.turnmodal').count(), 0);
await A.evaluate(() => window.__forceRender && window.__forceRender());
await A.waitForTimeout(700);
ok('and does not come straight back', await A.locator('.turnmodal').count(), 0);

console.log('\nthe group behind turns, and is told where it stands');
await B.locator('.turnmodal [data-act="modalCancel"]').click().catch(() => {});
await B.waitForTimeout(400);
const chips = await A.locator('.gchip').count();
if (chips > 1) {
  await pickGroup(1);
  for (let i = 0; i < 9; i++) await playHole(A, i);
  await shut(A); await A.waitForTimeout(800);
  ok('and the book now holds a turn for each of them',
    Object.keys((store['config/tournament'].rounds[rid] || {}).turn || {}).length, 2);
  ok('the second group gets a window too', await A.locator('.turnmodal').count(), 1);
  const pace = await A.locator('.tn-pace').innerText();
  console.log('          (the pace line reads: ' + pace.trim() + ')');
  ok('and it is measured against the group in front',
    /at the same point/i.test(pace), true);
  ok('every group out is on the board',
    await A.locator('.tn-rows').first().locator('.tn-row').count(), groups);
} else { ok('there is a second group to check', chips > 1, true); }

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
