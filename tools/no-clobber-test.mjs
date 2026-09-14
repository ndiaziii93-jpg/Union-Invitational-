/* The tournament must never be overwritten by the factory roster.
   Reproduces the failure that wiped the roster on load: a store whose first
   read wrongly reports the config absent. Run: node tools/no-clobber-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const W = S + '/preview.html';
writeFileSync(W, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('/home/user/Union-Invitational-/dist/union-invitational.html', 'utf8') + '</body></html>');

/* A tournament somebody has already edited: four golfers removed. */
const STORED = JSON.parse(readFileSync(S + '/db2/config/tournament.json', 'utf8'));
/* what an old build would write back: the full original roster */
const FACTORY_PEOPLE = JSON.parse(readFileSync(S + '/db/config/tournament.json', 'utf8')).people
  .concat([{ id: 'g4', name: 'Manuel P', display: 'Manuel P', role: 'golfer', location: null, band: null, group: '7-day' }]);

const MOCK = ({ stored, lieOnFirstRead, empty, factoryPeople }) => {
  // the store outlives a reload, as a real database does
  const KEY = '__mockstore';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  const docs = saved || (empty ? {} : { 'config/tournament': stored });
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) {} };
  persist();
  window.__factoryPeople = factoryPeople;
  const subs = { doc: {}, coll: {} };
  const clone = o => JSON.parse(JSON.stringify(o));
  let reads = 0, lied = false;
  const snapDoc = p => {
    // the failure under test: one read claims the document is not there
    if (lieOnFirstRead && p === 'config/tournament' && !lied) { lied = true; return { exists: false, data: null }; }
    return { exists: p in docs, data: p in docs ? clone(docs[p]) : null };
  };
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: () => { reads++; return new Promise(r => setTimeout(() => r(snapDoc(path)), 120)); },
    set: d => { docs[path] = clone(d); persist(); window.__writes = (window.__writes || 0) + 1;
      setTimeout(() => { (subs.doc[path] || []).forEach(f => f({ exists: true, data: clone(docs[path]) }));
        fireColl(path.split('/')[0]); }, 120);
      return Promise.resolve(); },
    update: d => docRef(path).set({ ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; persist();
      setTimeout(() => fireColl(path.split('/')[0]), 120); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn); setTimeout(() => fn(snapDoc(path)), 200); return () => {}; },
  });
  const collSnap = c => ({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
    .map(k => ({ id: k.slice(c.length + 1), data: clone(docs[k]) })) });
  const fireColl = c => (subs.coll[c] || []).forEach(f => f(collSnap(c)));
  window.__fireAllColls = () => Object.keys(subs.coll).forEach(fireColl);
  const collRef = c => ({
    path: c, doc: id => docRef(c + '/' + id),
    get: () => Promise.resolve(collSnap(c)),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fn(collSnap(c)), 200); return () => {}; },
  });
  window.__mockDocs = docs;
  window.__fireConfig = d => (subs.doc['config/tournament'] || []).forEach(f => f({ exists: true, data: clone(d) }));
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

const fails = [];
const ok = (n, got, want) => { const good = got === want;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(got) + (good ? '' : '  want ' + JSON.stringify(want)));
  if (!good) fails.push(n); };
const countGolfers = p => p.evaluate(() => {
  const d = window.__mockDocs;
  const own = Object.keys(d).filter(k => k.startsWith('people/')).map(k => d[k]);
  const list = own.length ? own : (((d['config/tournament'] || {}).people) || []);
  return list.filter(x => x.role === 'golfer').length;
});

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [label, lie] of [['a healthy store', false], ['a store whose first read lies', true]]) {
  console.log('\n' + label);
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: lie, empty: false });
  await p.goto('file://' + W); await p.waitForTimeout(2600);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  ok('the stored roster is still intact', await countGolfers(p), 7);
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(500);
  ok('and it is what the page shows', await p.locator('.rtable tbody tr').count(), STORED.people.length);
  await p.close();
}

// an edit made before the book arrives must not write the factory roster
{
  console.log('\nan impatient tap during a slow load');
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: true, empty: false });
  await p.goto('file://' + W); await p.waitForTimeout(60);          // before anything has loaded
  ok('the page says it is read-only', await p.locator('.loadbar').count(), 1);
  ok('no edit controls are offered yet', await p.locator('[data-act="setBand"]').count(), 0);
  await p.waitForTimeout(2600);
  ok('the roster survived', await countGolfers(p), 7);
  ok('and editing is available once loaded', await p.locator('.loadbar').count(), 0);
  await p.close();
}

// a genuinely empty store still gets seeded once
{
  console.log('\na first-ever open, with nothing stored');
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: false, empty: true });
  await p.goto('file://' + W); await p.waitForTimeout(2600);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  ok('the factory roster is seeded', await countGolfers(p), 11);
  ok('as one document per person',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), 23);
  await p.close();
}

// the exact state the live tournament is in: roster in the config, no documents
{
  console.log('\nrecovering a tournament whose roster is still in the config');
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.evaluate(() => {}).catch(() => {});
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: false, empty: false, factoryPeople: FACTORY_PEOPLE });
  await p.goto('file://' + W); await p.waitForTimeout(3000);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  ok('everybody is on screen', await p.locator('.rtable tbody tr').count(), STORED.people.length);
  ok('and now has their own document',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), STORED.people.length);
  ok('the config keeps a copy as a backup',
    await p.evaluate(() => (window.__mockDocs['config/tournament'].people || []).length), STORED.people.length);
  ok('and is marked as living in documents',
    await p.evaluate(() => window.__mockDocs['config/tournament'].rosterInDocs), true);
  await p.close();
}

// the roster moves into its own documents, and a stale whole-list write cannot
// resurrect anybody once it has
{
  console.log('\na stale view rewriting the old roster list');
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: false, empty: false, factoryPeople: FACTORY_PEOPLE });
  await p.goto('file://' + W); await p.waitForTimeout(3000);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});

  ok('each person now has their own document',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), STORED.people.length);
  ok('the config keeps its backup copy',
    await p.evaluate(() => (window.__mockDocs['config/tournament'].people || []).length), STORED.people.length);

  // a view running the old code writes the whole original roster back into config
  await p.evaluate(() => {
    const cfg = window.__mockDocs['config/tournament'];
    window.__mockDocs['config/tournament'] = { ...cfg, rev: (cfg.rev || 0) + 5, people: window.__factoryPeople };
  });
  await p.evaluate(() => { const d = window.__mockDocs['config/tournament'];
    (window.__fireConfig || (() => {}))(d); });
  await p.waitForTimeout(800);
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(500);
  ok('the roster is unaffected', await p.locator('.rtable tbody tr').count(), STORED.people.length);

  // and a removal is a deletion, not a list edit
  const n = await p.locator('.rtable tbody tr').count();
  await p.locator('.rtable tbody tr').last().locator('[data-act="removePerson"]').click();
  await p.waitForTimeout(900);
  ok('removing deletes that person\'s document',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), n - 1);
  await p.reload(); await p.waitForTimeout(3000);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(500);
  ok('and they stay gone after a reload', await p.locator('.rtable tbody tr').count(), n - 1);
  await p.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe stored tournament is never overwritten.');
process.exit(fails.length ? 1 : 0);
