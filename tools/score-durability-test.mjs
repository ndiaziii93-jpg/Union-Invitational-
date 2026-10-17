/* A saved score must survive everything: a reload, a phone put away and
   reopened, another round starting, and a snapshot that wrongly reports the
   scores collection empty. Run: node tools/score-durability-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

/* THE KEYPAD. A score goes in by tapping the golfer's tile and then the
   number on the pad that rises. These emulate n taps of the old plus or
   minus (from an empty cell the first plus landed on par, the first minus
   one under) so the arithmetic of every scenario below is unchanged. */
const __pad = async (pg, i, taps, dir) => {
  const tiles = pg.locator('.ptile[data-act="padOpen"]');
  if (await tiles.count() <= i) return;
  await tiles.nth(i).focus().catch(() => {}); await tiles.nth(i).dispatchEvent('click'); await pg.waitForTimeout(140);
  const kp = pg.locator('.keypad'); if (!await kp.count()) return;
  if (taps <= 0) return;
  const par = +(await kp.getAttribute('data-par')), cap = +(await kp.getAttribute('data-cap'));
  const curS = await kp.getAttribute('data-cur'); const cur = curS ? +curS : null;
  let v = cur == null ? par + (dir > 0 ? taps - 1 : -taps) : cur + dir * taps;
  v = Math.max(1, Math.min(cap, v));
  const key = kp.locator('.key[data-b="' + v + '"]'); await key.focus().catch(() => {}); await key.dispatchEvent('click'); await pg.waitForTimeout(120);
};
const __plus = (pg, i, taps = 1) => __pad(pg, i, taps, 1);
const __minus = (pg, i, taps = 1) => __pad(pg, i, taps, -1);
const __open = (pg, i) => __pad(pg, i, 0, 1);


/* Whatever window is up is answered first — a half-entered hole's "not
   saved" by taking the discard, anything else by its Cancel — because a
   tap forced through a scrim lands on the scrim and only closes it. */
const clearWin = async pg => { for (let i = 0; i < 5; i++) { if (!await pg.locator('.scrim').count()) return;
  const alt = pg.locator('.scrim [data-act="confirmAlt"]'), c = pg.locator('.scrim [data-act="modalCancel"]');
  if (await alt.count()) await alt.first().click({ force: true });
  else if (await c.count()) await c.first().click({ force: true });
  else await pg.locator('.scrim').first().click({ position: { x: 4, y: 4 }, force: true });
  await pg.waitForTimeout(300); } };


/* The group is picked off a chip where there is room for one, and off the
   line and the sheet behind it on a phone, where the chips are not drawn.
   The sheet stays up until it is closed, as it does under a thumb. */
