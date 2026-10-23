/* CHAT AND BETS. The gallery's side of the week, on Boards.
   Chat: one room per round and one for the trip; the book posts birdies,
   balls in the water and the turn by itself, and people react and heckle.
   Bets: Kalshi's exchange in beers — yes/no markets priced 1–99¢ that pay a
   whole beer, a ticket that buys and sells, limit orders, a portfolio, the
   book's own markets that settle from the scores, and anyone's own bet.
   Run: node tools/social-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
writeFileSync(S + '/social.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
let shotN = 0;
const shot = async name => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: `${SHOTS}/${String(++shotN).padStart(2, '0')}-${name}.png`, fullPage: true }); } };
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(300); };

await p.goto('file://' + S + '/social.html'); await p.waitForTimeout(3500);
await shut();
/* a round under way: Round 1 open, Robby B birdies the 3rd, Ray V in the water on the 7th, Group 1 at the turn */
await p.evaluate(() => {
  const T = window.__T, t0 = Date.now() - 50 * 60000;
  T.config.rounds.r1.state = 'open';
  const card = (raw, marks = {}) => ({ raw: raw.concat(Array(18 - raw.length).fill(null)), by: Object.fromEntries(raw.map((_, i) => [i, 's1'])),
    at: Object.fromEntries(raw.map((_, i) => [i, t0 + i * 600000])), marks, mF: false, mB: false, bb: false });
  T.scores['r1__g7'] = card([4, 3, 5, 2, 5, 4, 5, 3, 4]);
  T.scores['r1__g6'] = card([5, 4, 6, 4, 6, 5, 6, 4, 5], { 6: ['water'] });
  T.config.rounds.r1.turn = { g0: { at: t0 + 9 * 600000 } };
  window.__UI.chatRoom = 'r1';
  window.__forceRender();
});
await p.waitForTimeout(400); await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500); await shut();

console.log('\nchat');
await tap('.btab[data-a="chat"]');
ok('Chat is a tab on Boards', await p.locator('.btab[data-a="chat"].on').count(), 1);
ok('a room for each round and one for the trip', await p.locator('.ch-rooms button').count(), 5);
ok('the score is pinned at the top', await p.locator('.ch-plate').count(), 1);
const evs = await p.locator('.ch-ev .ch-evw b').allInnerTexts();
ok('the book posted the birdie, the water and the turn by itself, newest first',
  evs, ['Group 1 makes the turn', 'Ray V found the water on the 7th', 'Robby B birdies the 4th']);
ok('before a name is chosen, it asks', await p.locator('.ch-post [data-act="whoOpen"].btn').count(), 1);
await tap('.ch-post [data-act="whoOpen"]');
ok('anyone on the trip can be chosen, gallery included', await p.locator('.who-c button').count(), 23);
await shot('who');
await tap('.who-c button:has-text("Jennifer D")');
ok('and the phone remembers it', await p.evaluate(() => localStorage.getItem('union-invitational:who')), 's1');
await p.locator('#chatText').fill('Come on Group 2!'); await p.locator('#chatText').press('Enter'); await p.waitForTimeout(400);
ok('a message goes up, at the top', await p.locator('.ch-feed > .ch-msg .ch-bub p').first().innerText(), 'Come on Group 2!');
await p.locator('.ch-ev:has-text("water") [data-act="chatHeckle"]').click(); await p.waitForTimeout(400);
ok('heckling a moment says which one', await p.locator('.ch-re b').innerText(), 'Ray V found the water on the 7th');
await p.locator('#chatText').fill('Bring goggles tomorrow'); await p.locator('[data-act="chatSend"]').click(); await p.waitForTimeout(400);
ok('the heckle sits under that moment', await p.locator('.ch-ev:has-text("water") .ch-hks p').allInnerTexts(), ['Bring goggles tomorrow']);
await p.locator('.ch-ev:has-text("birdies") .ch-rx button').first().click(); await p.waitForTimeout(300);
ok('a reaction on the birdie counts', (await p.locator('.ch-ev:has-text("birdies") .ch-rx button.on').innerText()).replace(/\s+/g, ''), '🔥1');
await p.locator('.ch-ev:has-text("birdies") .ch-rx button').nth(1).click(); await p.waitForTimeout(300);
ok('one reaction a phone: a second swaps it', await p.locator('.ch-ev:has-text("birdies") .ch-rx button.on').count(), 1);
const stored = await p.evaluate(() => Object.values(window.__T.chat).map(r => r.k || 'x').sort());
ok('two messages and one reaction document in the book', stored, ['m', 'm', 'x']);
await shot('chat-round');
await tap('.ch-rooms button[data-a="trip"]');
ok('the trip room has no score and none of the round', [await p.locator('.ch-plate').count(), await p.locator('.ch-ev').count()], [0, 0]);
await p.locator('#chatText').fill('Pool at 4?'); await p.locator('#chatText').press('Enter'); await p.waitForTimeout(300);
ok('it keeps its own messages', await p.locator('.ch-feed .ch-msg').count(), 1);
await tap('.ch-feed .ch-rm');
ok('your own message can be removed', await p.locator('.ch-feed .ch-msg').count(), 0);

