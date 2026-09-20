/* Regression test for shared-store writes.
   Mocks the artifact db with two hostile behaviours the real store can show:
     1. a stale snapshot echo arriving AFTER a write (last-writer race)
     2. keys whose value is null being dropped on the way out
   Both of these silently reverted the user's edits. Run: node tools/db-race-test.mjs */
import { chromium } from 'playwright';

const PAGE = 'file:///home/user/Union-Invitational-/dist/union-invitational.html';

const MOCK = () => {
  const docs = {};                       // path -> data
  const subs = { doc: {}, coll: {} };
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (v === null ? undefined : v)));
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store returns the body from a METHOD, not a field. */
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, exists = true, id = '') => ({ id, exists, data: () => (exists ? deepFreeze(b) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false } });
  const snapDoc = p => snap(p in docs ? clone(docs[p]) : null, p in docs);
  const fireDoc = p => (subs.doc[p] || []).forEach(fn => fn(snapDoc(p)));
  const fireColl = c => (subs.coll[c] || []).forEach(fn => fn({
    docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
      .map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))),
  }));
  const fireAll = p => { fireDoc(p); fireColl(p.split('/')[0]); };

  const LAT = 340;                                  // (3) a real round trip, not an instant one
  function write(path, data) {
    if (window.__failNextWrite) {            // (4) a write that simply fails
      window.__failNextWrite = false;
      return new Promise((_, rej) => setTimeout(() => rej({ code: 'unavailable', message: 'test failure' }), 120));
    }
    const before = path in docs ? clone(docs[path]) : null;
    const pending = strip(data);                    // (2) nulls dropped in transit
    setTimeout(() => { docs[path] = pending; }, LAT);
    if (before) setTimeout(() => {                  // (1) stale echo of the PREVIOUS version
      (subs.doc[path] || []).forEach(fn => fn(snap(before)));
      (subs.coll[path.split('/')[0]] || []).forEach(fn => fn({
        docs: Object.keys(docs).filter(k => k.startsWith(path.split('/')[0] + '/')).map(k =>
          snap(k === path ? before : clone(docs[k]), true, k.slice(path.split('/')[0].length + 1))),
      }));
    }, 120);
    setTimeout(() => fireAll(path), LAT + 160);     // and later, the truth
    return new Promise(r => setTimeout(r, LAT));
  }
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: () => Promise.resolve(snapDoc(path)),
    set: d => write(path, d),
    update: d => write(path, { ...(docs[path] || {}), ...d }),
    delete: () => { delete docs[path]; setTimeout(() => fireAll(path), 20); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn); setTimeout(() => fn(snapDoc(path)), 10); return () => {}; },
  });
  const collRef = c => ({
    path: c, doc: id => docRef(c + '/' + id),
    get: () => Promise.resolve({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/')).map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))) }),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fireColl(c), 10); return () => {}; },
  });
  window.__mockDocs = docs;
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
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const fails = [];
p.on('pageerror', e => fails.push('pageerror: ' + e.message));
await p.addInitScript(MOCK);
await p.goto(PAGE);
await p.waitForTimeout(1200);
await p.locator('[data-act="modalCancel"]').click().catch(() => {});
const ok = (name, got, want) => { const good = got === want;
  console.log((good ? '  PASS  ' : '  FAIL  ') + name + '  got ' + JSON.stringify(got) + (good ? '' : '  want ' + JSON.stringify(want)));
  if (!good) fails.push(name); };

// --- squad flag survives the echo and the null strip
await p.locator('.tab', { hasText: 'Ryder Cup' }).first().click();
await p.waitForTimeout(300);
/* Arriving at the closest-to-the-pin or longest-drive hole puts a notice up,
   once. It is a scrim, so it intercepts the next tap even though everything
   under it still reads fine — which is how a card that was perfectly healthy
   timed out on the plus button. */
const shut = async () => { for (let i = 0; i < 4; i++) {
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(220); } };
const hole = async n => { await p.locator('.hcell').nth(n).click();
  await p.waitForTimeout(400); await shut(); };

const label = () => p.locator('.sqrow').first().locator('.sqlabel').innerText();
await p.locator('.sqbox').first().click(); await p.waitForTimeout(1400);
ok('flag: 1st tap sticks as USA', await label(), 'USA');
await p.locator('.sqbox').first().click(); await p.waitForTimeout(1400);
ok('flag: 2nd tap sticks as UK', await label(), 'UK');
await p.locator('.sqbox').first().click(); await p.waitForTimeout(1400);
ok('flag: 3rd tap returns to Unassigned', await label(), 'Unassigned');

// --- three taps inside a single round trip must not lose any of them
await p.locator('.sqbox').nth(1).click();
await p.locator('.sqbox').nth(1).click();
await p.locator('.sqbox').nth(1).click();
await p.waitForTimeout(1600);
ok('flag: 3 rapid taps land on Unassigned', await p.locator('.sqrow').nth(1).locator('.sqlabel').innerText(), 'Unassigned');
await p.locator('.sqbox').nth(1).click();
await p.locator('.sqbox').nth(1).click();
await p.waitForTimeout(1600);
ok('flag: 2 rapid taps land on UK', await p.locator('.sqrow').nth(1).locator('.sqlabel').innerText(), 'UK');

// --- roster: the pairings board and the roster table
await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(400);
await p.locator('[data-act="modalCancel"]').click().catch(() => {});
const golfers = () => p.locator('.rtable tbody tr').count();
await p.locator('.rtable').waitFor();
const n0 = await golfers();

// a band sticks
await p.locator('.rtable tbody tr').first().locator('[data-act="setBand"]').first().click();
await p.waitForTimeout(1400);
/* The band is worn as a crest now, not ticked as a button. */
ok('roster: band 15 sticks', await p.locator('.rtable tbody tr').first()
  .locator('.bandcrest.on .bn').innerText(), '15');

// a squad sticks, and cycles round to unassigned again
const row = () => p.locator('.rtable tbody tr').nth(2);
const flag = () => row().locator('[data-act="cycleSquad"]');
const squad = () => row().locator('.sqlabel').innerText();
await flag().click(); await p.waitForTimeout(1400);
ok('roster: first tap is USA', await squad(), 'USA');
await flag().click(); await p.waitForTimeout(1400);
ok('roster: second tap is UK', await squad(), 'UK');
await flag().click(); await p.waitForTimeout(1400);
ok('roster: third tap clears it', await squad(), 'Unassigned');

// a new person is named by hand
await p.locator('[data-act="addPerson"]').first().click(); await p.waitForTimeout(300);
await p.locator('#addName').fill('Tommy Fleetwood');
await p.locator('[data-act="addSave"]').click(); await p.waitForTimeout(1400);
ok('roster: named add counted', await golfers(), n0 + 1);
ok('roster: named add lands', await p.locator('.rtable tbody tr').last().locator('.cellin').first().inputValue(), 'Tommy Fleetwood');

// renaming in the table sticks
const last = p.locator('.rtable tbody tr').last().locator('.cellin').first();
await last.fill('Tommy F'); await last.blur(); await p.waitForTimeout(1400);
ok('roster: rename sticks', await p.locator('.rtable tbody tr').last().locator('.cellin').first().inputValue(), 'Tommy F');

// moving a golfer between pairs sticks
const inPair1 = () => p.locator('.paircol').first().locator('.pmem').count();
const before = await inPair1();
await p.locator('.paircol').first().locator('.pmem select').first().selectOption('unassigned');
await p.waitForTimeout(1400);
ok('pairs: move to unassigned sticks', await inPair1(), before - 1);

// adding and deleting a pair sticks
const cols = () => p.locator('.paircol').count();
const c0 = await cols();
await p.locator('[data-act="addPair"]').click(); await p.waitForTimeout(1400);
ok('pairs: added pair stays', await cols(), c0 + 1);
await p.locator('[data-act="deletePair"]').last().click(); await p.waitForTimeout(1400);
ok('pairs: deleted pair stays gone', await cols(), c0);

await p.locator('.rtable tbody tr').last().locator('[data-act="removePerson"]').click(); await p.waitForTimeout(1400);
ok('roster: removal stays', await golfers(), n0);

// --- the roster save control tells the truth
ok('save row confirms after an edit', (await p.locator('.saverow .sm').innerText()).includes('All changes saved at'), true);
await p.evaluate(() => { window.__failNextWrite = true; });
await p.locator('.rtable tbody tr').first().locator('[data-act="setBand"]').nth(1).click();
await p.waitForTimeout(1400);
ok('a failed write is reported', (await p.locator('.saverow .sm').innerText()).includes('did not save'), true);
ok('and the row is flagged', await p.locator('.saverow.bad').count(), 1);
await p.locator('[data-act="saveRoster"]').click(); await p.waitForTimeout(2200);
ok('Save roster recovers it', (await p.locator('.saverow .sm').innerText()).includes('All changes saved at'), true);
ok('the band that failed is stored now', await p.evaluate(() =>
  (window.__mockDocs['people/g1'] || {}).band), 20);

// --- a stroke is a draft until the hole is saved
await p.locator('.tab', { hasText: 'Score Entry' }).click(); await p.waitForTimeout(500);
await p.locator('[data-act="modalCancel"]').click().catch(() => {});
ok('chip present on Score Entry', (await p.locator('.masthead .setup-chip').count()) === 1, true);
await nominate(p);
await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1400); await shut();
await p.locator('.step.plus').first().click(); await p.waitForTimeout(300);
ok('entry: stroke shows as a draft', await p.locator('.fig.raw .v').first().innerText(), '4');
ok('entry: draft is flagged unsaved', await p.locator('.savebar .sv b').innerText(), 'Hole 1 is not saved');
ok('entry: nothing on the leaderboard yet', await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('scores/')).length), 0);

