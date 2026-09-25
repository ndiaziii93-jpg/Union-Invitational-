/* The report writes itself the moment the last card is in.
 *
 * It takes the best part of a minute to write. Opening the panel already
 * started it, which meant the commissioner opened the recap and WATCHED one
 * arrive. The day's last putt is the signal — by the time anyone gets to the
 * clubhouse there should be a draft on the screen to read and correct.
 *
 * What is tested is the restraint as much as the trigger: the 17th does not
 * start it, a round with a group still out does not start it, and a report
 * that already exists is not paid for twice.
 *
 * Run: node tools/recap-auto-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/rauto.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* A sampler that counts, so "wrote it once" can be told from "wrote it
   twice and billed for both". */
const REPLY = JSON.stringify({
  headline: 'The wind got up on the back nine',
  narrative: ['It was that sort of afternoon.', 'Nobody said much on the 16th tee.'],
  swing: { value: '4 shots', caption: 'between the 12th and the 15th' },
  pairNotes: {}, honours: [],
});
const MOCK = (reply) => {
  window.__asks = 0;
  const sample = async (prompt, opts) => {
    window.__asks++;
    window.__lastPrompt = String(prompt).slice(0, 4000);
    await new Promise(r => setTimeout(r, 250));
    if (opts && opts.onText) opts.onText({ text: reply });
    return { text: reply, truncated: false };
  };
  window.claude = { use: async n => (n === 'sample' ? sample : null) };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(MOCK, REPLY);

const shut = async () => { for (let i = 0; i < 6; i++) {
  const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return;
  await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(200); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click();
  await p.waitForTimeout(650); await shut(); };

await p.goto('file://' + S + '/rauto.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(500); await shut();

await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) {
  const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (!n) continue;
  await bs.nth(i % n).click(); await p.waitForTimeout(80);
}
await p.waitForTimeout(500); await shut();

await tab('Scores');
await p.locator('.rcard:not(.practice)').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole', 'ldHole']) {
  const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(320); await shut(); }
}
if (await p.locator('[data-act="openRound"]').count()) {
  await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut();
}

const groups = await p.locator('.gchip').count();
ok('there is more than one group out', groups > 1, true);

const playHole = async i => {
  await shut();
  await p.locator('.hcell').nth(i).click(); await p.waitForTimeout(350); await shut();
  const plus = p.locator('.step.plus'); const c = await plus.count();
  for (let k = 0; k < c; k++) { await plus.nth(k).click(); await p.waitForTimeout(55); }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(600);
};
const asks = () => p.evaluate(() => window.__asks);

console.log('\na round with a group still out is not a day');
/* EVERY group, not two. The field is five pairs, which is three groups, and
   a report written while the third is on the 4th would be a report about
   two thirds of a day. */
for (let g = 0; g < groups; g++) {
  await p.locator('.gchip').nth(g).click(); await p.waitForTimeout(500); await shut();
  for (let i = 0; i < 17; i++) await playHole(i);
  await shut();
  ok('group ' + (g + 1) + ' has a hole to play and nothing is written', await asks(), 0);
  await playHole(17);
  await shut(); await p.waitForTimeout(g === groups - 1 ? 2400 : 900);
  if (g < groups - 1) {
    ok('group ' + (g + 1) + ' is round, the rest are not, still nothing', await asks(), 0);
  }
}

console.log('\nthe last card of the day starts it, unasked');
ok('the last card in starts the report', await asks(), 1);

console.log('\nand it is there to read, not to wait for');
/* The button is on Today, not on the boards. */
await tab('Today');
ok('the button says the day is ready to read',
  /read the report|read the day/i.test(await p.locator('.recapbtn').innerText()), true);
await p.locator('[data-act="recapOpen"]').first().click(); await p.waitForTimeout(1400);
const headline = await p.locator('.rechead').count() ? (await p.locator('.rechead').innerText()).trim() : '';
console.log('          (the headline reads: ' + headline + ')');
ok('opening it finds a report already written', /wind got up/i.test(headline), true);
ok('it is not still being written', await p.locator('[data-act="recapStop"]').count(), 0);
ok('and does not pay for a second one', await asks(), 1);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
