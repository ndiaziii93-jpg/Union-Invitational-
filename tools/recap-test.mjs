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
    const q = typeof input === 'string' ? input : input[input.length - 1].content;
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
ok('the question box is told the tournament',
  await p.evaluate(() => String(window.__lastPrompt || '').includes('What band is Matt D on?')), true);
await p.keyboard.press('Escape'); await p.waitForTimeout(350);
ok('escape closes it', await p.locator('.askbox').count(), 0);

// --- the recap stays dark until every card is in ---
await tab('Today');
ok('the recap button is there', await p.locator('.recapbtn').count(), 1);
ok('and is not lit yet', await p.locator('.recapbtn.ready').count(), 0);

await tab('Score Entry');
if (await p.locator('[data-act="openRound"]').count()) {
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
await p.locator('.recapbtn').click(); await p.waitForTimeout(1200);
ok('the report has a headline', (await p.locator('.recaptext h4').innerText()).length > 3, true);
ok('and reads as paragraphs', await p.locator('.recaptext p').count() > 1, true);
ok('it was given the day\'s card',
  await p.evaluate(() => String(window.__lastPrompt || '').includes('THE CARD')), true);
await p.locator('.askbox').screenshot({ path: S + '/recap.png' });
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe crest answers, and the day reports itself.');
process.exit(fails.length ? 1 : 0);