// --- leaving an unsaved hole prompts
await p.locator('.hcell').nth(3).click(); await p.waitForTimeout(300);
ok('entry: moving hole prompts', await p.locator('.modal h3').innerText(), 'Hole 1 is not saved');
await p.locator('[data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('entry: Stay keeps the draft', await p.locator('.fig.raw .v').first().innerText(), '4');

// --- saving writes it through
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1600);
ok('entry: saving moved on', await p.locator('.holehead h3').innerText(), 'Hole 2');
await hole(0);
ok('entry: hole 1 reads as saved', await p.locator('.savebar .sv b').innerText(), 'Hole 1 saved');
ok('entry: card written once saved', await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('scores/')).length), 1);
ok('entry: stroke survives the race', await p.locator('.fig.raw .v').first().innerText(), '4');

// --- discard drops the draft and moves on
await p.locator('.step.plus').first().click(); await p.waitForTimeout(300);
await p.locator('.hcell').nth(3).click(); await p.waitForTimeout(300);
await p.locator('[data-act="confirmAlt"]').click(); await p.waitForTimeout(600);
ok('entry: discard moved to hole 4', await p.locator('.holehead h3').innerText(), 'Hole 4');
await hole(0);
ok('entry: the saved stroke is still there', await p.locator('.fig.raw .v').first().innerText(), '4');

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nAll shared-store writes survived the race.');
process.exit(fails.length ? 1 : 0);
