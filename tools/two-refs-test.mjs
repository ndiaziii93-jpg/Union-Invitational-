/* Two refs on one open round. Justin's phone puts a name in Closest to the
   pin; Manny's phone has not heard about it yet (its live line dropped, as
   phones on a golf course do) and a moment later puts in the longest drive.
   The server merges a write at the top of the book only — exactly as the
   real Supabase one does, `doc || patch` — so Manny's write used to carry his
   stale copy of the round back over Justin's name, and both phones showed
   Nobody yet. Neither name may be lost.

   Also here: a dropdown is never handed the focus back after a pick (on a
   phone that is what reopened its wheel a second time), and the winner
   boxes stay shut, saying why, until the round is open.
   Run: node tools/two-refs-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

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
/* The database snapshots live in the repo, not the scratchpad: the
   scratchpad is wiped when the container restarts, and a fixture a test
   cannot find is not a fixture. Rebuild them with tools/make-fixtures.mjs. */
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/\/$/, '');
const page = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8').replace('const PINS_ENABLED = true', 'const PINS_ENABLED = false') + '</body></html>';
writeFileSync(S + '/tworefs.html', page('dist/union-invitational.html'));

const LIVE0 = JSON.parse(readFileSync(FIX + '/db7/config/tournament.json', 'utf8'));
const LIVE = JSON.parse(JSON.stringify(LIVE0));
/* round one open, both holes nominated on the third, nobody named yet */
Object.values(LIVE.rounds).forEach(r => { r.state = 'closed'; });
Object.assign(LIVE.rounds.r1, { state: 'open', ctpHole: 3, ldHole: 3, ctpWinner: null, ldWinner: null, ldDist: '' });
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(FIX + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(FIX + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(FIX + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(FIX + '/restore/pairs/' + f, 'utf8'));

const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* One store, shared by both pages, living in the test process. Each page talks
   to it over exposed functions, so the two really do see each other's writes —
   and `update` merges exactly as the real one does. */
const store = JSON.parse(JSON.stringify(seed));
const listeners = [];
/* `doc || patch`: the top level only, as the real merge_doc does */
const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) dst[k] = JSON.parse(JSON.stringify(v)); return dst; };
const srvGet = path => (path in store ? JSON.parse(JSON.stringify(store[path])) : null);
const srvList = coll => Object.keys(store).filter(k => k.startsWith(coll + '/'))
  .map(k => ({ id: k.slice(coll.length + 1), body: JSON.parse(JSON.stringify(store[k])) }));
const srvSet = (path, d) => { store[path] = JSON.parse(JSON.stringify(d)); listeners.forEach(f => f(path)); };
const srvUpdate = (path, d) => { if (!(path in store)) throw new Error('not-found');
  merge(store[path], d); listeners.forEach(f => f(path)); };
const srvDelete = path => { delete store[path]; listeners.forEach(f => f(path)); };

const MOCK = () => {
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const pages = [];
let holdB = false;
for (let i = 0; i < 2; i++) {
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR (device ' + (i + 1) + '):', String(e)); fails.push('pageerror'); });
  await p.exposeFunction('srvGet', srvGet);
  await p.exposeFunction('srvList', srvList);
  await p.exposeFunction('srvSet', (path, d) => { srvSet(path, d); });
  await p.exposeFunction('srvUpdate', (path, d) => { srvUpdate(path, d); });
  await p.exposeFunction('srvDelete', path => { srvDelete(path); });
  await p.addInitScript(MOCK);
  await p.goto('file://' + S + '/tworefs.html');
  pages.push(p);
}
const [A, B] = pages;
listeners.push(path => pages.forEach(p => { if (p === B && holdB) return; p.evaluate(x => window.__deliver(x), path).catch(() => {}); }));
const dismiss = async p => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
  await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(250); } };
for (const p of pages) { await p.waitForTimeout(2800); await dismiss(p); }
const toHole3 = async p => {
  await p.locator('.navbtn[data-a="entry"], .tab', { hasText: /Score/ }).first().click().catch(() => {});
  await p.waitForTimeout(700); await dismiss(p);
  const chip = p.locator('[data-act="entryRound"][data-a="r1"]');
  if (await chip.count()) { await chip.first().dispatchEvent('click'); await p.waitForTimeout(500); await dismiss(p); }
  await p.locator('[data-act="entryHole"][data-a="2"]').first().dispatchEvent('click'); await p.waitForTimeout(700); await dismiss(p);
};
await toHole3(A); await toHole3(B);
const field = (p, a) => p.locator('[data-act="setRoundField"][data-a="' + a + '"]').first();
ok('A has the closest-to-the-pin box on hole 3', await field(A, 'ctpWinner').count(), 1);
ok('and it is open to a pick', await field(A, 'ctpWinner').isDisabled(), false);

console.log('\n=== Manny\'s phone stops hearing; Justin names the closest ===');
holdB = true;
const who = await field(A, 'ctpWinner').locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
await field(A, 'ctpWinner').focus(); await field(A, 'ctpWinner').selectOption(who[1]); await A.waitForTimeout(900);   // a finger focuses it first
ok('the name reached the server', store['config/tournament'].rounds.r1.ctpWinner, who[1]);
ok('the dropdown is not handed the focus back', await A.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY');

console.log('\n=== Manny, still on the old copy, names the longest drive ===');
await field(B, 'ldWinner').selectOption(who[2]); await B.waitForTimeout(900);
ok('Manny\'s longest drive is in', store['config/tournament'].rounds.r1.ldWinner, who[2]);
ok('and Justin\'s closest is still there', store['config/tournament'].rounds.r1.ctpWinner, who[1]);
ok('the round is still open', store['config/tournament'].rounds.r1.state, 'open');

console.log('\n=== the line comes back ===');
holdB = false;
for (const p of pages) await p.evaluate(() => window.__deliver('config/tournament'));
await A.waitForTimeout(700); await B.waitForTimeout(700);
ok('Justin\'s phone shows both', [await field(A, 'ctpWinner').inputValue(), await field(A, 'ldWinner').inputValue()].join(','), who[1] + ',' + who[2]);
ok('Manny\'s phone shows both', [await field(B, 'ctpWinner').inputValue(), await field(B, 'ldWinner').inputValue()].join(','), who[1] + ',' + who[2]);

console.log('\n=== two picks in a row on one phone, both kept ===');
await field(A, 'ldDist').fill('262 m'); await field(A, 'ldDist').blur(); await A.waitForTimeout(100);
await field(A, 'ctpWinner').selectOption(who[0]); await A.waitForTimeout(1200);
ok('the distance went in', store['config/tournament'].rounds.r1.ldDist, '262 m');
ok('and the new closest', store['config/tournament'].rounds.r1.ctpWinner, who[0]);

console.log('\n=== before a round opens the winner boxes are shut, and say why ===');
await A.evaluate(() => window.__deliver && 0);
store['config/tournament'].rounds.r1.state = 'closed'; store['config/tournament'].rev = (store['config/tournament'].rev || 0) + 50;
for (const p of pages) await p.evaluate(() => window.__deliver('config/tournament'));
await A.waitForTimeout(800);
const box = A.locator('[data-reveal="pins"]');
ok('the closest box is shut', await field(A, 'ctpWinner').isDisabled(), true);
ok('the longest box is shut', await field(A, 'ldWinner').isDisabled(), true);
ok('and the page says when they open', /once the round is open/.test(await box.innerText()), true);

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nTwo refs no longer undo each other.');
process.exit(fails.length ? 1 : 0);
