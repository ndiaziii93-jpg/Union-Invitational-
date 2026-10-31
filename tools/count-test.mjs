/* COUNT MODE. A ref who is playing counts each golfer's shots on four big
   tiles: a tap is a shot, ↺ takes one back, In the hole puts the count into
   the hole's unsaved scores as the keypad would, and Save hole carries it
   to the card. The counts are kept on the phone, so a reload mid-hole
   loses nothing, and a triple still asks whether it was a pick-up.
   Run: node tools/count-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/count.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.clock.install({ time: new Date('2026-10-31T08:00:00Z') });
await p.goto('file://' + S + '/count.html'); await p.waitForTimeout(3500);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
await shut();
const H = 5;   // Olympos 6, par 4: the cap is 7
const go = () => p.evaluate(H => { const T = window.__T; T.config.rounds.r2.state = 'open'; Object.assign(window.__UI, { screen: 'entry', entryRound: 'r2', entryHole: H, modal: null, draft: null }); window.__forceRender(); }, H);
const card = who => p.evaluate(([who, H]) => { const c = window.__T.scores['r2__' + who] || {}; return { raw: (c.raw || [])[H], pu: !!(c.pu && c.pu[H]) }; }, [who, H]);
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(150); };
const save = async () => { await tap('.cfoot[data-act="saveHole"]'); await p.waitForTimeout(400); for (let i = 0; i < 3; i++) { const c = p.locator('.scrim [data-act="confirmOk"], .scrim [data-act="pinOk"]'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(400); } } await shut(); };

await go(); await p.waitForTimeout(600); await shut();
ok('the ref has a Scores | Count shots switch', await p.locator('.cmode button').allInnerTexts(), ['Scores', 'Count shots']);
await tap('.cmode [data-a="on"]');
const ids = await p.locator('.ctile').evaluateAll(es => es.map(e => e.dataset.a));
ok('count mode is a big tile a golfer, in place of the rows', [ids.length > 1, await p.locator('.prow').count()], [true, 0]);
const [a, c] = ids;
const n = who => p.locator(`.ctile:has([data-a="${who}"]) .big`).innerText();
for (let i = 0; i < 5; i++) await tap(`.ctile[data-a="${a}"] .big`);
await tap(`.ctile[data-a="${c}"] .tn`);
ok('a tap anywhere on a tile is a shot', [await n(a), await n(c)], ['5', '1']);
await tap(`[data-act="cntUndo"][data-a="${a}"]`);
ok('↺ takes one back', await n(a), '4');
ok('nothing is a score until In the hole', await p.evaluate(() => !!(window.__UI.draft && Object.keys(window.__UI.draft.strokes).length)), false);

console.log('\na reload in the middle of the hole');
await p.reload(); await p.waitForTimeout(3500); await shut(); await go(); await p.waitForTimeout(500); await shut();
ok('count mode and the counts are still there', [await p.locator('.cmode button.on').innerText(), await n(a), await n(c)], ['Count shots', '4', '1']);

console.log('\nholing out');
await tap(`[data-act="cntIn"][data-a="${a}"]`);
ok('In the hole puts the count into the hole, unsaved', [await p.locator(`.ctile.in:has([data-a="${a}"])`).count(), await p.evaluate(a => window.__UI.draft.strokes[a], a)], [1, 4]);
await tap(`.ctile.in:has([data-a="${a}"]) .big`);
ok('a holed tile takes no more taps', await n(a), '4');
for (let i = 0; i < 9; i++) await tap(`.ctile[data-a="${c}"] .big`);
ok('a count stops at the cap', await n(c), '7');
await tap(`[data-act="cntIn"][data-a="${c}"]`);
ok('a triple asks, as the keypad does', await p.locator('.pumodal').count(), 1);
await tap('.pumodal [data-act="pickupAns"][data-a="pu"]');
ok('and says Picked up', (await p.locator(`.ctile.in:has([data-a="${c}"]) .cin`).innerText()).trim(), '✓ Picked up · 7');
const rest = ids.slice(2);
ok('Save waits until everyone is in', [await p.locator('.cfoot[disabled]').count(), (await p.locator('.cfoot').innerText()).trim()], [1, '2 of ' + ids.length + ' in the hole']);
for (const w of rest) { for (let i = 0; i < 4; i++) await tap(`.ctile[data-a="${w}"] .big`); await tap(`[data-act="cntIn"][data-a="${w}"]`); }
ok('then it is Save hole 6', (await p.locator('.cfoot').innerText()).trim(), 'Save hole 6');
await save();
ok('the card holds the counts, the pick-up marked', [await card(a), await card(c)], [{ raw: 4, pu: false }, { raw: 7, pu: true }]);
ok('the counts on the phone are spent', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('union-invitational:count') || '{}'))), []);

console.log('\na saved hole, recounted');
await go(); await p.waitForTimeout(400);
ok('back on the 6th, everyone shows holed from the card', [await p.locator('.ctile.in').count(), (await p.locator('.cfoot').innerText()).trim()], [ids.length, 'Hole 6 is on the card']);
await tap(`[data-act="cntUndo"][data-a="${a}"]`);
ok('↺ on a holed golfer goes back to counting from their score', [await p.locator(`.ctile.in:has([data-a="${a}"])`).count(), await n(a)], [0, '4']);
await tap(`.ctile[data-a="${a}"] .big`); await tap(`[data-act="cntIn"][data-a="${a}"]`);
await save();
ok('and the corrected score saves', await card(a), { raw: 5, pu: false });

console.log('\nScores mode is the keypad, as before');
await tap('.cmode [data-a="off"]');
ok('the rows come back', [await p.locator('.prow').count() > 1, await p.locator('.ctile').count()], [true, 0]);
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