const pickGroupOn = async (pg, i) => {
  const chip = pg.locator('.gchip').nth(i);
  if (await chip.isVisible().catch(() => false)) { await chip.click({ force: true }); return; }
  await clearWin(pg);
  await pg.locator('.setline').first().click(); await pg.waitForTimeout(400);
  await pg.locator('.scrim .shlist').nth(1).locator('.sh-row').nth(i).click({ force: true });
  await pg.waitForTimeout(300);
};
const pickRoundRow = async (pg, i) => {
  const card = pg.locator('[data-act="entryRound"]').nth(i);
  if (await card.isVisible().catch(() => false)) { await card.click(); return; }
  await clearWin(pg);
  await pg.locator('.setline').first().click(); await pg.waitForTimeout(400);
  await pg.locator('.scrim .shlist').nth(0).locator('.sh-row').nth(i).click({ force: true });
  await pg.waitForTimeout(300);
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
const wrap = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8').replace('const PINS_ENABLED = true', 'const PINS_ENABLED = false') + '</body></html>';
writeFileSync(S + '/dur-local.html', wrap('dist/union-invitational-sandbox.html'));
writeFileSync(S + '/dur-db.html', wrap('dist/union-invitational.html'));

const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* A database that behaves like the real one: the body comes from data(), it
   survives a reload, and it can be told to deliver an empty snapshot. */
const MOCK = (seed) => {
  const KEY = '__durdb';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  const docs = saved || (seed ? JSON.parse(JSON.stringify(seed)) : {});
  window.__lieEmptyFirst = !!(seed && seed.__lie);
  delete docs.__lie;
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) {} };
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, exists = true, id = '') => ({ id, exists, data: () => (exists ? deepFreeze(b) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false } });
  const subs = { doc: {}, coll: {} };
  const collSnap = c => ({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
    .map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))) });
  const fireColl = c => (subs.coll[c] || []).forEach(f => f(collSnap(c)));
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: () => new Promise(r => setTimeout(() => r(snap(path in docs ? clone(docs[path]) : null, path in docs)), 90)),
    set: d => { docs[path] = clone(d); persist();
      setTimeout(() => { (subs.doc[path] || []).forEach(f => f(snap(clone(docs[path]))));
        fireColl(path.split('/')[0]); }, 90); return Promise.resolve(); },
    update: d => docRef(path).set({ ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; persist(); setTimeout(() => fireColl(path.split('/')[0]), 90); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn);
      setTimeout(() => fn(snap(path in docs ? clone(docs[path]) : null, path in docs)), 160); return () => {}; },
  });
  const collRef = c => ({ path: c, doc: id => docRef(c + '/' + id),
    get: () => Promise.resolve(collSnap(c)),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn);
      // the failure under test: the first delivery wrongly reports it empty
      if (window.__lieEmptyFirst && c === 'scores') {
        setTimeout(() => fn({ docs: [] }), 160);
        return () => {};
      }
      setTimeout(() => fn(collSnap(c)), 160); return () => {}; } });
  window.__docs = docs;
  window.__fireEmpty = c => (subs.coll[c] || []).forEach(f => f({ docs: [] }));
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

/* Closest to the pin and longest drive are nominated before a card can open,
   so every test that opens one has to make the two picks first. */
const nominate = async pg => {
  for (const f of ['ctpHole', 'ldHole']) {
    const sel = pg.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
    if (!await sel.count()) continue;
    if (await sel.inputValue()) continue;
    const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
    if (!opts.length) continue;
    await sel.selectOption(opts[0]);
    await pg.waitForTimeout(450);
  }
};

/* Wait for the book to have the tournament, not for a clock.
 *
 * These waits used to be a fixed two and a half seconds, which is plenty on
 * an idle machine and not enough on a busy one — so the roster was counted
 * while the config mirror was still the only thing on screen and the test
 * failed for reasons that had nothing to do with the book. The load bar is
 * the book's own statement that it is still opening; when it goes, the
 * tournament is in hand.
 *
 * The book has to have DRAWN before that means anything, though: an empty
 * page has no load bar either, and "the load bar is gone" would otherwise be
 * true a frame after navigating and before a single document had arrived. */
