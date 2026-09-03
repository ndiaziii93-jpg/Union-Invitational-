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
  const snapDoc = p => ({ exists: p in docs, data: p in docs ? clone(docs[p]) : null });
  const fireDoc = p => (subs.doc[p] || []).forEach(fn => fn(snapDoc(p)));
  const fireColl = c => (subs.coll[c] || []).forEach(fn => fn({
    docs: Object.keys(docs).filter(k => k.startsWith(c + '/'))
      .map(k => ({ id: k.slice(c.length + 1), data: clone(docs[k]) })),
  }));
  const fireAll = p => { fireDoc(p); fireColl(p.split('/')[0]); };

  const LAT = 340;                                  // (3) a real round trip, not an instant one
  function write(path, data) {
    const before = path in docs ? clone(docs[path]) : null;
    const pending = strip(data);                    // (2) nulls dropped in transit
    setTimeout(() => { docs[path] = pending; }, LAT);
    if (before) setTimeout(() => {                  // (1) stale echo of the PREVIOUS version
      (subs.doc[path] || []).forEach(fn => fn({ exists: true, data: before }));
      (subs.coll[path.split('/')[0]] || []).forEach(fn => fn({
        docs: Object.keys(docs).filter(k => k.startsWith(path.split('/')[0] + '/')).map(k => ({
          id: k.slice(path.split('/')[0].length + 1),
          data: k === path ? before : clone(docs[k]),
        })),
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
    get: () => Promise.resolve({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/')).map(k => ({ id: k.slice(c.length + 1), data: clone(docs[k]) })) }),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fireColl(c), 10); return () => {}; },
  });
  window.__mockDocs = docs;
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
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

// --- roster add and remove survive
await p.locator('.tab', { hasText: 'Roster' }).click(); await p.waitForTimeout(300);
const golfers = () => p.locator('.rows').first().locator('.row').count();
await p.locator('[data-act="addPerson"][data-a="golfer"]').waitFor();
const n0 = await golfers();

// --- a band survives
await p.locator('.rows').first().locator('.row').first().locator('[data-act="setBand"]').first().click();
await p.waitForTimeout(1400);
ok('roster: band 15 sticks', await p.locator('.rows').first().locator('.row').first().locator('.chip.on').innerText(), '15');

// --- roster: a new person is named by hand, not auto-labelled
await p.locator('[data-act="addPerson"][data-a="golfer"]').click(); await p.waitForTimeout(300);
await p.locator('#addName').fill('Tommy Fleetwood');
await p.locator('[data-act="addSave"]').click(); await p.waitForTimeout(1400);
ok('roster: named add lands', await p.locator('.rows').first().locator('.row').last().locator('.nameedit').inputValue(), 'Tommy Fleetwood');
ok('roster: named add counted', await golfers(), n0 + 1);

// --- rename sticks
const last = p.locator('.rows').first().locator('.row').last().locator('.nameedit');
await last.fill('Tommy F'); await last.blur(); await p.waitForTimeout(1400);
ok('roster: rename sticks', await p.locator('.rows').first().locator('.row').last().locator('.nameedit').inputValue(), 'Tommy F');
await p.locator('.rows').first().locator('[data-act="removePerson"]').last().click(); await p.waitForTimeout(1400);

// --- a stroke is a draft until the hole is saved
await p.locator('.tab', { hasText: 'Score Entry' }).click(); await p.waitForTimeout(500);
await p.locator('[data-act="modalCancel"]').click().catch(() => {});
await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1400);
await p.locator('.step', { hasText: '+' }).first().click(); await p.waitForTimeout(300);
ok('entry: stroke shows as a draft', await p.locator('.gross').first().innerText(), '4');
ok('entry: draft is flagged unsaved', await p.locator('.savebar .sv b').innerText(), 'Hole 1 is not saved');
ok('entry: nothing on the leaderboard yet', await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('scores/')).length), 0);

// --- leaving an unsaved hole prompts
await p.locator('.cell').nth(3).click(); await p.waitForTimeout(300);
ok('entry: moving hole prompts', await p.locator('.modal h3').innerText(), 'Hole 1 is not saved');
await p.locator('[data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('entry: Stay keeps the draft', await p.locator('.gross').first().innerText(), '4');

// --- saving writes it through
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1600);
ok('entry: saved bar confirms', await p.locator('.savebar .sv b').innerText(), 'Hole 1 saved');
ok('entry: card written once saved', await p.evaluate(() => Object.keys(window.__mockDocs).filter(k => k.startsWith('scores/')).length), 1);
ok('entry: stroke survives the race', await p.locator('.gross').first().innerText(), '4');

// --- discard drops the draft and moves on
await p.locator('.step', { hasText: '+' }).first().click(); await p.waitForTimeout(300);
await p.locator('.cell').nth(3).click(); await p.waitForTimeout(300);
await p.locator('[data-act="confirmAlt"]').click(); await p.waitForTimeout(600);
ok('entry: discard moved to hole 4', await p.locator('.leaf-r .eyebrow').first().innerText(), 'Hole 4 · par 4 · gross strokes');
await p.locator('.cell').nth(0).click(); await p.waitForTimeout(500);
  const el = document.querySelector('.savebar .sv b'); return el ? el.textContent : 'no savebar';
}));
ok('entry: the saved stroke is still there', await p.locator('.gross').first().innerText(), '4');

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nAll shared-store writes survived the race.');
process.exit(fails.length ? 1 : 0);
