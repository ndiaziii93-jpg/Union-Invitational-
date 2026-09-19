/* The recap panel's four states, the screen it opens, and that every figure on
   it comes off the cards. Run: node tools/recap-screen-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/rs.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const MOCK = () => { window.claude = { use: async n => {
  if (n !== 'sample') return null;
  const fn = async (input, opts) => {
    window.__prompt = String(input);
    const body = {
      headline: 'Aspendos waited until the 12th, then took it back',
      narrative: ['There is a moment on every golf course where the land stops being scenery.',
                  'Duncan answered the way steady players do, which is to say invisibly.',
                  'The punctuation came on 14, holed from the fairway bunker.'],
      swing: { value: '4 shots', caption: 'opened between the leaders and third across holes 12 to 16.' },
      pairNotes: { p1: 'Three pars from the 12th and the day was theirs.' },
      honours: [{ slot: 'shot_of_the_day', winner: 'g1', citation: 'Holed out from the fairway bunker on 14.' },
                { slot: 'honest_scorecard', winner: 'g2', citation: 'Wrote down the eight without negotiation.' }],
    };
    const text = '```json\n' + JSON.stringify(body) + '\n```';   // fenced on purpose
    if (opts && opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'complex' };
  };
  fn.json = async () => ({}); fn.limits = async () => ({ maxPromptBytes: 65536 });
  return fn; } }; };

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(MOCK);
const shut = async () => { for (let i = 0; i < 4; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(550); await shut(); };
const line = () => p.locator('.recapbtn .rb-s').innerText();
await p.goto('file://' + S + '/rs.html'); await p.waitForTimeout(2800); await shut();

/* Every figure the recap shows is net off a playing band, exactly as the
   championship board computes it — an unbanded golfer has no net score and is
   excluded there too. So set the bands first, the way a real setup does. */
await tab('Roster & Pairings');
const bandBtns = p.locator('[data-act="setBand"][data-b="20"]');
const nb = await bandBtns.count();
for (let i = 0; i < nb; i++) { await bandBtns.nth(i).click(); await p.waitForTimeout(160); await shut(); }
await p.waitForTimeout(500);
ok('every golfer has a band', await p.locator('[data-act="setBand"].on').count(), nb);
await tab('Today');

console.log('\nthe panel follows the round');
ok('nothing played yet', await line(), "Today's round hasn't started.");
ok('and it cannot be opened', await p.locator('.recapbtn[disabled]').count(), 1);

// one card part-way in
await tab('Score Entry');
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut();
}
await p.locator('.step.plus').first().click(); await p.waitForTimeout(200);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
await tab('Today');
ok('a card going in reads as in progress', (await line()).startsWith('Round in progress —'), true);

// every card in
await tab('Score Entry');
const groups = await p.locator('.gchip').count();
for (let g = 0; g < groups; g++) {
  await p.locator('.gchip').nth(g).click(); await p.waitForTimeout(300); await shut();
  await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(250); await shut();
  const n = await p.locator('.step.plus').count();
  for (let h = 0; h < 18; h++) {
    for (let i = 0; i < n; i++) { await p.locator('.step.plus').nth(i).click(); await p.waitForTimeout(20); }
    await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(300); await shut();
  }
  if (g + 1 < groups) { await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(220); }
}
await tab('Today');
ok('complete but unwritten asks for the report', await line(), 'Round complete — generate the report.');

console.log('\nthe recap window');
await p.locator('.recapbtn').click(); await p.waitForTimeout(700);
ok('it opens over the page, not instead of it', await p.locator('.recapbox').count(), 1);
ok('Today is still behind it', await p.locator('.recapbtn').count(), 1);
ok('the meta rail is in it', await p.locator('.metarail').count(), 1);
ok('the meta rail has five facts', await p.locator('.metarail span').count(), 5);
ok('the ribbon has eighteen cells', await p.locator('.ribcell').count(), 18);
ok('the table is there', await p.locator('.rectable .row').count() > 0, true);
ok('four honours, always', await p.locator('.row.honour').count(), 4);
ok('the photo strip invites the first', (await p.locator('.phempty').innerText()).startsWith('No photos'), true);
ok('and up next closes it', await p.locator('.upnext').count(), 1);

console.log('\nwriting it');
await p.locator('[data-act="recapGen"]').click(); await p.waitForTimeout(1600);
ok('the fenced JSON was still parsed', (await p.locator('.rechead').innerText()).startsWith('Aspendos waited'), true);
ok('three paragraphs', await p.locator('.recpara').count(), 3);
ok('the pair note landed under the pair', (await p.locator('.rectable .row .who small').first().innerText()).length > 5, true);
ok('an honour has its winner', (await p.locator('.row.honour .n').first().innerText()).length > 1, true);
ok('the generator was handed the cards', await p.evaluate(() => String(window.__prompt || '').includes('CARDS (gross then net')), true);
ok('and told the ids to use', await p.evaluate(() => String(window.__prompt || '').includes('PLAYER IDS')), true);

