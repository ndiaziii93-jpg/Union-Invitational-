/* The Day's Recap lights only when every card for the day is in, and the crest
   answers questions newest-first with the current one marked.
   Run: node tools/recap-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/recap.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

/* A stand-in for the sample capability. The real one spends the viewer's own
   Claude usage, so the flow is driven here, not the wording. */
const MOCK = () => { window.claude = { use: async n => {
  if (n !== 'sample') return null;
  const fn = async (input, opts) => {
    /* Record EVERYTHING the model was handed, not just the last turn. Taking
       only the last message meant "the question box is told the tournament"
       was really checking that the question was sent — which it always was —
       while the notes it answers from went unexamined. */
    const q = typeof input === 'string' ? input : input.map(m => m.content).join('\n\n');
    window.__lastPrompt = q;
    const text = q.includes('THE CARD')
      ? '# Tuesday belongs to Norberto III\n\nHe took it early and nobody answered.\n\nThe rest followed politely.'
      : 'The book says so.';
    if (opts && opts.onText) {
      opts.onText({ text: text.slice(0, 6), delta: text.slice(0, 6) });
      await new Promise(r => setTimeout(r, 50));
      opts.onText({ text, delta: text.slice(6) });
    }
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  fn.json = async () => ({}); fn.limits = async () => ({ maxPromptBytes: 65536 });
  return fn; } }; };

const fails = [];
const ok = (n, g, w) => { const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

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
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(MOCK);
const shut = async () => { for (let i = 0; i < 4; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(550); await shut(); };
await p.goto('file://' + S + '/recap.html'); await p.waitForTimeout(2800); await shut();

// --- the crest ---
ok('the crest is a button', await p.locator('.crestbtn').count(), 1);
await p.locator('.crestbtn').click(); await p.waitForTimeout(450);
ok('it opens the question box', await p.locator('.askbox').count(), 1);
await p.locator('#askField').fill('Who is leading?');
await p.locator('#askField').press('Enter'); await p.waitForTimeout(700);
await p.locator('#askField').fill('What band is Matt D on?');
await p.locator('#askField').press('Enter'); await p.waitForTimeout(700);
const qs = await p.locator('.askitem .askq').allInnerTexts();
ok('newest answer sits on top', qs[0].startsWith('What band'), true);
ok('the oldest is at the bottom', qs[qs.length - 1].startsWith('Who is leading'), true);
ok('exactly one is highlighted', await p.locator('.askitem.current').count(), 1);
ok('and it is the newest', (await p.locator('.askitem.current .askq').innerText()).startsWith('What band'), true);
/* The crest was asked when check-out is and said it did not know, with the
   answer sitting in the book two tabs away. It is told the whole week now. */
ok('the question box knows when check-out is', await p.evaluate(
  () => String(window.__lastPrompt || '').includes('Check-out')), true);
ok('and the whole week around it', await p.evaluate(
  () => String(window.__lastPrompt || '').includes('THE WEEK, DAY BY DAY')), true);
ok('and the rules it is played under', await p.evaluate(
  () => String(window.__lastPrompt || '').includes('Breakfast ball')), true);
ok('and every tee time', await p.evaluate(
  () => String(window.__lastPrompt || '').includes('TEE TIMES')), true);
ok('the question box is told the tournament',
  await p.evaluate(() => String(window.__lastPrompt || '').includes('What band is Matt D on?')), true);
await p.keyboard.press('Escape'); await p.waitForTimeout(350);
ok('escape closes it', await p.locator('.askbox').count(), 0);

/* Typing survives a redraw. The store polls every few seconds now, so a
   redraw lands in the middle of a sentence as a matter of routine — and the
   box was the one text field in the book with no data-act, which is the
   attribute the focus-restore keys on. It lost the caret, and the last
   letter with it. */
console.log('\ntyping in the question box');
await p.locator('.crestbtn').click(); await p.waitForTimeout(400);
await p.locator('#askField').click();
await p.keyboard.type('When is check-out');
await p.evaluate(() => window.__forceRender && window.__forceRender());
await p.waitForTimeout(450);
ok('the caret is still in the box', await p.evaluate(
  () => document.activeElement && document.activeElement.id === 'askField'), true);
ok('and every letter survived', await p.locator('#askField').inputValue(), 'When is check-out');
await p.keyboard.type('?');
ok('so typing carries on where it left off', await p.locator('#askField').inputValue(), 'When is check-out?');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// --- the recap stays dark until every card is in ---
await tab('Today');
ok('the recap button is there', await p.locator('.recapbtn').count(), 1);
ok('and is not lit yet', await p.locator('.recapbtn.ready').count(), 0);

await tab('Score Entry');
if (await p.locator('[data-act="openRound"]').count()) {
  await nominate(p); await shut();
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1200); await shut();
}
const groups = await p.locator('.gchip').count();
for (let g = 0; g < groups; g++) {
  await p.locator('.gchip').nth(g).click(); await p.waitForTimeout(350); await shut();
  await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(300); await shut();
  const n = await p.locator('.step.plus').count();
  for (let h = 0; h < 18; h++) {
    for (let i = 0; i < n; i++) { await p.locator('.step.plus').nth(i).click(); await p.waitForTimeout(25); }
    await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(340); await shut();
  }
  // after the last hole of a group, come back to the first for the next one
  if (await p.locator('.gchip').count() > g + 1) { await p.locator('.hcell').nth(0).click(); await p.waitForTimeout(250); }
}
await tab('Today');
ok('every card in lights it up', await p.locator('.recapbtn.ready').count(), 1);
await p.locator('.recapbtn').click(); await p.waitForTimeout(900);
ok('it opens the recap window', await p.locator('.recapbox').count(), 1);

/* This mock answers in prose, not the JSON the generator asks for. A report is
   only worth reading if it lines up with the table under it, so a reply the
   book cannot parse is refused outright rather than half-rendered. */
await p.locator('[data-act="recapGen"]').click(); await p.waitForTimeout(1400);
ok('it was given the day\'s card',
  await p.evaluate(() => String(window.__lastPrompt || '').includes('THE CARD')), true);
ok('prose where JSON was asked for is refused', await p.locator('.askerr').count(), 1);
ok('and nothing was written', await p.locator('.rechead').innerText(), 'No report yet');
await p.locator('.recapgrid').screenshot({ path: S + '/recap.png' });
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe crest answers, and the day reports itself.');
process.exit(fails.length ? 1 : 0);
