/* RULINGS. A rules question asked at the ball, from the scorecard: the ⚖️
   button on a golfer's row opens a sheet that knows the round, the hole,
   the par, the cap and the golfer's mulligans; the answer comes back in its
   parts (verdict, Rule, options, the Union's rules, the card), offers the
   next step on the card, and is kept on the round, where a ref confirms it.
   Claude is played here by a stand-in that answers as the Rules Official
   and keeps what it was sent.
   Run: node tools/rulings-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
const page = pins => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8').replace('PINS_ENABLED = false', 'PINS_ENABLED = ' + pins) + '</body></html>';
writeFileSync(S + '/rulings.html', page(false));
writeFileSync(S + '/rulings-pins.html', page(true));

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const ANSWER = `VERDICT: One penalty stroke
RULE: 17.1d
OPTIONS:
- Replay from the tee: he'll be hitting 3.
- Back on the line: drop on a line from the hole through where it crossed the edge.
- Beside it (red only): within two club-lengths of where it crossed, no nearer the hole.
UNION: It's the front nine and Ray V hasn't used his front mulligan: he can take it instead, no penalty.
CARD: With the penalty, drop, chip on and two putts is a 5; the most he can score here is 6.`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(ans => {
  window.__asked = []; window.__answer = ans;
  const fn = async input => { window.__asked.push(input.map(m => m.content).join('\n')); await new Promise(r => setTimeout(r, 1200)); return { text: window.__answer }; };
  window.claude = { use: async name => name === 'sample' ? fn : null };
}, ANSWER);
const setAnswer = t => p.evaluate(t => { window.__answer = t; }, t);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const shot = async name => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(300); };

await p.goto('file://' + S + '/rulings.html'); await p.waitForTimeout(3500);
await shut();
await p.evaluate(() => { const T = window.__T; T.config.rounds.r2.state = 'open'; T.config.rounds.r2.ctpHole = 6; T.config.rounds.r2.ldHole = 0;
  localStorage.setItem('union-invitational:whoami', 's4'); window.__UI.who = undefined;
  window.__UI.screen = 'entry'; window.__UI.entryRound = 'r2'; window.__UI.entryHole = 6; window.__forceRender(); });
await p.waitForTimeout(400); await shut();
/* to Ray V's group, whichever it is */
for (let i = 0; i < 6 && !(await p.locator('.rl-btn[data-a="g6"]').count()); i++) {
  await p.evaluate(i => { window.__UI.entryTee = String(i); window.__forceRender(); }, i); await p.waitForTimeout(200);
}
const rayGroup = await p.evaluate(() => window.__UI.entryTee);

console.log('\non the scorecard');
ok('every golfer on the hole has a ruling button', await p.locator('.prow .rl-btn').count() > 0 && await p.locator('.prow .rl-btn').count() === await p.locator('.prow').count(), true);
await tap('.rl-btn[data-a="g6"]');
ok('it opens knowing who, which hole and what they have left', (await p.locator('.rlsheet .mbanner').innerText()).replace(/\s+/g, ' ').trim(), '⚖️ Ray V · Hole 7 ROUND 2 · PAR 5 · FRONT MULLIGAN LEFT');
await tap('.rl-chips button[data-a="water"]');
ok('picking what happened starts the question', await p.locator('#rulingQ').inputValue(), 'Ray V’s ball went in the water. What are the options?');
await tap('[data-act="ruleAsk"]');
ok('it says it is checking while it asks', (await p.locator('.rl-think').innerText()).trim(), 'Checking the Rules and Ray V’s card…');
await p.waitForTimeout(1500);

console.log('\nthe answer');
ok('the ruling in one line, with its Rule', await p.locator('.rlsheet .rl-v').evaluate(e => [e.firstChild.textContent.trim(), e.querySelector('em').textContent]), ['One penalty stroke', 'RULE 17.1d']);
ok('the options in order', (await p.locator('.rlsheet .rl-ab ol li').allInnerTexts()).map(t => t.slice(0, 12)), ['Replay from ', 'Back on the ', 'Beside it (r']);
ok('what the Union’s rules change', /front mulligan/.test(await p.locator('.rlsheet .rl-house').innerText()), true);
ok('and what goes on the card', /is a 5/.test(await p.locator('.rlsheet .rl-card').innerText()), true);
ok('always: guidance, the refs decide', await p.locator('.rlsheet .rl-fine').innerText(), 'Guidance from the Rules of Golf. The refs and the commissioner make the call.');
await shot('ruling-answer');
const sent = await p.evaluate(() => window.__asked[0]);
ok('Claude was sent the Rules to follow and the shape to answer in', [/Rules of Golf in force/.test(sent), /VERDICT:/.test(sent), /E-5/.test(sent)], [true, true, true]);
ok('the Union’s house rules', [/Triple bogey maximum/.test(sent), /Breakfast ball/.test(sent), /one per nine/.test(sent)], [true, true, true]);
ok('and the situation: hole, par, cap, player, mulligans', [/Hole 7, par 5, stroke index \d+\. The most anyone can score here is 8/.test(sent), /Player: Ray V/.test(sent),
  /front-nine one is unused/.test(sent), /front nine/.test(sent), /Ball in the water/.test(sent), /Ray V’s ball went in the water/.test(sent)], [true, true, true, true, true, true]);

