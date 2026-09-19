/* The rules that guard a card: the pin and drive holes are nominated before
   anything opens, and Bingo Bango Bongo can only ever be won by somebody in
   the group being scored.  Run: node tools/entry-rules-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/entry-rules.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
const shut = async () => { for (let i = 0; i < 4; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); } };
const tab = async t => { await shut(); await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(550); await shut(); };
const pick = f => p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
const names = async () => (await p.locator('[data-act="setBbb"][data-a="bingo"] option')
  .allInnerTexts()).filter(x => x !== 'Nobody yet');

await p.goto('file://' + S + '/entry-rules.html'); await p.waitForTimeout(2800); await shut();
await tab('Score Entry');

console.log('\nthe pin and the drive come first');
ok('a round with no nominations will not open', await p.locator('[data-act="openRound"][disabled]').count(), 1);
ok('and the gate says what it wants', (await p.locator('.gate .msg span').innerText()).includes('Nominate'), true);
ok('the gate offers to take you there', await p.locator('[data-act="goPins"]').count(), 1);
ok('the closest-to-the-pin list is par 3s only', await p.locator(
  '[data-act="setRoundField"][data-a="ctpHole"] option').count() < 18, true);

await pick('ctpHole').selectOption({ index: 1 }); await p.waitForTimeout(600); await shut();
ok('one of two is not enough', await p.locator('[data-act="openRound"][disabled]').count(), 1);
await pick('ldHole').selectOption({ index: 1 }); await p.waitForTimeout(600); await shut();
ok('both nominated and the round can open', await p.locator('[data-act="openRound"][disabled]').count(), 0);
ok('the nominations stuck', [await pick('ctpHole').inputValue() !== '', await pick('ldHole').inputValue() !== ''], [true, true]);

await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1300); await shut();
ok('the card is open', await p.locator('[data-act="saveHole"]').count(), 1);
ok('and a scorer can still move a hole', await pick('ctpHole').isDisabled(), false);

console.log('\nBingo Bango Bongo stays inside the group');
const g1 = await names();
const inGroup1 = await p.locator('.prow .pwho .nm').allInnerTexts();
ok('group 1 offers exactly the four playing it', g1.length, inGroup1.length);
ok('and nobody else', g1.slice().sort(), inGroup1.map(x => x.replace('unsaved', '').trim()).sort());

const chips = await p.locator('.gchip').count();
if (chips > 1) {
  await p.locator('.gchip').nth(1).click(); await p.waitForTimeout(600); await shut();
  const g2 = await names();
  ok('group 2 offers its own four', g2.length, (await p.locator('.prow .pwho .nm').allInnerTexts()).length);
  ok('and shares nobody with group 1', g2.filter(x => g1.includes(x)), []);
} else { ok('there is a second group to check', chips > 1, true); }

console.log('\ntwo refs, two sets of points');
/* One set of marks per hole meant the second ref to save wiped the first
   ref's points, silently. Each group keeps its own three. */
const mark = async (slot, idx) => {
  await p.locator('[data-act="setBbb"][data-a="' + slot + '"]').selectOption({ index: idx });
  await p.waitForTimeout(250);
};
const marked = async slot => p.locator('[data-act="setBbb"][data-a="' + slot + '"]').inputValue();

await p.locator('.gchip').first().click(); await p.waitForTimeout(500); await shut();
await mark('bingo', 1);
const one = await marked('bingo');
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(400); await shut();
ok('group 1 kept its mark', await marked('bingo'), one);

await p.locator('.gchip').nth(1).click(); await p.waitForTimeout(600); await shut();
ok('group 2 starts with none of it', await marked('bingo'), '');
await mark('bingo', 1);
const two = await marked('bingo');
ok('and group 2 marked somebody else', two === one, false);
await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(900); await shut();
await p.locator('.hcell').first().click(); await p.waitForTimeout(400); await shut();

await p.locator('.gchip').first().click(); await p.waitForTimeout(600); await shut();
ok('group 1 still has its own mark after group 2 saved', await marked('bingo'), one);

await tab('Leaderboards');
await p.locator('.btab, .chip', { hasText: /Bingo/i }).first().click().catch(() => {});
await p.waitForTimeout(600);
await tab('Score Entry');

console.log('\nthe look of it');
ok('a hole cell has soft corners', await p.locator('.hcell').first().evaluate(
  el => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 6), true);

console.log('\nthe cup is singles all week');
await tab('Ryder Cup');
const fmts = await p.locator('.sub').allInnerTexts();
ok('every session is singles', fmts.filter(x => /Singles/.test(x)).length, 3);
ok('and none of them is a fourball', fmts.filter(x => /Fourball/i.test(x)).length, 0);

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe card will not open early, and the group keeps its own points.');
process.exit(fails.length ? 1 : 0);