console.log('\nkeeping it');
await p.locator('.recaptop [data-act="recapClose"]').click(); await p.waitForTimeout(600);
ok('the panel now says it is ready', (await line()).includes('read the report'), true);
await p.locator('.recapbtn').click(); await p.waitForTimeout(700);
ok('and the words are still there, not rewritten', (await p.locator('.rechead').innerText()).startsWith('Aspendos waited'), true);
await p.locator('.recapgrid').screenshot({ path: S + '/recap-top.png' });

console.log('\nthe commissioner has the words');
await p.locator('[data-act="recapEditToggle"]').click(); await p.waitForTimeout(500);
ok('the headline becomes a field', await p.locator('.recedit.head').count(), 1);
ok('and there is a slot for one more paragraph', await p.locator('textarea.recedit:not(.head)').count(), 4);
ok('every pair has a note field', await p.locator('.rectable [data-act="recapEdit"][data-a="note"]').count() > 0, true);
ok('every honour has a winner to pick', await p.locator('[data-act="recapEdit"][data-a="winner"]').count(), 4);
ok('the figures are never editable', await p.locator('.rectable .num input, .ribcell input, .metarail input').count(), 0);

const head = p.locator('.recedit.head');
await head.fill('Duncan holds on at Olympos');
await p.keyboard.press('Tab'); await p.waitForTimeout(700);
await p.locator('[data-act="recapEditToggle"]').click(); await p.waitForTimeout(600);
ok('the edited headline stuck', await p.locator('.rechead').innerText(), 'Duncan holds on at Olympos');
ok('and the narrative it did not touch is intact', await p.locator('.recpara').count(), 3);

await p.locator('[data-act="recapEditToggle"]').click(); await p.waitForTimeout(500);
const last = p.locator('textarea.recedit:not(.head)').last();
await last.fill('And that, as they say, was the round.');
await p.keyboard.press('Tab'); await p.waitForTimeout(700);
await p.locator('[data-act="recapEditToggle"]').click(); await p.waitForTimeout(600);
ok('a fourth paragraph can be added', await p.locator('.recpara').count(), 4);

console.log('\nthe gallery');
await p.locator('[data-act="recapGallery"]').click(); await p.waitForTimeout(600);
ok('every round of the week has a section', await p.locator('.galsec').count(), 4);
ok('it says so when there is nothing in it', (await p.locator('.galsec .phempty').first().innerText()).startsWith('No photos'), true);
ok('the writing controls step aside', await p.locator('[data-act="recapGen"]').count(), 0);
await p.locator('.recaparch .chip').first().click(); await p.waitForTimeout(600);
ok('and a round chip brings the report back', await p.locator('.rechead').count(), 1);


/* The report is read on a phone at breakfast as often as on a laptop, so the
   same page is measured at both before it is called done. */
console.log('\nand it reads on a phone');
const probe = () => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let q = el.parentElement, scroller = false;
      while (q && q !== document.body) { const o = getComputedStyle(q).overflowX;
        if (o === 'auto' || o === 'scroll') { scroller = true; break; } q = q.parentElement; }
      if (!scroller) bad.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    }
  }
  return { over: document.documentElement.scrollWidth - vw, bad: [...new Set(bad)].slice(0, 6) };
};
for (const [nm2, w, h] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(600);
  const r = await p.evaluate(probe);
  ok('the recap fits a ' + nm2, r.over <= 1, true);
  if (r.over > 1) console.log('      culprits: ' + r.bad.join(', '));
  await p.locator('[data-act="recapGallery"]').click(); await p.waitForTimeout(500);
  const g = await p.evaluate(probe);
  ok('the gallery fits a ' + nm2, g.over <= 1, true);
  if (g.over > 1) console.log('      culprits: ' + g.bad.join(', '));
  await p.locator('.recaparch .chip').first().click(); await p.waitForTimeout(450);
  await p.screenshot({ path: S + '/recap-' + nm2 + '.png', fullPage: true });
}
await p.setViewportSize({ width: 1280, height: 1000 }); await p.waitForTimeout(500);

await p.locator('.recaptop [data-act="recapClose"]').click(); await p.waitForTimeout(500);
ok('close puts the window away', await p.locator('.recapbox').count(), 0);
ok('and leaves you where you were', await p.locator('.recapbtn').count(), 1);
await p.locator('.recapbtn').click(); await p.waitForTimeout(600);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
ok('escape closes it too', await p.locator('.recapbox').count(), 0);
await p.locator('.recapbtn').click(); await p.waitForTimeout(600);
await p.mouse.click(6, 6); await p.waitForTimeout(500);
ok('and so does the backdrop', await p.locator('.recapbox').count(), 0);
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe recap reports the round it is given.');
process.exit(fails.length ? 1 : 0);
