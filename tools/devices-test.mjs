/* The same four things that matter, on every shape of screen the squad will
   actually hold: set a tee time, open a round, enter a stroke, save it — and
   nothing off the side of the screen anywhere.
   NOTE: only Chromium is available here. Layout, sizing and the handlers are
   covered on every profile; Safari's own engine is NOT, so an iPhone still
   needs a human. Run: node tools/devices-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/dev.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational.html', 'utf8') + '</body></html>');

const LIVE = JSON.parse(readFileSync(S + '/db7/config/tournament.json', 'utf8'));
const seed = { 'config/tournament': LIVE };
for (const f of readdirSync(S + '/restore/people')) seed['people/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/people/' + f, 'utf8'));
for (const f of readdirSync(S + '/restore/pairs')) seed['pairs/' + f.replace('.json', '')] = JSON.parse(readFileSync(S + '/restore/pairs/' + f, 'utf8'));

const MOCK = (seed) => {
  const docs = JSON.parse(JSON.stringify(seed));
  const clone = o => JSON.parse(JSON.stringify(o));
  /* The real store hands back FROZEN bodies — a mock that does not freeze
     proves nothing. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k])); Object.freeze(o); } return o; };
  const snap = (b, e = true, id = '') => ({ id, exists: e, data: () => (e ? deepFreeze(b) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  const subs = { doc: {}, coll: {} };
  const merge = (d, s) => { for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) merge(d[k], v);
    else d[k] = clone(v); } return d; };
  const collSnap = c => ({ docs: Object.keys(docs).filter(k => k.startsWith(c + '/')).map(k => snap(clone(docs[k]), true, k.slice(c.length + 1))) });
  const fire = c => (subs.coll[c] || []).forEach(f => f(collSnap(c)));
  const echo = path => setTimeout(() => { (subs.doc[path] || []).forEach(f => f(snap(clone(docs[path])))); fire(path.split('/')[0]); }, 80);
  const docRef = path => ({ id: path.split('/').pop(), path,
    get: () => new Promise(r => setTimeout(() => r(snap(path in docs ? clone(docs[path]) : null, path in docs)), 70)),
    set: d => { docs[path] = clone(d); echo(path); return Promise.resolve(); },
    update: d => { if (!(path in docs)) return Promise.reject({ code: 'invalid_argument', message: 'not found' });
      merge(docs[path], clone(d)); echo(path); return Promise.resolve(); },
    delete: () => { delete docs[path]; setTimeout(() => fire(path.split('/')[0]), 70); return Promise.resolve(); },
    onSnapshot(fn) { (subs.doc[path] = subs.doc[path] || []).push(fn);
      setTimeout(() => fn(snap(path in docs ? clone(docs[path]) : null, path in docs)), 140); return () => {}; } });
  const collRef = c => ({ path: c, doc: id => docRef(c + '/' + id), get: () => Promise.resolve(collSnap(c)),
    onSnapshot(fn) { (subs.coll[c] = subs.coll[c] || []).push(fn); setTimeout(() => fn(collSnap(c)), 140); return () => {}; } });
  window.__docs = docs;
  window.claude = { use: async n => (n === 'db' ? { doc: docRef, collection: collRef } : null) };
};

const DEVICES = [
  ['Mac laptop',        { width: 1440, height: 900 },  false, 2],
  ['Mac desktop',       { width: 1920, height: 1080 }, false, 1],
  ['iPad Pro 11',       { width: 834,  height: 1194 }, true,  2],
  ['iPad mini',         { width: 744,  height: 1133 }, true,  2],
  ['iPhone 15 Pro Max', { width: 430,  height: 932 },  true,  3],
  ['iPhone 13',         { width: 390,  height: 844 },  true,  3],
  ['iPhone SE',         { width: 375,  height: 667 },  true,  2],
  ['Pixel 7',           { width: 412,  height: 915 },  true,  2.6],
  ['Galaxy S20',        { width: 360,  height: 800 },  true,  3],
];

const fails = [];
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
for (const [name, viewport, touch, dpr] of DEVICES) {
  const ctx = await b.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.addInitScript(MOCK, seed);
  const dismiss = async () => { for (let i = 0; i < 5; i++) { if (!await p.locator('.scrim').count()) return;
    await p.locator('.scrim [data-act="modalCancel"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
  const tab = async t => { await dismiss(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(550); await dismiss(); };
  const bad = [];
  try {
    await p.goto('file://' + S + '/dev.html'); await p.waitForTimeout(2600); await dismiss();

    // 1. a tee time can be set, and it is what the book keeps
    await tab('Leaderboards');
    const sel = n => p.locator('.teetimes .timepick').first().locator('select').nth(n);
    await sel(0).selectOption('9'); await p.waitForTimeout(400);
    await sel(1).selectOption('50'); await p.waitForTimeout(900);
    const kept = await p.evaluate(() => window.__docs['config/tournament'].rounds.r1.tees[0].time);
    if (kept !== '09:50') bad.push('tee time kept "' + kept + '"');

    // 2. a round opens
    await tab('Score Entry');
    if (await p.locator('[data-act="openRound"]').count()) {
      await nominate(p); await dismiss();
      await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1400); await dismiss();
    }
    if (await p.locator('[data-act="openRound"]').count()) bad.push('round would not open');

    // 3. a stroke goes in and saves
    if (!await p.locator('.step.plus').count()) bad.push('no scoring controls');
    else {
      const before = await p.locator('.holehead h3').innerText();
      await p.locator('.step.plus').first().click(); await p.waitForTimeout(400);
      await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1500); await dismiss();
      const cards = await p.evaluate(() => Object.keys(window.__docs).filter(k => k.startsWith('scores/')).length);
      if (cards < 1) bad.push('the card never reached the book');
      // saving a hole means the group has finished it: walk on
      const after = await p.locator('.holehead h3').innerText();
      if (after === before) bad.push('saving did not move on from ' + before);
      // and a scored hole must look different from one still to play
      const tones = await p.evaluate(() => {
        const c = document.querySelectorAll('.hstrip .hcell');
        const done = [...c].find(e => e.classList.contains('saved') && !e.classList.contains('on'));
        const todo = [...c].find(e => !e.classList.contains('saved') && !e.classList.contains('on'));
        if (!done || !todo) return null;
        return [getComputedStyle(done).backgroundColor, getComputedStyle(todo).backgroundColor];
      });
      if (!tones) bad.push('could not compare a scored hole with an unscored one');
      else if (tones[0] === tones[1]) bad.push('scored and unscored holes look identical');
    }

    // 3b. minus works from an empty cell, without a tap up first
    if (await p.locator('.step.minus').count()) {
      await p.locator('.hcell').nth(5).click(); await p.waitForTimeout(500); await dismiss();
      await p.locator('.step.minus').first().click(); await p.waitForTimeout(400);
      const one = await p.locator('.fig.raw .v').first().innerText();
      const par = await p.locator('.hcell.on .p').innerText();      // "par 4"
      const want = String(parseInt(par.replace(/\D/g, ''), 10) - 1);
      if (one !== want) bad.push('minus from empty gave "' + one + '", wanted ' + want);
      /* And put it in. A nav tab pressed over a half-entered hole asks
         whether to stay, and dismiss() answers "stay" — which would leave
         every screen read after this one reading Score Entry. */
      await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1300); await dismiss();
    }

    // 3c. the 18th goes in and the crest asks whether that was the round
    if (await p.locator('.hcell').count()) {
      /* No red Lock and conclude on the bar any more: a round finishes group
         by group, so nothing on hole 6 can end it. */
      if (await p.locator('.savebar [data-act="lockRound"]').count()) bad.push('the bar still ends the round early');
      await p.locator('.hcell').nth(17).click(); await p.waitForTimeout(500); await dismiss();
      const plus = p.locator('.step.plus'); const np = await plus.count();
      for (let i = 0; i < np; i++) { await plus.nth(i).click(); await p.waitForTimeout(90); }
      if (np) { await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(1400); }

      if (!await p.locator('.finishmodal').count()) bad.push('the 18th went in and nothing asked');
      else {
        /* It is a window with a 150px crest in it, and the smallest phone
           here is 375 across. It has to fit, and the two buttons have to be
           hittable with a thumb on the 18th green. */
        const fit = await p.evaluate(() => {
          const m = document.querySelector('.finishmodal').getBoundingClientRect();
          const c = document.querySelector('.fm-crest');
          const btns = [...document.querySelectorAll('.finishmodal .acts button')];
          return { off: m.left < -0.5 || m.right > window.innerWidth + 0.5,
            tall: m.height > window.innerHeight,
            crest: c ? Math.round(c.getBoundingClientRect().width) : 0,
            small: btns.filter(b => b.getBoundingClientRect().height < 44).length,
            n: btns.length };
        });
        if (fit.off) bad.push('the finish window runs off the side');
        if (fit.tall) bad.push('the finish window is taller than the screen');
        if (fit.crest < 60) bad.push('the crest came out ' + fit.crest + 'px');
        if (fit.n !== 2) bad.push('the finish window offers ' + fit.n + ' buttons');
        if (fit.small) bad.push(fit.small + ' finish button(s) under 44px');
        if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
          bad.push('the finish window pushes the page sideways');
        }
        await p.locator('.finishmodal [data-act="finishGroup"]').click(); await p.waitForTimeout(1200); await dismiss();
        if (!await p.locator('.savebar.done').count()) bad.push('finishing left no finished bar');
      }
    }

    // 3c2. and the whole round can still be concluded from Settings
    /* By id, not by words: "Setup" is also inside "Course Setup". */
    await dismiss(); await p.locator('.tab[data-a="setup"]').click();
    await p.waitForTimeout(600); await dismiss();
    if (await p.locator('[data-act="lockRound"]').count()) {
      await p.locator('[data-act="lockRound"]').first().click(); await p.waitForTimeout(1400); await dismiss();
      const st = await p.evaluate(() => {
        const r = window.__docs['config/tournament'].rounds;
        return Object.values(r).map(x => x.state).join('/');
      });
      if (!st.includes('locked')) bad.push('lock & conclude did nothing (' + st + ')');
    } else bad.push('no way to conclude a round from Settings');

    // 3d. the practice day stands alone: its scores show there and nowhere else
    await tab('Leaderboards');
    const tabNames = await p.locator('.btab').allInnerTexts();
    if (!tabNames.some(t => t.includes('Practice'))) bad.push('no Practice Day board');
    else {
      for (const t of ['Team Competition', 'MVP', 'Bingo Bango Bongo']) {
        await p.locator('.btab', { hasText: t }).click(); await p.waitForTimeout(600); await dismiss();
        if (await p.locator('.rows .row').count() > 0) bad.push(t + ' counted a practice score');
      }
      await p.locator('.btab', { hasText: 'Practice Day' }).click(); await p.waitForTimeout(600); await dismiss();
      if (await p.locator('.rows .row').count() === 0) bad.push('Practice Day shows nothing');
    }
    // 3f. a group is two pairs, in pairing order — a fourball
    await tab('Roster');
    const nPairs = await p.locator('.paircol:not(.un)').count();
    await tab('Score Entry');
    const chips = await p.locator('.gchip').allInnerTexts();
    const wantGroups = Math.ceil(nPairs / 2);
    if (chips.length !== wantGroups) {
      bad.push(nPairs + ' pairings should make ' + wantGroups + ' groups, got ' + chips.length);
    }
    if (chips.length && !chips[0].startsWith('Group 1')) bad.push('first group is "' + chips[0] + '"');
    // two pairs to a group, so never more than a fourball. It can be fewer:
    // a pair holding somebody who is not a golfer contributes only its golfers.
    if (nPairs >= 2) {
      const inFirst = await p.locator('.fig.raw').count();
      if (inFirst < 1 || inFirst > 4) bad.push('Group 1 holds ' + inFirst + ' golfers');
    }

    // 3e. and a golfer can be put in the 30 band
    await tab('Roster');
    const bands = await p.locator('.rtable tbody tr').first().locator('[data-act="setBand"]').allInnerTexts();
    if (!bands.includes('30')) bad.push('no 30 band (' + bands.join('/') + ')');

    // 4. nothing off the side, on any screen
    for (const t of ['Today', 'Leaderboards', 'Ryder Cup', 'Calendar', 'Score Entry', 'Roster', 'Games & Rules', 'Course Setup']) {
      await tab(t);
      if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(t + ' scrolls sideways');
    }
    // 5. and a thumb can hit the scoring buttons
    await tab('Score Entry');
    const small = await p.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.step, [data-act="saveHole"], .hcell').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.height && r.height < 40) n++;
      });
      return n;
    });
    if (small) bad.push(small + ' scoring controls under 40px');
  } catch (e) {
    bad.push('threw: ' + String(e.message).split('\n')[0]);
  }
  if (errs.length) bad.push('page error: ' + errs[0]);
  console.log((bad.length ? '  FAIL  ' : '  PASS  ') + name.padEnd(18) + (bad.length ? bad.join('; ') : 'tee time, open round, score saved, nothing off-screen'));
  if (bad.length) fails.push(name);
  await p.close(); await ctx.close();
}
await b.close();
console.log(fails.length ? '\nFAILED on: ' + fails.join(', ') : '\nEvery screen shape scores.');
process.exit(fails.length ? 1 : 0);
