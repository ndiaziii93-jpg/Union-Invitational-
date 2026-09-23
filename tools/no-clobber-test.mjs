/* The tournament must never be overwritten by the factory roster.
   Reproduces the failure that wiped the roster on load: a store whose first
   read wrongly reports the config absent. Run: node tools/no-clobber-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

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

const MOCK = ({ stored, lieOnFirstRead, empty, factoryPeople, extraDocs }) => {
  // the store outlives a reload, as a real database does
  const KEY = '__mockstore';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  const docs = saved || (empty ? {} : { 'config/tournament': stored, ...(extraDocs || {}) });
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) {} };
  persist();
  window.__factoryPeople = factoryPeople;
  const subs = { doc: {}, coll: {} };
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store returns the body from a METHOD, not a field. */
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, exists = true, id = '') => ({ id, exists, data: () => (exists ? deepFreeze(b) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false } });
  let reads = 0, lied = false;
  const snapDoc = p => {
    // the failure under test: one read claims the document is not there
    if (lieOnFirstRead && p === 'config/tournament' && !lied) { lied = true; return snap(null, false); }
    return snap(p in docs ? clone(docs[p]) : null, p in docs);
  };
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: () => { reads++; return new Promise(r => setTimeout(() => r(snapDoc(path)), 120)); },
    set: d => { docs[path] = clone(d); persist(); window.__writes = (window.__writes || 0) + 1;
      setTimeout(() => { (subs.doc[path] || []).forEach(f => f(snap(clone(docs[path]))));
        fireColl(path.split('/')[0]); }, 120);
      return Promise.resolve(); },
    update: d => docRef(path).set({ ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; persist();
      setTimeout(() => fireColl(path.split('/')[0]), 120); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn); setTimeout(() => fn(snapDoc(path)), 200); return () => {}; },
  });
  const collSnap = c => ({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
    .map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))) });
  const fireColl = c => (subs.coll[c] || []).forEach(f => f(collSnap(c)));
  window.__fireAllColls = () => Object.keys(subs.coll).forEach(fireColl);
  // a subscription re-establishing: one snapshot that wrongly says the collection is empty
  window.__fireEmptyColl = c => (subs.coll[c] || []).forEach(f => f({ docs: [] }));
  const collRef = c => ({
    path: c, doc: id => docRef(c + '/' + id),
    get: () => Promise.resolve(collSnap(c)),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fn(collSnap(c)), 200); return () => {}; },
  });
  window.__mockDocs = docs;
  window.__fireConfig = d => (subs.doc['config/tournament'] || []).forEach(f => f(snap(clone(d))));
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

/* And then wait for the screen to STOP MOVING before reading it.
 *
 * The load bar goes when the book has the config and the roster, which is
 * one beat before the roster has been reconciled against the config's own
 * stale mirror of it. On an idle machine that beat is nothing; under three
 * browsers it is half a second, and the count gets read with a ghost still
 * on it. This is not "wait longer" — it asserts nothing and hides nothing:
 * if a removed golfer really did come back and stay, the steady count is
 * the one with them on it and the test still fails. */
const steady = async (pg, sel, ms = 10000) => {
  let last = -1, same = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const n = await pg.locator(sel).count();
    same = n === last ? same + 1 : 0;
    last = n;
    if (same >= 3) return n;
    await pg.waitForTimeout(200);
  }
  return last;
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [label, lie] of [['a healthy store', false], ['a store whose first read lies', true]]) {
  console.log('\n' + label);
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: lie, empty: false });
  await p.goto('file://' + W); await settled(p);
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
  await settled(p);
  ok('the roster survived', await countGolfers(p), 7);
  ok('and editing is available once loaded', await p.locator('.loadbar').count(), 0);
  await p.close();
}

// a genuinely empty store still gets seeded once
{
  console.log('\na first-ever open, with nothing stored');
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: STORED, lieOnFirstRead: false, empty: true });
  await p.goto('file://' + W); await settled(p);
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
  await p.goto('file://' + W); await settled(p);
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
  await p.goto('file://' + W); await settled(p);
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
  // wait for the deletion to actually reach the store rather than guessing at
  // a delay: under load a fixed wait reloads before the write has gone out,
  // and the reload is what the assertion is about
  await p.waitForFunction(
    want => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length === want,
    n - 1, { timeout: 15000 },
  ).catch(() => {});
  ok('removing deletes that person\'s document',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), n - 1);
  await p.reload(); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(500);
  ok('and they stay gone after a reload', await steady(p, '.rtable tbody tr'), n - 1);
  await p.close();
}

