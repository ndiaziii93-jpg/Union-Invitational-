/* How'd it feel? — the question put to a golfer the moment a score worth
   asking about lands, answered with one tap on a strip above the nav; the
   strip on My Round that counts what they kept; and the day's report
   carrying it all, written by the book itself the moment the last card is
   in and published without anybody pressing anything.
   Run: node tools/feel-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import * as E from '../src/engine.js';
import { defaultConfig, blankCard, blankNote } from '../src/store.js';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* ---- the engine: which holes are asked about, and what the writer is told ---- */
console.log('\nthe engine');
const T = { config: defaultConfig(), scores: {}, bbb: {}, recaps: {}, photos: {}, notes: {} };
T.config.people.forEach(p => { if (p.role === 'golfer') p.band = 2; });
T.config.rounds.r1.ctpHole = 5; T.config.rounds.r1.ldHole = 9;
const holes = E.courseOf(T, 'r1').holes;
const c = blankCard();
for (let h = 0; h < 18; h++) c.raw[h] = holes[h].par;    // a round of pars
c.raw[2] = holes[2].par + 2;                              // a double on 3
c.raw[6] = holes[6].par - 1;                              // a birdie on 7
c.raw[10] = holes[10].par + 1; c.marks[10] = ['water'];   // a bogey the ref marked on 11
T.scores['r1__g1'] = c;
const asks = E.feelAsks(T, 'r1', 'g1');
ok('the holes worth asking about, latest first', asks.map(a => a.h + 1), [11, 9, 7, 5, 3]);
ok('and why', asks.map(a => a.why), ['marked', 'nominated', 'good', 'nominated', 'trouble']);
ok('a plain par is not asked about', asks.some(a => a.h === 0), false);
ok('a double is called a double', E.scoreName(6, 4), 'a double');
T.notes['r1__g1'] = { ...blankNote('r1', 'g1'), marks: { 2: ['robbed'], 10: ['club'] }, text: { 2: 'Tree. Then another tree.' } };
ok('an answered hole is not asked again', E.feelAsks(T, 'r1', 'g1').map(a => a.h + 1), [9, 7, 5]);
const t = E.feelTally(T, 'r1', 'g1');
ok('the tally counts what was kept', [t.played, t.marked, t.counts.map(m => m.key + ':' + m.holes.join(','))], [18, 2, ['robbed:3', 'club:11']]);
ok('and keeps the last word', t.last && t.last.text, 'Tree. Then another tree.');
const d = blankCard(); for (let h = 0; h < 18; h++) d.raw[h] = holes[h].par; d.raw[2] = holes[2].par + 3;
T.scores['r1__g2'] = d; T.notes['r1__g2'] = { ...blankNote('r1', 'g2'), marks: { 2: ['robbed'] } };
const input = E.recapInput(T, 'r1', E.nowLocal());
ok('the writer is told what the golfers said, hole by hole', /WHAT THE GOLFERS SAID ABOUT THEIR OWN ROUNDS/.test(input), true);
ok('with the score beside the feeling', /hole 3, a double \(\d on a par \d\): Robbed — "Tree\. Then another tree\."/.test(input), true);
ok('and which hole robbed the field', /"Robbed" most on hole 3: Norberto III, Norberto Jr\./.test(input), true);
ok('and the ref\'s marks, as a floor', /MARKS, PUT IN BY THE REF/.test(input) && /Water ×1 \(hole 11\)/.test(input), true);

/* ---- the phone ---- */
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/feel.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const REPLY = JSON.stringify({ headline: 'The third robbed everyone', narrative: ['One.', 'Two.', 'Three.'],
  swing: { value: '2 shots', caption: 'on the third' }, pairNotes: {}, honours: [] });
const MOCK = (reply) => {
  window.__asks = 0; window.__prompts = [];
  const sample = async (prompt, opts) => { window.__asks++; window.__prompts.push(String(prompt));
    await new Promise(r => setTimeout(r, 200)); if (opts && opts.onText) opts.onText({ text: reply }); return { text: reply, truncated: false }; };
  window.claude = { use: async n => (n === 'sample' ? sample : null) };
  try { localStorage.setItem('union-invitational:me', 'g1'); } catch (e) {}
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(MOCK, REPLY);
const shut = async () => { for (let i = 0; i < 6; i++) {
  const alt = p.locator('.scrim [data-act="confirmAlt"]'), m = p.locator('.scrim [data-act="modalCancel"]');
  if (await alt.count()) { await alt.first().click({ force: true }); }
  else if (await m.count()) { await m.first().click({ force: true }); } else return;
  await p.waitForTimeout(200); } };
const goTab = async t => { await shut();
  const direct = p.locator('.tab:visible, .navbtn:visible', { hasText: t });
  if (await direct.count()) { await direct.first().click(); }
  else { await p.locator('[data-act="manageOpen"]').first().click(); await p.waitForTimeout(400);
    await p.locator('.mg-row', { hasText: t }).first().click(); }
  await p.waitForTimeout(650); await shut(); };
const pickRound = async () => { await shut();
  const card = p.locator('.rcard:not(.practice)').first();
  if (await card.isVisible().catch(() => false)) { await card.click(); return; }
  await p.locator('.setline').first().click(); await p.waitForTimeout(400);
  await p.locator('.scrim .sh-row', { hasText: /Round 1/ }).first().click({ force: true }); await p.waitForTimeout(300); };
const pickGroup = async i => { await shut();
  await p.locator('.setline').first().click(); await p.waitForTimeout(400);
  await p.locator('.scrim .shlist').nth(1).locator('.sh-row').nth(i).click({ force: true }); await p.waitForTimeout(300); };
/* score a hole for the group: from an empty cell a plus lands on par, so
   every golfer gets one, and the first gets `over` more */
const playHole = async (i, over) => { await shut();
  await p.locator('.hcell').nth(i).click(); await p.waitForTimeout(300); await shut();
  const plus = p.locator('.step.plus'); const n = await plus.count();
  for (let k = 0; k < n; k++) { const times = 1 + (k === 0 ? over : 0); for (let j = 0; j < times; j++) { await plus.nth(k).click(); await p.waitForTimeout(40); } }
  await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(500); };

await p.goto('file://' + S + '/feel.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(600); await shut();
await goTab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i = 0; i < rows; i++) { const bs = p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n = await bs.count(); if (n) { await bs.nth(i % n).click(); await p.waitForTimeout(60); } }
await shut();
await goTab('Scores'); await pickRound(); await p.waitForTimeout(500); await shut();
/* the nominated holes go late in the round, so the first three are plain */
for (const f of ['ctpHole', 'ldHole']) { const sel = p.locator('[data-act="setRoundField"][data-a="' + f + '"]').first();
  if (await sel.count()) { const n = await sel.locator('option').count(); await sel.selectOption({ index: n - 1 }); await p.waitForTimeout(300); await shut(); } }
if (await p.locator('[data-act="openRound"]').count()) { await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1000); await shut(); }
/* this phone belongs to the first golfer of the first group */
const first = await p.evaluate(() => { const g = document.querySelector('.hstrip'); return !!g; });
ok('the card is open to score', first, true);
await pickGroup(0);
/* whoever is first on the sheet is "me" */
const pid = await p.evaluate(() => { const el = document.querySelector('.step.plus'); return el ? (el.dataset.a || el.closest('[data-pid]')?.dataset.pid || null) : null; });
await p.evaluate(id => { localStorage.setItem('union-invitational:me', id); window.__UI.me = id; window.__forceRender(); }, pid);
await p.waitForTimeout(300);

