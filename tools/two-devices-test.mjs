/* Two phones on the same book. Neither may undo the other by saving its own
   stale copy of a part it never touched — which is how every tee time and
   every round state kept springing back. Run: node tools/two-devices-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const page = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8') + '</body></html>';
writeFileSync(S + '/two.html', page('dist/union-invitational.html'));

const LIVE = JSON.parse(readFileSync(S + '/db7/config/tournament.json', 'utf8'));
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(S + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(S + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* One store, shared by both pages, living in the test process. Each page talks
   to it over exposed functions, so the two really do see each other's writes —
   and `update` merges exactly as the real one does. */
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

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const pages = [];
for (let i = 0; i < 2; i++) {
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR (device ' + (i + 1) + '):', String(e)); fails.push('pageerror'); });
  await p.exposeFunction('srvGet', srvGet);
  await p.exposeFunction('srvList', srvList);
  await p.exposeFunction('srvSet', (path, d) => { srvSet(path, d); });
  await p.exposeFunction('srvUpdate', (path, d) => { srvUpdate(path, d); });
  await p.exposeFunction('srvDelete', path => { srvDelete(path); });
  await p.addInitScript(MOCK);
  await p.goto('file://' + S + '/two.html');
  pages.push(p);
}
// a write on one device reaches the other, as a real subscription would
listeners.push(path => { for (const p of pages) p.evaluate(x => window.__deliver(x), path).catch(() => {}); });

const [A, B] = pages;
const dismiss = async p => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
  await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(250); } };
const tab = async (p, t) => { await dismiss(p); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(600); await dismiss(p); };
for (const p of pages) { await p.waitForTimeout(2800); await dismiss(p); }

console.log('\n=== device A sets a tee time, device B is still on the old one ===');
await tab(A, 'Leaderboards');
const sel = n => A.locator('.teetimes .timepick').first().locator('select').nth(n);
await sel(0).selectOption('9'); await A.waitForTimeout(400);
await sel(1).selectOption('50'); await A.waitForTimeout(900);
ok('A set the tee time', store['config/tournament'].rounds.r1.tees[0].time, '09:50');

console.log('\n=== device A opens a round ===');
await tab(A, 'Score Entry');
if (await A.locator('[data-act="openRound"]').count()) {
  await nominate(A); await dismiss(A);
  await A.locator('[data-act="openRound"]').first().click(); await A.waitForTimeout(1200); await dismiss(A);
}
const openedRound = Object.entries(store['config/tournament'].rounds).find(([, r]) => r.state === 'open');
ok('a round is open', !!openedRound, true);

console.log('\n=== now device B saves something of its own ===');
await tab(B, 'Roster');
const rows = await B.locator('.rtable tbody tr').count();
await B.locator('.rtable tbody tr').last().locator('[data-act="removePerson"]').click();
await B.waitForTimeout(2200);   // past the mirror refresh
ok('B removed somebody', await B.locator('.rtable tbody tr').count(), rows - 1);

console.log('\n=== and A must not have been undone ===');
ok('A\'s tee time is still set', store['config/tournament'].rounds.r1.tees[0].time, '09:50');
ok('A\'s round is still open',
  openedRound ? store['config/tournament'].rounds[openedRound[0]].state : null, 'open');
await tab(A, 'Leaderboards'); await A.waitForTimeout(600);
ok('and A still shows it on screen',
  [await sel(0).inputValue().catch(() => '?'), await sel(1).inputValue().catch(() => '?')].join(':'), '9:50');

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nTwo devices no longer undo each other.');
process.exit(fails.length ? 1 : 0);
