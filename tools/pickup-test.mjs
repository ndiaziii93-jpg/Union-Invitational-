/* HOLED OUT, OR PICKED UP. From Round 2 a triple — the cap — asks the scorer
   which it was, every time, before the pad moves on. Picked up marks the hole
   on the card and scores nothing in the team game; holed out clears it. Round
   1 was played before the rule and never asks.
   Run: node tools/pickup-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/pickup.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.clock.install({ time: new Date('2026-10-31T08:00:00Z') });
await p.goto('file://' + S + '/pickup.html'); await p.waitForTimeout(3500);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
await shut();
const H = 5;   // Olympos 6, par 4: the cap is 7
const go = rid => p.evaluate(([rid, H]) => { const T = window.__T; T.config.rounds[rid].state = 'open'; window.__UI.screen = 'entry'; window.__UI.entryRound = rid; window.__UI.entryHole = H; window.__UI.modal = null; window.__UI.draft = null; window.__forceRender(); }, [rid, H]);
const pid = async () => p.evaluate(() => document.querySelector('[data-act="padOpen"]').dataset.a);
const score = async (who, v) => { await p.locator(`[data-act="padOpen"][data-a="${who}"]`).first().click(); await p.waitForTimeout(250); await p.locator(`[data-act="setScore"][data-a="${who}"][data-b="${v}"]`).first().click(); await p.waitForTimeout(300); };
const save = async () => { await p.locator('[data-act="saveHole"]').first().click(); await p.waitForTimeout(500); for (let i = 0; i < 3; i++) { const c = p.locator('.scrim [data-act="confirmOk"], .scrim [data-act="pinOk"]'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(400); } } };
const card = (rid, who) => p.evaluate(([rid, who, H]) => { const c = window.__T.scores[rid + '__' + who] || {}; return { raw: (c.raw || [])[H], pu: !!(c.pu && c.pu[H]) }; }, [rid, who, H]);

console.log('\nRound 2: a triple asks');
await go('r2'); await p.waitForTimeout(600); await shut();
const who = await pid();
await score(who, 7);
ok('the sheet comes up and the pad waits', [await p.locator('.pumodal').count(), await p.evaluate(() => window.__UI.pad)], [1, null]);
ok('it names the hole and the score', (await p.locator('.pumodal .mbanner').innerText()).replace(/\s+/g, ' '), /^Triple bogey on the 6th/.test((await p.locator('.pumodal .mbanner').innerText())) ? (await p.locator('.pumodal .mbanner').innerText()).replace(/\s+/g, ' ') : 'Triple bogey on the 6th …');
await p.locator('.pumodal [data-act="pickupAns"][data-a="pu"]').click(); await p.waitForTimeout(300);
ok('Picked up closes it, and the pad too: the ref picks who is next', [await p.locator('.pumodal').count(), await p.evaluate(() => window.__UI.pad)], [0, null]);
ok('the next golfer without a score is lit up for them', await p.locator('.prow.nextup').count(), 1);
await save();
ok('the card holds the 7, marked picked up', await card('r2', who), { raw: 7, pu: true });

console.log('\nthe same hole, scored again: holed out');
await go('r2'); await p.waitForTimeout(500); await shut();
await score(who, 7);
await p.locator('.pumodal [data-act="pickupAns"][data-a="holed"]').click(); await p.waitForTimeout(300);
await save();
ok('Holed out clears the mark', await card('r2', who), { raw: 7, pu: false });

console.log('\nnot a triple');
await go('r2'); await p.waitForTimeout(500); await shut();
await score(who, 5);
ok('a 5 never asks', await p.locator('.pumodal').count(), 0);

console.log('\nRound 1, before the rule');
await go('r1'); await p.waitForTimeout(500); await shut();
await score(who, 7);
ok('a triple on Round 1 does not ask', await p.locator('.pumodal').count(), 0);
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
