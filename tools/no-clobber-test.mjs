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
const STORED = JSON.parse(readFileSync(S + '/db/config/tournament.json', 'utf8'));

const MOCK = ({ stored, lieOnFirstRead, empty }) => {
  const docs = empty ? {} : { 'config/tournament': stored };
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
    set: d => { docs[path] = clone(d); window.__writes = (window.__writes || 0) + 1;
      setTimeout(() => (subs.doc[path] || []).forEach(f => f({ exists: true, data: clone(docs[path]) })), 120);
      return Promise.resolve(); },
    update: d => docRef(path).set({ ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn); setTimeout(() => fn(snapDoc(path)), 200); return () => {}; },
  });
  const collRef = c => ({
    path: c, doc: id => docRef(c + '/' + id),
    get: () => Promise.resolve({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/')).map(k => ({ id: k.slice(c.length + 1), data: clone(docs[k]) })) }),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fn({ docs: [] }), 200); return () => {}; },
  });
  window.__mockDocs = docs;
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

const fails = [];
const ok = (n, got, want) => { const good = got === want;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(got) + (good ? '' : '  want ' + JSON.stringify(want)));
  if (!good) fails.push(n); };
const countGolfers = p => p.evaluate(() =>
  (((window.__mockDocs['config/tournament'] || {}).people) || []).filter(x => x.role === 'golfer').length);

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
  ok('the factory roster is written once', await countGolfers(p), 11);
  ok('written exactly once', await p.evaluate(() => window.__writes), 1);
  await p.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe stored tournament is never overwritten.');
process.exit(fails.length ? 1 : 0);