console.log('\nbets: the list');
await tap('.btab[data-a="bets"]');
ok('Bets is a tab on Boards', await p.locator('.btab[data-a="bets"].on').count(), 1);
ok('the balance is ten beers on day one', (await p.locator('.xm-bal').innerText()).trim(), '🍺 10 · Portfolio');
const qs = await p.locator('.xm-c .xm-ct b').allInnerTexts();
ok('the book opens with its own markets', ['Who wins MVP?', 'Who wins the Team Competition?', 'Will the United Kingdom win the Ryder Cup?',
  'Will anyone make a hole in one this week?'].every(q => qs.includes(q)), true);
ok('the hole in one opens at 6¢', (await p.locator('.xm-c:has-text("hole in one") .xm-yn .y').innerText()).trim(), 'Yes 6¢');
await shot('bets-list');

console.log('\nbets: a market');
await p.locator('.xm-c:has-text("Ryder Cup") .xm-yn .y').click(); await p.waitForTimeout(400);
ok('it opens with the chance, a ticket and the rules', [await p.locator('.xm-big strong').innerText(), await p.locator('.xm-tk .xm-go').count(), await p.locator('.xm-rules').count()], ['50%', 1, 1]);
await p.locator('[data-act="xT"][data-a="k"][data-b="1"]').click(); await p.locator('[data-act="xT"][data-a="k"][data-b="1"]').click();
await p.locator('[data-act="xT"][data-a="k"][data-b="1"]').click(); await p.locator('[data-act="xT"][data-a="k"][data-b="1"]').click(); await p.waitForTimeout(200);
ok('five Yes at even money cost 2.81 beers and pay 5', [await p.locator('.xm-kv:has-text("Cost") b').innerText(), await p.locator('.xm-kv:has-text("Pays") b').innerText()], ['2.81 🍺', '5 🍺']);
await shot('market-ticket');
await tap('[data-act="xSubmit"]');
ok('buying moves the price up', await p.locator('.xm-big strong').innerText(), '62%');
ok('and the position shows', /You hold 5 Yes/.test(await p.locator('.xm-mine').innerText()), true);
ok('and it is a trade in the book', await p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 't').map(t => [t.side, t.n, t.px])), [['yes', 5, 56]]);
await p.locator('[data-act="xT"][data-a="act"][data-b="sell"]').click(); await p.waitForTimeout(200);
ok('sell offers what you hold', await p.locator('.xm-stp b').innerText(), '5');
await p.locator('[data-act="xT"][data-a="k"][data-b="-1"]').click(); await p.locator('[data-act="xT"][data-a="k"][data-b="-1"]').click(); await p.waitForTimeout(200);
await tap('[data-act="xSubmit"]');
ok('selling three before it settles', /You hold 2 Yes/.test(await p.locator('.xm-mine').innerText()), true);
await p.locator('[data-act="xT"][data-a="act"][data-b="buy"]').click();
await p.locator('[data-act="xT"][data-a="side"][data-b="no"]').click();
await p.locator('[data-act="xT"][data-a="type"][data-b="limit"]').click();
for (let i = 0; i < 10; i++) await p.locator('[data-act="xT"][data-a="lim"][data-b="-1"]').click();
await p.waitForTimeout(200);
await tap('[data-act="xSubmit"]');
ok('a limit order below the market waits in the order book', await p.locator('.xm-ob .n .lvl').count(), 1);
await shot('market-after');

