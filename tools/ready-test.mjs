/* The book must never end up permanently unable to save. A roster read that
   fails or never answers must not leave a scorer with controls that undo
   themselves and buttons that do nothing.
   Run: node tools/ready-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/ready.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational.html', 'utf8') + '</body></html>');

const LIVE = JSON.parse(readFileSync(S + '/db4/config/tournament.json', 'utf8'));
delete LIVE.rosterInDocs;
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(S + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(S + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* `breakage` decides how the roster collection misbehaves:
   'reject'  — the direct read rejects, as a transient platform error does
   'silent'  — neither the read nor the subscription ever answers            */
const MOCK = ({ seed, breakage }) => {
  const docs = JSON.parse(JSON.stringify(seed));
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, e = true, id = '') => ({ id, exists: e, data: () => (e ? deepFreeze(b) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false } });
  const subs = { doc: {}, coll: {} };
  const collSnap = c => ({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
    .map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))) });
  const fireColl = c => (subs.coll[c] || []).forEach(f => f(collSnap(c)));
  const roster = c => c === 'people' || c === 'pairs';
  const docRef = path => ({ id: path.split('/').pop(), path,
    get: () => new Promise(r => setTimeout(() => r(snap(path in docs ? clone(docs[path]) : null, path in docs)), 90)),
    set: d => { docs[path] = clone(d); window.__writes = (window.__writes || 0) + 1;
      setTimeout(() => { (subs.doc[path] || []).forEach(f => f(snap(clone(docs[path])))); fireColl(path.split('/')[0]); }, 90);
      return Promise.resolve(); },
    update: d => docRef(path).set({ ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; setTimeout(() => fireColl(path.split('/')[0]), 90); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn);
      setTimeout(() => fn(snap(path in docs ? clone(docs[path]) : null, path in docs)), 160); return () => {}; } });
  const collRef = c => ({ path: c, doc: id => docRef(c + '/' + id),
    get: () => (roster(c) && breakage === 'reject'
      ? Promise.reject({ code: 'unavailable', message: 'transient' })
      : roster(c) && breakage === 'silent' ? new Promise(() => {})
      : Promise.resolve(collSnap(c))),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn);
      if (roster(c) && breakage === 'silent') return () => {};   // never answers
      setTimeout(() => fn(collSnap(c)), 160); return () => {}; } });
  window.__docs = docs;
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const breakage of ['reject', 'silent']) {
  console.log('\n=== the roster read ' + (breakage === 'reject' ? 'fails' : 'never answers') + ' ===');
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  await p.addInitScript(MOCK, { seed, breakage });
  const dismiss = async () => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(250); } };
  const tab = async t => { await dismiss(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(700); await dismiss(); };
  await p.goto('file://' + S + '/ready.html');
  await p.waitForTimeout(8000);                 // past the watchdog
  await dismiss();
  ok('the book is no longer read-only', await p.locator('.loadbar').count(), 0);

  // a tee time must stay put
  await tab('Leaderboards');
  const sel = n => p.locator('.teetimes .timepick').first().locator('select').nth(n);
  await sel(0).selectOption('9'); await p.waitForTimeout(500);
  await sel(1).selectOption('50'); await p.waitForTimeout(900);
  ok('the tee time does not reset itself', [await sel(0).inputValue(), await sel(1).inputValue()].join(':'), '9:50');
  ok('and it reached the store', await p.evaluate(() => window.__docs['config/tournament'].rounds.r1.tees[0].time), '09:50');

  // a round must open, and scores must go in
  await tab('Score Entry');
  ok('there is a round to open', await p.locator('[data-act="openRound"]').count(), 1);
  await p.locator('[data-act="openRound"]').first().tap(); await p.waitForTimeout(1600); await dismiss();
  ok('opening the round worked', await p.locator('[data-act="openRound"]').count(), 0);
  await p.locator('.step.plus').first().click(); await p.waitForTimeout(400);
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1500); await dismiss();
  ok('saving moved on to the next hole', await p.locator('.holehead h3').innerText(), 'Hole 2');
  ok('and hole 1 is marked as scored',
    await p.locator('.hcell').first().getAttribute('class').then(c => c.includes('saved')), true);
  ok('and a card reached the store',
    await p.evaluate(() => Object.keys(window.__docs).filter(k => k.startsWith('scores/')).length), 1);
  await p.close();
}
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe book always ends up able to save.');
process.exit(fails.length ? 1 : 0);