console.log('\nthe question');
await playHole(0, 0); await shut();
ok('a par asks nothing', await p.locator('.feelbar').count(), 0);
await playHole(1, 2); await shut(); await p.waitForTimeout(300);
ok('a double is asked about', await p.locator('.feelbar').count(), 1);
await p.screenshot({ path: S + '/feel-bar.png' });
ok('by name', (await p.locator('.feelbar .fb-n').innerText()).trim(), '2');
ok('with the score', /a double on a par/i.test(await p.locator('.feelbar .fb-w span').innerText()), true);
ok('and the four marks of their own', await p.locator('.feelbar .fb-chip').count(), 4);
await p.locator('.feelbar .fb-chip').first().click(); await p.waitForTimeout(350);
ok('one tap puts the mark on', await p.locator('.feelbar .fb-chip.on').count(), 1);
await p.locator('#feelText').fill('Tree. Then another tree.'); await p.screenshot({ path: S + '/feel-bar-on.png' }); await p.locator('#feelText').fill('');
ok('and the bar stays for a word', await p.locator('.feelbar').count(), 1);
await p.locator('#feelText').fill('Tree. Then another tree.'); await p.waitForTimeout(100);
await p.locator('[data-act="feelDone"]').click(); await p.waitForTimeout(400);
ok('Done takes it away', await p.locator('.feelbar').count(), 0);
const kept = await p.evaluate(id => { const n = (window.__T.notes || {})['r1__' + id]; return n ? [n.marks[1], n.text[1]] : null; }, pid);
ok('the mark and the word are in their notes', kept, [['robbed'], 'Tree. Then another tree.']);
await playHole(2, 2); await shut(); await p.waitForTimeout(300);
ok('the next double is asked about', (await p.locator('.feelbar .fb-n').innerText()).trim(), '3');
await p.locator('[data-act="feelSkip"]').click(); await p.waitForTimeout(300);
ok('Skip puts it away', await p.locator('.feelbar').count(), 0);
await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(200);
ok('and it does not come back', await p.locator('.feelbar').count(), 0);

console.log('\nthe strip on My Round');
await shut();
await p.locator('[role="tab"]:has-text("My round")').first().click(); await p.waitForTimeout(500); await shut();
await p.screenshot({ path: S + '/feel-strip.png' });
ok('My Round counts what was kept', /Marked 1 of 3 played/i.test(await p.locator('.feelstrip').innerText().catch(() => '')), true);
ok('with the mark', /1\s*Robbed/i.test(await p.locator('.feelstrip').innerText()), true);
ok('and the word', /Tree\. Then another tree\./.test(await p.locator('.feelstrip').innerText()), true);

console.log('\nthe report, unasked and shared');
await p.locator('[role="tab"]:has-text("Score the group")').first().click().catch(() => {}); await p.waitForTimeout(400); await shut();
const groups = await p.evaluate(() => document.querySelectorAll('.gchip').length) || 3;
for (let g = 0; g < groups; g++) {
  await pickGroup(g); await p.waitForTimeout(300); await shut();
  const from = g === 0 ? 3 : 0;
  for (let i = from; i < 18; i++) await playHole(i, 0);
  await shut(); await p.waitForTimeout(g === groups - 1 ? 2000 : 600);
}
ok('the last card in writes the report', await p.evaluate(() => window.__asks), 1);
const rec = await p.evaluate(() => window.__T.recaps.r1);
ok('and it is published to the group without a press', rec && rec.status, 'published');
ok('with no claim left on it', rec && rec.claim, undefined);
ok('the writer was told how the holes felt', /Robbed — "Tree\. Then another tree\."/.test(await p.evaluate(() => window.__prompts[0])), true);
ok('the question stops once the day is written', await p.locator('.feelbar').count(), 0);
await p.waitForTimeout(1500);
ok('and nothing pays for a second one', await p.evaluate(() => window.__asks), 1);

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