// exactly what the live tournament looks like after the repair: the roster
// lives in its own documents, while the config still carries the old mirror
// and was never marked. The documents must win, and a removal must stick.
{
  console.log('\nthe repaired live tournament: documents beside an unmarked config');
  const LIVE = JSON.parse(readFileSync(S + '/db4/config/tournament.json', 'utf8'));
  delete LIVE.rosterInDocs;                       // the flag we could not set
  const extra = {};
  for (const f of readdirSync(S + '/restore/people'))
    extra['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
  for (const f of readdirSync(S + '/restore/pairs'))
    extra['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: LIVE, lieOnFirstRead: false, empty: false, extraDocs: extra });
  await p.goto('file://' + W); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  ok('everyone is back on screen', await steady(p, '.rtable tbody tr'), 15);
  ok('and the pairings came back too', await p.locator(".paircol:not(.un)").count(), 5);

  // remove somebody, then reload: the config mirror still lists them
  const n = await p.locator('.rtable tbody tr').count();
  await p.locator('.rtable tbody tr').last().locator('[data-act="removePerson"]').click();
  // the reload is the assertion, so wait for the write, not for a clock
  await p.waitForFunction(
    want => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length === want,
    n - 1, { timeout: 15000 },
  ).catch(() => {});
  ok('their document is gone',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), n - 1);
  await p.reload(); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  ok('and the stale config mirror cannot bring them back',
    await steady(p, '.rtable tbody tr'), n - 1);
  await p.close();
}

// a snapshot that wrongly reports the collection empty must not blank the book
{
  console.log('\na snapshot that wrongly says the roster is empty');
  const LIVE = JSON.parse(readFileSync(S + '/db4/config/tournament.json', 'utf8'));
  delete LIVE.rosterInDocs;
  const extra = {};
  for (const f of readdirSync(S + '/restore/people'))
    extra['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
  for (const f of readdirSync(S + '/restore/pairs'))
    extra['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: LIVE, lieOnFirstRead: false, empty: false, extraDocs: extra });
  await p.goto('file://' + W); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  ok('the roster loads', await p.locator('.rtable tbody tr').count(), 15);

  await p.evaluate(() => { window.__fireEmptyColl('people'); window.__fireEmptyColl('pairs'); });
  await p.waitForTimeout(900);
  ok('the lie does not empty the roster', await p.locator('.rtable tbody tr').count(), 15);
  ok('nor the pairings', await p.locator('.paircol:not(.un)').count(), 5);
  ok('and the documents were never touched',
    await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), 15);

  // a real emptying still empties it
  await p.evaluate(() => { Object.keys(window.__mockDocs).filter(k => k.startsWith('people/'))
    .forEach(k => delete window.__mockDocs[k]); window.__fireEmptyColl('people'); });
  await p.waitForTimeout(900);
  ok('a roster really removed does clear', await p.locator('.rtable tbody tr').count(), 0);
  await p.close();
}

/* The shape the live tournament is in from today: the roster lives in
   documents, the config has been MARKED to say so, and the old copy of the
   roster that used to sit inside the config is gone.
 *
 * That copy was the ammunition. Every resurrection this file guards against
 * — a golfer removed and back after a reload — worked by the book deciding
 * the roster had never been moved out and writing that copy over the real
 * one. With no copy in the config there is nothing to write, whatever else
 * goes wrong, so this is the guarantee worth having in a test rather than
 * in a commit message.
 *
 * It is also the state the SQL in docs/strip-mirror.sql puts a book into,
 * so this is that file's regression test as much as the store's. */
{
  console.log('\na config with no roster copy in it — the live shape');
  const extra = {};
  for (const f of readdirSync(S + '/restore/people'))
    extra['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
  for (const f of readdirSync(S + '/restore/pairs'))
    extra['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));
  const stripped = JSON.parse(readFileSync(S + '/db4/config/tournament.json', 'utf8'));
  stripped.rosterInDocs = true;      // what the SQL sets
  delete stripped.people;            // and what the SQL takes away
  delete stripped.pairs;

  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.addInitScript(MOCK, { stored: stripped, lieOnFirstRead: false, empty: false, extraDocs: extra });
  await p.goto('file://' + W); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  const n = await steady(p, '.rtable tbody tr');
  ok('the roster is the documents, and only the documents', n, 15);
  ok('and the config is not carrying a second copy of it', await p.evaluate(
    () => { const c = window.__mockDocs['config/tournament'];
            return !!(c.people || c.pairs); }), false);

  /* Take somebody off and reload — the case that has been resurrecting
     people. There is nothing left to resurrect them FROM. */
  await p.locator('.rtable tbody tr').last().locator('[data-act="removePerson"]').click();
  await p.waitForFunction(
    want => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length === want,
    n - 1, { timeout: 15000 },
  ).catch(() => {});
  /* Whether the delete actually reached the store BEFORE the reload is the
     difference between this test finding a resurrection and this test
     finding its own impatience. Record it either way. */
  const goneBefore = await p.evaluate(() =>
    Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length);
  await p.reload(); await settled(p);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(600);
  const after = await steady(p, '.rtable tbody tr');
  const docsAfter = await p.evaluate(() =>
    Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length);
  if (after !== n - 1) console.log('    [why] people docs before reload =', goneBefore,
    ' after =', docsAfter, ' rows =', after, ' (wanted', n - 1, ')');
  ok('the removal reached the store before the reload', goneBefore, n - 1);
  ok('a golfer taken off stays off', after, n - 1);
  ok('and nothing wrote a roster back', await p.evaluate(
    () => Object.keys(window.__mockDocs).filter(k => k.startsWith('people/')).length), n - 1);
  ok('the config is still clean', await p.evaluate(
    () => { const c = window.__mockDocs['config/tournament'];
            return !!(c.people || c.pairs); }), false);

  /* And the empty snapshot that used to be the trigger — a subscription
     re-establishing and reporting nothing — must now change nothing at all. */
  await p.evaluate(() => window.__fireEmptyColl('people'));
  await p.waitForTimeout(1500);
  ok('an empty snapshot cannot bring anybody back either',
    await steady(p, '.rtable tbody tr'), n - 1);
  await p.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe stored tournament is never overwritten.');
process.exit(fails.length ? 1 : 0);