const settled = async (pg, ms = 20000) => {
  try {
    await pg.waitForSelector('.masthead h1', { timeout: ms });
    await pg.waitForSelector('.loadbar', { state: 'detached', timeout: ms });
  } catch (e) { /* whatever is on screen is what the test will judge */ }
  await pg.waitForTimeout(350);        // one redraw after the last document
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const mode of ['the test copy (this device only)', 'the real book (shared database)']) {
  const isDb = mode.startsWith('the real');
  console.log('\n=== ' + mode + ' ===');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  if (isDb) await p.addInitScript(MOCK, null);
  const clear = async () => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
  const tab = async t => { await clear(); await goTab(p, t); await p.waitForTimeout(500); await clear(); };
  const openEntry = async () => { await tab('Score Entry');
    const open = p.locator('[data-act="openRound"]');
    if (await open.count()) { await nominate(p); await clear();
      await open.first().click(); await p.waitForTimeout(1300); await clear(); } };
  const shown = () => p.locator('.fig.raw .v').first().innerText();

  await p.goto('file://' + S + (isDb ? '/dur-db.html' : '/dur-local.html')); await settled(p); await clear();

  // --- enter a stroke and save the hole ---
  await openEntry();
  await __plus(p, 0, 1); await p.waitForTimeout(350);
  ok('a stroke shows before saving', await shown(), '4');
  ok('and is flagged as not saved', await p.locator('.savebar .sv b').innerText(), 'Hole 1 is not saved');
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1500); await clear();
  ok('saving moved on to the next hole', await p.locator('.holehead h3').innerText(), 'Hole 2');
  ok('and hole 1 is marked as scored', await p.locator('.hcell').first().getAttribute('class').then(c => c.includes('saved')), true);
  await p.locator('.hcell').first().click(); await p.waitForTimeout(500); await clear();

  // --- the phone is put away and reopened ---
  await p.reload(); await settled(p); await clear();
  await openEntry();
  ok('the saved stroke survives a reload', await shown(), '4');

  // --- another round is opened: the first round keeps its card ---
  await tab('Score Entry');
  const rounds = p.locator('[data-act="entryRound"]');
  if (await rounds.count() > 1) {
    await pickRoundRow(p, 1); await p.waitForTimeout(700); await clear();
    await pickRoundRow(p, 0); await p.waitForTimeout(700); await clear();
  }
  ok('and survives another round being opened', await shown(), '4');

  // --- a snapshot that wrongly says there are no scores ---
  if (isDb) {
    await p.evaluate(() => window.__fireEmpty('scores'));
    await p.waitForTimeout(1200); await clear();
    ok('an empty snapshot does not wipe the card', await shown(), '4');
    ok('and the score document is untouched',
      await p.evaluate(() => Object.keys(window.__docs).filter(k => k.startsWith('scores/')).length), 1);
    // and it is still there after a reload, which is what the refs would see
    await p.reload(); await settled(p); await clear();
    await openEntry();
    ok('still there on the next open', await shown(), '4');
  }
  await p.close(); await ctx.close();
}
// A ref on the course has already put a card in. Somebody else opens the book
// and their first snapshot of the scores arrives empty. Their phone must not
// show an empty card — that is a score "disappearing" as far as anyone can see.
{
  console.log('\n=== a viewer whose first snapshot says there are no scores ===');
  const card = { id: 'practice__g1', round: 'practice', pid: 'g1', rev: 1,
    raw: [5, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    by: { 0: 'master' }, at: { 0: Date.now() } };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  await p.addInitScript(MOCK, { 'scores/practice__g1': card, __lie: true });
  const clear = async () => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
  await p.goto('file://' + S + '/dur-db.html'); await settled(p); await clear();
  await goTab(p, 'Score Entry'); await p.waitForTimeout(600); await clear();
  const open = p.locator('[data-act="openRound"]');
  if (await open.count()) { await nominate(p); await clear();
    await open.first().click(); await p.waitForTimeout(1300); await clear(); }
  ok('the card another ref put in is on screen',
    (await p.locator('.fig.raw .v').allInnerTexts()).includes('5'), true);
  ok('and the document was never touched',
    await p.evaluate(() => Object.keys(window.__docs).filter(k => k.startsWith('scores/')).length), 1);
  await p.close(); await ctx.close();
}

// A hole part-entered when the phone locks or Safari drops the tab.
{
  console.log('\n=== a hole part-entered when the phone is put away ===');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  const clear = async () => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
  await p.goto('file://' + S + '/dur-local.html'); await settled(p); await clear();
  await goTab(p, 'Score Entry'); await p.waitForTimeout(600); await clear();
  const open = p.locator('[data-act="openRound"]');
  if (await open.count()) { await nominate(p); await clear();
    await open.first().click(); await p.waitForTimeout(1300); await clear(); }
  await __plus(p, 0, 1); await p.waitForTimeout(400);
  ok('the stroke is entered', await p.locator('.fig.raw .v').first().innerText(), '4');
  // no Save tapped — the phone locks, the tab is discarded, they come back
  await p.reload(); await settled(p); await clear();
  await goTab(p, 'Score Entry'); await p.waitForTimeout(600); await clear();
  const open2 = p.locator('[data-act="openRound"]');
  if (await open2.count()) { await nominate(p); await clear();
    await open2.first().click(); await p.waitForTimeout(1300); await clear(); }
  ok('the part-entered hole is still there', await p.locator('.fig.raw .v').first().innerText(), '4');
  await p.close(); await ctx.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nA saved score survives everything thrown at it.');
process.exit(fails.length ? 1 : 0);
