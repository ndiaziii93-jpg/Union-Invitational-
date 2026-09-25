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
const page = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8') + '</body></html>';
writeFileSync(S + '/turn.html', page('dist/union-invitational.html'));

const LIVE = JSON.parse(readFileSync(S + '/db7/config/tournament.json', 'utf8'));
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(S + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(S + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

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
/* Squads, so "which team is leading" has two teams to compare. */
const sq = A.locator('[data-act="cycleSquad"]');
const nsq = await sq.count();
for (let i = 0; i < nsq; i++) {
  const taps = (i % 2) ? 2 : 1;            // alternate UK and USA down the list
  for (let k = 0; k < taps; k++) { await sq.nth(i).click(); await A.waitForTimeout(80); }
}
await A.waitForTimeout(600); await shut(A);

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
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(700);
};

console.log('\nthe first eight holes are not the turn');
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
ok('there is a leading golfer on it', cardLabels.includes('leading golfer'), true);
/* Which team is leading. Match play cannot answer that at the ninth — a
   match only counts holes BOTH players have finished, and Group 1 turns
   while its opponents are on the 4th — so the squads are compared by
   strokes, which is always available and is what the question means here. */
ok('the squads are on it', cardLabels.some(t => /squads/.test(t)), true);
const sqCard = A.locator('.tn-card').filter({ hasText: 'Squads' });
console.log('          (the squads card reads: ' + (await sqCard.innerText()).replace(/\n/g, ' / ') + ')');
ok('with both squads counted', /UK \d+ .* USA \d+ cards in/s.test(await sqCard.innerText()), true);
/* Summed, the bigger squad wins for being bigger — at Group 1's turn one UK
   card and two USA cards had USA "leading" 21 under to 10 under. Per card. */
ok('and compared per card, not summed',
  /per card/i.test(await sqCard.innerText()), true);
ok('every card in the field is listed', await A.locator('.tn-field .tn-row').count() > 0, true);
ok('with the group that turned marked out', await A.locator('.tn-field .tn-row.me').count() > 0, true);
ok('and it fits the phone', await A.evaluate(() => {
  const m = document.querySelector('.turnmodal').getBoundingClientRect();
  return m.left >= -0.5 && m.right <= window.innerWidth + 0.5 && m.height <= window.innerHeight;
}), true);

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
  await A.locator('.gchip').nth(1).click(); await A.waitForTimeout(600); await shut(A);
  for (let i = 0; i < 9; i++) await playHole(A, i);
  await shut(A); await A.waitForTimeout(800);
  ok('the second group gets a window too', await A.locator('.turnmodal').count(), 1);
  const pace = await A.locator('.tn-pace').innerText();
  console.log('          (the pace line reads: ' + pace.trim() + ')');
  ok('and it is measured against the group in front',
    /at the same point/i.test(pace), true);
  ok('both groups are on the board', await A.locator('.tn-rows').first().locator('.tn-row').count(), 2);
} else { ok('there is a second group to check', chips > 1, true); }

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