console.log('\nbets: make your own');
await tap('.xm-back');
await tap('.xm-new');
await p.locator('#xQ').fill('Will Ray V wear the pink trousers on Sunday');
await p.locator('#xRules').fill('Yes if he is wearing them on the first tee.');
await tap('[data-act="xN"][data-a="p0"][data-b="25"]');
await shot('new-bet');
await tap('[data-act="xCreate"]');
ok('it opens straight away, a question mark added', await p.locator('.xm-h').innerText(), 'Will Ray V wear the pink trousers on Sunday?');
ok('at the chance it was given', await p.locator('.xm-big strong').innerText(), '25%');
ok('and says who settles it', /Settled by Jennifer D or the commissioner/.test(await p.locator('.xm-rules').innerText()), true);
await tap('[data-act="xSubmit"]');
await tap('[data-act="xSettle"][data-b="yes"]');
ok('settling asks first', await p.locator('.scrim [data-act="confirmOk"]').count(), 1);
await tap('.scrim [data-act="confirmOk"]');
ok('then it is settled, by name', (await p.locator('.xm-done').innerText()).replace(/\s+/g, ' ').trim().startsWith('Settled Yes by Jennifer D'), true);
await tap('.xm-back');
ok('a settled bet leaves the main list', (await p.locator('.xm-c .xm-ct b').allInnerTexts()).includes('Will Ray V wear the pink trousers on Sunday?'), false);
await tap('[data-act="xCat"][data-a="ours"]');
ok('Made by us shows only open ones of ours', await p.locator('.xm-c').count(), 0);
await tap('[data-act="xCat"][data-a="done"]');
ok('Settled shows it, beside the par-3 market the book settled itself off Robby B’s birdie on the 4th',
  (await p.locator('.xm-c .xm-ct b').allInnerTexts()).sort(), ['Round 1: will anyone birdie a par 3?', 'Will Ray V wear the pink trousers on Sunday?']);

console.log('\nbets: the portfolio');
await tap('.xm-bal');
const acct = await p.evaluate(() => ({ t: Object.values(window.__T.market).filter(r => r.k === 't').length }));
ok('three trades made', acct.t, 3);
ok('it shows the open Ryder Cup bet and the settled pink trousers', [await p.locator('.xm-pos .xm-p').count(), await p.locator('.xm-tk .xm-res.yes').count()], [1, 1]);
ok('and the order still waiting', await p.locator('[data-act="xCancel"]').count(), 1);
await shot('portfolio');
await tap('[data-act="xCancel"]');
ok('which can be cancelled', await p.locator('[data-act="xCancel"]').count(), 0);

console.log('\nthe book settles its own');
await p.evaluate(() => { const T = window.__T; T.scores['r1__g8'] = { raw: [4, 4, 1].concat(Array(15).fill(null)), by: { 0: 's1', 1: 's1', 2: 's1' }, at: { 0: Date.now(), 1: Date.now(), 2: Date.now() }, marks: {}, mF: false, mB: false, bb: false }; window.__forceRender(); });
await tap('.xm-back');
await tap('[data-act="xCat"][data-a="done"]');
ok('a hole in one settles that market Yes at once', await p.locator('.xm-c:has-text("hole in one") .xm-res').innerText(), 'Settled Yes');
await tap('.btab[data-a="chat"]'); await tap('.ch-rooms button[data-a="r1"]');
ok('and the chat says so', (await p.locator('.ch-ev .ch-evw b').allInnerTexts()).some(t => /HOLE IN ONE/.test(t)), true);

console.log('\nthe front page of Boards');
await tap('.btab[data-a="home"]');
ok('Chat and Bets each have a door under the games', await p.locator('.soc-c').count(), 2);
ok('the chat door shows the last thing said', /Bring goggles tomorrow/.test(await p.locator('.soc-c[data-a="chat"]').innerText()), true);
ok('the bets door shows the busiest market', /Ryder Cup/.test(await p.locator('.soc-c[data-a="bets"]').innerText()), true);
await shot('boards-home');

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