console.log('\nthe next step on the card');
await tap('[data-act="ruleMull"]');
ok('use his front mulligan: spent on his card', await p.evaluate(() => !!window.__T.scores['r2__g6'].mF), true);
ok('and the button goes', await p.locator('[data-act="ruleMull"]').count(), 0);
await tap('[data-act="ruleMark"]');
ok('mark the water on the hole', await p.evaluate(() => window.__T.scores['r2__g6'].marks[6]), ['water']);
const kept = await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'r').map(r => [r.rid, r.hole, r.pid, r.sit, r.byName]));
ok('the ruling is kept with the round', kept, [['r2', 6, 'g6', 'water', 'Drea']]);
ok('and stays out of the chat', await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'm').length), 0);
await shut();

console.log('\nthe round’s rulings');
ok('listed under the scorecard, waiting for a ref', (await p.locator('.rl-log .rl-row').first().innerText()).replace(/\s+/g, ' ').trim().replace(/\d+:\d+[ap]m/, 'T'),
  'Hole 7 · Ray V · T asked by Drea One penalty stroke Waiting for a ref');
await tap('.rl-log .rl-row');
await tap('[data-act="ruleOk"]');
ok('a ref confirms it', (await p.locator('.rl-log .rl-ok').first().innerText()).trim(), '✓ Confirmed · Drea');
await shot('ruling-log');
const other = await p.locator('.rl-btn').evaluateAll(bs => bs.map(x => x.dataset.a).find(x => x !== 'g6'));
await tap(`.rl-btn[data-a="${other}"]`);
ok('the next golfer asking on the same hole sees it first', (await p.locator('.rl-prev').innerText()).replace(/\s+/g, ' ').trim(), 'Ray V · One penalty stroke ✓ Drea');
await tap('.rl-chips button[data-a="path"]');
await setAnswer('VERDICT: Free relief, no penalty\nRULE: 16.1b\nOPTIONS:\n- Find the nearest point of complete relief and drop within one club-length.\nUNION: Nothing changes.\nCARD: No penalty: count the strokes as played.');
await tap('[data-act="ruleAsk"]'); await p.waitForTimeout(1500);
const sent2 = await p.evaluate(() => window.__asked[1]);
ok('and Claude is told what was ruled there before', /Rulings already given on this hole today.*One penalty stroke/.test(sent2), true);
ok('“Nothing changes” leaves the Union box out', await p.locator('.rlsheet .rl-house').count(), 0);
ok('no water to mark on a cart-path question', await p.locator('[data-act="ruleMark"]').count(), 0);
await setAnswer('VERDICT: Not a rules question.');
await p.locator('#rulingQ').fill('Who is buying dinner?'); await tap('[data-act="ruleAsk"]'); await p.waitForTimeout(1500);
ok('a question that isn’t about the rules is turned away, not kept', [await p.locator('.rlsheet .xm-err').innerText(), await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'r').length)],
  ['That isn’t a rules question. Ask about what happened to the ball.', 2]);
await shut();

console.log('\nwith the PINs on, as on the real app');
await p.goto('file://' + S + '/rulings-pins.html'); await p.waitForTimeout(3500); await shut();
await p.evaluate(() => { const T = window.__T; T.config.rounds.r2.state = 'open'; T.config.rounds.r2.ctpHole = 6; T.config.rounds.r2.ldHole = 0;
  T.chat.guest_xd1 = { id: 'guest_xd1', k: 'g', pid: 'xd1', name: 'Uncle Bob', at: Date.now(), dev: 'd1' };
  localStorage.setItem('union-invitational:whoami', 'xd1'); window.__UI.who = undefined; window.__UI.role = 'viewer';
  window.__UI.screen = 'entry'; window.__UI.entryRound = 'r2'; window.__UI.entryHole = 6; window.__forceRender(); });
await p.waitForTimeout(400); await shut();
ok('the bleachers can’t ask', await p.locator('.rl-btn').count(), 0);
await p.evaluate(() => { localStorage.setItem('union-invitational:whoami', 'g6'); window.__UI.who = undefined; window.__forceRender(); });
await p.waitForTimeout(300); await shut();
ok('a player on the trip can', await p.locator('.rl-btn').count() > 0, true);

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
