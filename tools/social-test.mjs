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

/* the phone's clock on the first day of the trip, whenever this runs: one day's beers */
await p.clock.install({ time: new Date('2026-10-26T06:00:00Z') });
await p.goto('file://' + S + '/social.html'); await p.waitForTimeout(3500);
await shut();
/* a round under way: Round 1 open, Robby B birdies the 3rd, Ray V in the water on the 7th, Group 1 at the turn */
await p.evaluate(() => {
  const T = window.__T, t0 = Date.now() - 120 * 60000;
  T.config.rounds.r1.state = 'open';
  const card = (raw, marks = {}) => ({ raw: raw.concat(Array(18 - raw.length).fill(null)), by: Object.fromEntries(raw.map((_, i) => [i, 's1'])),
    at: Object.fromEntries(raw.map((_, i) => [i, t0 + i * 600000])), marks, mF: false, mB: false, bb: false });
  /* Aspendos: par 4 4 3 4 5 4 3 4 5 — Robby level par but for a 2 on the par-3 third; Ray a bogey a hole */
  T.scores['r1__g7'] = card([4, 4, 2, 4, 5, 4, 3, 4, 5]);
  T.scores['r1__g6'] = card([5, 5, 4, 5, 6, 5, 4, 5, 6], { 6: ['water'] });
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
  evs, ['Group 1 makes the turn', 'Ray V found the water on the 7th', 'Robby B birdies the 3rd']);
ok('before a name is chosen, it asks', await p.locator('.ch-post [data-act="whoOpen"].btn').count(), 1);
await tap('.ch-post [data-act="whoOpen"]');
ok('anyone on the trip can be chosen, gallery included', await p.locator('.who-c button').count(), 23);
await shot('who');
ok('and anyone not on the trip can get a guest pass', await p.locator('#guestName').count(), 1);
await tap('.who-c button:has-text("Jennifer D")');
ok('a name from the trip asks for a PIN to be made, the first time', await p.locator('.whomodal #whoPinB').count(), 1);
await p.locator('#whoPinA').fill('4826'); await p.locator('#whoPinB').fill('4862'); await tap('[data-act="whoPinGo"]');
ok('two that do not match are refused', /don’t match/.test(await p.locator('.whomodal .xm-err').innerText()), true);
await p.locator('#whoPinB').fill('4826'); await tap('[data-act="whoPinGo"]');
ok('and the phone remembers who it is', await p.evaluate(() => localStorage.getItem('union-invitational:whoami')), 's1');
ok('the PIN is kept for the commissioner to look up', await p.evaluate(() => window.__T.chat.id_s1 && window.__T.chat.id_s1.pin), '4826');
await p.locator('#chatText').fill('Come on Group 2!'); await p.locator('#chatText').press('Enter'); await p.waitForTimeout(400);
ok('a message goes up, at the top', await p.locator('.ch-feed > .ch-msg .ch-bub p').first().innerText(), 'Come on Group 2!');
ok('marked as from the gallery: here, not playing', await p.locator('.ch-feed > .ch-msg').first().locator('.gtag.t-gallery').count(), 1);
await p.locator('.ch-ev:has-text("water") [data-act="chatHeckle"]').click(); await p.waitForTimeout(400);
ok('heckling a moment says which one', await p.locator('.ch-re b').innerText(), 'Ray V found the water on the 7th');
await p.locator('#chatText').fill('Bring goggles tomorrow'); await p.locator('[data-act="chatSend"]').click(); await p.waitForTimeout(400);
ok('the heckle sits under that moment', await p.locator('.ch-ev:has-text("water") .ch-hks p').allInnerTexts(), ['Bring goggles tomorrow']);
await p.locator('.ch-ev:has-text("birdies") .ch-rx button').first().click(); await p.waitForTimeout(300);
ok('a reaction on the birdie counts', (await p.locator('.ch-ev:has-text("birdies") .ch-rx button.on').innerText()).replace(/\s+/g, ''), '🔥1');
await p.locator('.ch-ev:has-text("birdies") .ch-rx button').nth(1).click(); await p.waitForTimeout(300);
ok('one reaction a phone: a second swaps it', await p.locator('.ch-ev:has-text("birdies") .ch-rx button.on').count(), 1);
const stored = await p.evaluate(() => Object.values(window.__T.chat).map(r => r.k || 'x').sort());
ok('two messages, one reaction and her PIN in the book', stored, ['id', 'm', 'm', 'x']);

console.log('\ncalling someone out');
await p.locator('#chatText').click(); await p.keyboard.type('Big day @ra'); await p.waitForTimeout(150);
ok('typing @ and a few letters offers the names', await p.locator('#chatAt button').allInnerTexts(), ['@Ray V']);
await p.locator('#chatAt button').first().click(); await p.waitForTimeout(150);
ok('tapping one fills in the whole name, keyboard still up', [await p.locator('#chatText').inputValue(), await p.evaluate(() => document.activeElement && document.activeElement.id)], ['Big day @Ray V ', 'chatText']);
ok('and the names go away', await p.locator('#chatAt').isHidden(), true);
await p.keyboard.type('bring your A game'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok('the message keeps who it calls out', await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'm' && r.ment).map(r => r.ment)), [['g6']]);
ok('and shows the name picked out', await p.locator('.ch-feed > .ch-msg').first().locator('.ch-atn').innerText(), '@Ray V');
await p.locator('.ch-atb').click(); await p.waitForTimeout(150);
ok('the @ button starts a name and offers everyone', [await p.locator('#chatText').inputValue(), await p.locator('#chatAt button').count()], ['@', 8]);
await p.keyboard.type('norberto j'); await p.waitForTimeout(100);
ok('a second word narrows it', await p.locator('#chatAt button').allInnerTexts(), ['@Norberto Jr.']);
await p.locator('#chatText').fill(''); await p.evaluate(() => document.activeElement.blur());
await p.evaluate(() => { localStorage.setItem('union-invitational:whoami', 'g6'); window.__UI.who = undefined; window.__forceRender(); }); await p.waitForTimeout(300);
ok('Ray V sees it called out to him', [await p.locator('.ch-msg.ment').count(), await p.locator('.ch-msg.ment .ch-callout').textContent(), await p.locator('.ch-msg.ment .ch-atn.me').count()], [1, '📣 Calling you out', 1]);
await shot('called-out');
await p.evaluate(() => { localStorage.setItem('union-invitational:whoami', 's1'); window.__UI.who = undefined; window.__forceRender(); }); await p.waitForTimeout(300);
ok('nobody else sees it as theirs', await p.locator('.ch-msg.ment').count(), 0);

console.log('\nreplying to a message');
await p.evaluate(() => { window.__T.chat.mray = { id: 'mray', k: 'm', rid: 'r1', pid: 'g6', name: 'Ray V', text: 'Who is buying the first round tonight?', at: Date.now() - 90000, dev: 'dray', re: null }; window.__forceRender(); });
await p.waitForTimeout(300);
await tap('#cm-mray .ch-rp');
ok('Reply says who and what, above the box, and the box is ready', [(await p.locator('.ch-reply').innerText()).replace(/\s+/g, ' ').trim(), await p.evaluate(() => document.activeElement && document.activeElement.id)],
  ['↩ Replying to Ray V: “Who is buying the first round tonight?” ✕', 'chatText']);
await p.keyboard.type('Matt is, he lost the bet'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok('the reply keeps what it answers and whose it was', await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.to).map(r => [r.to, r.rto, r.toName, r.text])), [['mray', 'g6', 'Ray V', 'Matt is, he lost the bet']]);
ok('and the box is free again', await p.locator('.ch-reply').count(), 0);
const top = p.locator('.ch-feed > .ch-msg').first();
ok('it shows the line it answers, quoted above it', (await top.locator('.ch-q').innerText()).replace(/\s+/g, ' ').trim(), 'Ray V Who is buying the first round tonight?');
await shot('reply');
await top.locator('.ch-q').click(); await p.waitForTimeout(300);
ok('tapping the quote goes back to it, lit for a moment', await p.locator('#cm-mray.jumped').count(), 1);
await tap('#cm-mray .ch-rp'); await tap('.ch-reply button');
ok('a reply can be dropped before it is sent', await p.locator('.ch-reply').count(), 0);
await p.evaluate(() => { document.activeElement && document.activeElement.blur(); localStorage.setItem('union-invitational:whoami', 'g6'); window.__UI.who = undefined; window.__forceRender(); }); await p.waitForTimeout(300);
ok('Ray V sees it as a reply to him, beside the earlier call-out', await p.locator('.ch-msg.ment .ch-callout').allInnerTexts(), ['↩ REPLYING TO YOU', '📣 CALLING YOU OUT']);
await p.evaluate(() => { localStorage.setItem('union-invitational:whoami', 's1'); window.__UI.who = undefined; window.__forceRender(); }); await p.waitForTimeout(300);
await shot('chat-round');
await tap('.ch-rooms button[data-a="trip"]');
ok('the trip room has no score and none of the round', [await p.locator('.ch-plate').count(), await p.locator('.ch-ev').count()], [0, 0]);
await p.locator('#chatText').fill('Pool at 4?'); await p.locator('#chatText').press('Enter'); await p.waitForTimeout(300);
ok('it keeps its own messages', await p.locator('.ch-feed .ch-msg').count(), 1);
await tap('.ch-feed .ch-rm');
ok('your own message can be removed', await p.locator('.ch-feed .ch-msg').count(), 0);

console.log('\nBets has its own tab');
const navs = await p.locator('.tabbar .navbtn').evaluateAll(b => b.map(x => x.dataset.a));
ok('on the bar, between Scores and Boards', navs, ['today', 'entry', 'bets', 'boards', 'calendar', 'resort']);
ok('and no longer inside Boards', await p.locator('.btab[data-a="bets"]').count(), 0);
await tap('.navbtn[data-a="bets"]');
ok('it opens on the bets', await p.locator('.xm-top .head').innerText(), 'Bets');

console.log('\nall in beers');
ok('everyone starts on twenty beers', (await p.locator('.xm-bal').innerText()).trim(), '🍺 20 · My bets');
ok('tabs: the week, a tab a round, off the course, ours', await p.locator('.xm-tabs button').evaluateAll(b => b.map(x => x.dataset.a)), ['week', 'r1', 'r2', 'r3', 'off', 'ours', 'cashed']);
ok('it opens on the round being played, live', [await p.locator('.xm-tabs button.on').getAttribute('data-a'), await p.locator('.xm-plate b').innerText(), await p.locator('.xm-plate .k').textContent()], ['r1', 'Round 1 · Fri 30 Oct', '● Live now']);
await tap('[data-act="xTab"][data-a="week"]');
const qs = await p.locator('.xm-c .xm-ct b').allInnerTexts();
ok('the week holds the bets that run all week, a who-card for each anyone question', ['Who wins MVP?', 'Who wins the Team Competition?', 'Will the United Kingdom win the Ryder Cup?',
  'Who makes a hole in one this week?', 'Who makes an eagle this week?'].every(q => qs.includes(q)) && !qs.some(q => /Round|pool/.test(q)), true);
await tap('[data-act="xTab"][data-a="r2"]');
ok('a round’s tab says which round, and its bets drop the “Round 2:”', [await p.locator('.xm-plate b').innerText(), (await p.locator('.xm-c .xm-ct b').allInnerTexts()).sort()],
  ['Round 2 · Sat 31 Oct', ['Who birdies a par 3?', 'Who finds the water?', 'Who finishes under par, net?', 'Who three-putts?']]);
await shot('round-tab');
await tap('[data-act="xTab"][data-a="week"]');
ok('no money anywhere: chances, not cents', (await p.locator('#app').innerText()).includes('¢'), false);
const hio = p.locator('.xm-c:has-text("Who makes a hole in one")');
ok('Anyone first at 6%, then each golfer at 1%', [await hio.locator('.xm-mo').first().innerText().then(t => t.replace(/\s+/g, ' ').trim()), await hio.locator('.xm-mo').nth(1).locator('em').innerText()], ['Anyone 6% Yes', '1%']);
await shot('bets-list');

console.log('\nbetting in quarters');
await p.locator('.xm-c:has-text("Ryder Cup") .xm-yn .y').click(); await p.waitForTimeout(400);
ok('it opens with the chance and what a quarter pays', [await p.locator('.xm-big strong').innerText(), /A ¼ 🍺 on Yes pays ½ 🍺/.test(await p.locator('.xm-page').innerText())], ['50%', true]);
ok('the bet starts at one beer', await p.locator('.xm-stp b').innerText(), '1 🍺');
await tap('[data-act="xT"][data-a="beers"][data-b="1"]');
ok('and goes up a quarter at a time', await p.locator('.xm-stp b').innerText(), '1¼ 🍺');
await tap('[data-act="xT"][data-a="beers"][data-b="-1"]'); await tap('[data-act="xT"][data-a="beers"][data-b="-1"]');
ok('and down', await p.locator('.xm-stp b').innerText(), '¾ 🍺');
await tap('[data-act="xT"][data-a="set"][data-b="2"]');
const want = await p.evaluate(() => { const L = 10, C = (y, n) => L * Math.log(Math.exp(y / L) + Math.exp(n / L)), y0 = L * Math.log(.5);
  let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (C(y0 + m, y0) - C(y0, y0) < 2) lo = m; else hi = m; }
  return Math.round(lo * 4 + 1e-9) / 4; });
ok('2 🍺 on an even Yes pays to the quarter', (await p.locator('.xm-kv:has-text("Pays") b').innerText()).trim(), (Math.floor(want) || '') + ['', '¼', '½', '¾'][Math.round((want % 1) * 4)] + ' 🍺');
await shot('market-ticket');
await tap('[data-act="xSubmit"]');
ok('a bet goes back to the list, says so, and lights its card', [await p.locator('.xm-flash b').innerText(), await p.locator('.xm-c.land').count(), await p.locator('.xm-h3, .xm-big').count()], ['✓ Bet placed', 1, 0]);
await shot('bet-placed');
ok('betting moves the chance', await p.locator('.xm-c:has-text("Ryder Cup") .xm-ch strong').innerText(), '59%');
ok('and her name goes on the card', (await p.locator('.xm-c:has-text("Ryder Cup") .xm-bk').innerText()).replace(/\s+/g, ' ').trim(), 'Yes Jennifer D');
ok('the bet is two beers in the book', await p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 't').map(t => [t.side, t.cost])), [['yes', 2]]);
ok('the balance drops by exactly two', (await p.locator('.xm-bal').innerText()).trim(), '🍺 18 · My bets');

console.log('\nthe commissioner edits a bet');
ok('every bet card carries an Edit for the commissioner', await p.locator('.xm-c:has-text("Ryder Cup") .xm-edit').count(), 1);
await p.locator('.xm-c:has-text("Ryder Cup") .xm-ct').first().click(); await p.waitForTimeout(400);
ok('and the bet page an Edit this bet bar', await p.locator('.xm-editbar [data-act="xBet"]').count(), 1);
await tap('.xm-editbar [data-act="xBet"]');
ok('the editor opens with the wording and every bet on it', [await p.locator('.xbmodal #xbQ').count(), await p.locator('.xbmodal .xb-row').count()], [1, 1]);
const ryder = () => p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 't' && r.cost > 0).map(t => [t.side, t.cost, !!t.fixedAt]));
const nBefore = await p.evaluate(() => Object.values(window.__T.market).find(r => r.k === 't' && r.cost > 0).n);
await tap('.xbmodal [data-act="xBetTrade"]');
await tap('.xbmodal [data-act="xtSide"][data-a="no"]');
await p.locator('#xtS').fill('3');
await tap('.xbmodal [data-act="xtSave"]');
ok('a bet can be switched side and restaked', await ryder(), [['no', 3, true]]);
await tap('.xbmodal [data-act="xBetTrade"]');
await tap('.xbmodal [data-act="xtSide"][data-a="yes"]');
await p.locator('#xtS').fill('2');
await tap('.xbmodal [data-act="xtSave"]');
ok('and put back, priced exactly as it first went on', [await ryder(), await p.evaluate(() => Object.values(window.__T.market).find(r => r.k === 't' && r.cost > 0).n)], [[['yes', 2, true]], nBefore]);
await p.locator('#xbQ').fill('Will the United Kingdom win the Ryder Cup at Belek?');
await tap('.xbmodal [data-act="xBetSave"]');
await tap('.xbmodal [data-act="modalCancel"]');
ok('one of the book\'s own bets can be reworded', await p.locator('.xm-h').innerText(), 'Will the United Kingdom win the Ryder Cup at Belek?');
await tap('.xm-back');
ok('the balance is untouched by a fix', (await p.locator('.xm-bal').innerText()).trim(), '🍺 18 · My bets');
await p.locator('.xm-c:has-text("Ryder Cup") .xm-yn .y').click(); await p.waitForTimeout(400);
await tap('[data-act="xT"][data-a="act"][data-b="sell"]');
ok('cash out says what it is worth, in quarters', /Your Yes is worth [0-9¼½¾]+ 🍺 right now/.test(await p.locator('.xm-tk').first().innerText()), true);
await tap('[data-act="xT"][data-a="beers"][data-b="-1"]');
const before = await p.locator('.xm-stp b').innerText();
await tap('[data-act="xSubmit"]');
const cashed = await p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 't' && r.cost < 0).map(t => t.cost * 4 % 1 === 0));
ok('cashing out part comes back in whole quarters', cashed, [true]);
ok('and says so on the list', await p.locator('.xm-flash b').innerText(), '✓ Cashed out');
await tap('.xm-c:has-text("Ryder Cup") .xm-ct');
ok('and leaves the rest on', /pays .* if Yes/.test(await p.locator('.xm-mine').innerText()), true);
await tap('[data-act="xT"][data-a="act"][data-b="buy"]');
await tap('[data-act="xT"][data-a="side"][data-b="no"]');
const noAt = +(await p.locator('[data-act="xT"][data-a="side"][data-b="no"]').innerText()).replace(/\D+/g, '');
await tap('[data-act="xT"][data-a="type"][data-b="limit"]');
for (let i = 0; i < 10; i++) await p.locator('[data-act="xT"][data-a="lim"][data-b="-1"]').click();
await tap('[data-act="xT"][data-a="set"][data-b="0.5"]');
await tap('[data-act="xSubmit"]');
ok('a bet waiting for its chance says so too', await p.locator('.xm-flash b').innerText(), '✓ Waiting to go on');
await tap('.xm-c:has-text("Ryder Cup") .xm-ct');
ok('a bet at a chance you set waits, in beers', (await p.locator('.xm-ob .n .lvl').innerText()).replace(/\s+/g, ' ').trim(), (noAt - 10) + '% ½ 🍺');
await shot('market-after');

console.log('\nmake your own');
await tap('.xm-back');
await tap('.xm-new');
await p.locator('#xQ').fill('Will Ray V wear the pink trousers on Sunday');
await p.locator('#xRules').fill('Yes if he is wearing them on the first tee.');
await tap('[data-act="xN"][data-a="p0"][data-b="25"]');
await tap('[data-act="xN"][data-a="ppl"][data-b="g6"]');
await shot('new-bet');
await tap('[data-act="xCreate"]');
ok('it opens straight away, a question mark added', await p.locator('.xm-h').innerText(), 'Will Ray V wear the pink trousers on Sunday?');
ok('at the chance it was given', await p.locator('.xm-big strong').innerText(), '25%');
ok('a quarter on Yes at 25% pays about a beer, to the nearest quarter', /A ¼ 🍺 on Yes pays 1 🍺/.test(await p.locator('.xm-page').innerText()), true);
ok('Ray V is tagged on it', await p.locator('.xm-page .xm-tags .xm-tag').allInnerTexts(), ['Ray V']);
ok('and says who settles it', /Settled by Jennifer D or the commissioner/.test(await p.locator('.xm-rules').innerText()), true);
await tap('[data-act="xT"][data-a="set"][data-b="0.25"]');
await tap('[data-act="xSubmit"]');
await tap('[data-act="xTab"][data-a="week"]');
ok('a bet the group made is on the week too, under its own head', [await p.locator('.xm-subh:has-text("Made by the group")').count(), (await p.locator('.xm-subh:has-text("Made by the group") ~ .xm-c .xm-ct b').allInnerTexts()).includes('Will Ray V wear the pink trousers on Sunday?')], [1, true]);
await tap('.xm-c:has-text("pink trousers") .xm-ct');
await tap('[data-act="xSettle"][data-b="yes"]');
ok('settling asks first', await p.locator('.scrim [data-act="confirmOk"]').count(), 1);
await tap('.scrim [data-act="confirmOk"]');
ok('then it is settled, by name', (await p.locator('.xm-done').innerText()).replace(/\s+/g, ' ').trim().startsWith('Settled Yes by Jennifer D'), true);
await tap('.xm-back');
ok('a settled bet stays on its tab, under Settled', [await p.locator('.xm-tabs button.on').getAttribute('data-a'), await p.locator('.xm-subh').innerText(),
  await p.locator('.xm-subh ~ .xm-c .xm-ct b').allInnerTexts()], ['week', 'SETTLED', ['Will Ray V wear the pink trousers on Sunday?']]);
await tap('[data-act="xTab"][data-a="cashed"]');
ok('Cashed lists the settled bet, what it came in as, and who said so', [await p.locator('.xm-cash .xc-q').allInnerTexts(), await p.locator('.xm-cash .xc-res b').innerText(), /settled by Jennifer D/.test(await p.locator('.xm-cash .xc-res small').innerText())],
  [['Will Ray V wear the pink trousers on Sunday?'], 'Yes', true]);
ok('and what it paid: her quarter on Yes at 25% came back as a beer', (await p.locator('.xm-cash .xc-lines li').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()), ['🏆 Jennifer D cashed 1 🍺 put on ¼ · +¾']);
await tap('[data-act="xTab"][data-a="week"]');
ok('once settled it sits under Settled on the week as well', (await p.locator('.xm-subh:has-text("Settled") ~ .xm-c .xm-ct b').allInnerTexts()).includes('Will Ray V wear the pink trousers on Sunday?'), true);
console.log('\nover or under');
await tap('[data-act="xTab"][data-a="ours"]');
await tap('[data-act="xView"][data-a="new"]');
await tap('[data-act="xN"][data-a="kind"][data-b="ou"]');
ok('the form asks what is counted, and the line', [await p.locator('#xLine').count(), await p.locator('[data-act="xN"][data-a="p0"]').count()], [1, 0]);
await p.locator('#xQ').fill('Ray V’s gross score in Round 3');
await p.locator('#xLine').fill('92.5');
await tap('[data-act="xCreate"]');
ok('it opens as an over/under on the line', await p.locator('.xm-h').innerText(), 'Over or under 92½: Ray V’s gross score in Round 3?');
ok('and is bet on Over or Under', (await p.locator('.xm-tk [data-act="xT"][data-a="side"]').allInnerTexts()).map(t => t.split(' ·')[0]), ['Over', 'Under']);
ok('the line is kept on the bet', await p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 'q' && r.ou).map(r => r.ou.line)), [92.5]);
await tap('[data-act="xSettle"][data-b="yes"]');
ok('settling says it went over', await p.locator('.scrim .mbanner, .scrim h2, .scrim').first().innerText().then(t => /Over/.test(t)), true);
await tap('.scrim [data-act="confirmOk"]');
ok('and it reads as settled Over', /Settled Over/.test((await p.locator('.xm-done').innerText()).replace(/\s+/g, ' ')), true);
await tap('.xm-back');
await tap('[data-act="xTab"][data-a="r1"]');
ok('Round 1 shows what the book settled itself as it happened: Robby B’s birdie on the 3rd and Ray V’s ball in the water',
  await p.locator('.xm-c:has(.xm-res.yes) .xm-ct b').allInnerTexts().then(x => x.sort()), ['Who birdies a par 3?', 'Who finds the water?']);
ok('for Anyone and for the golfer who did it, the rest still open', (await p.locator('.xm-c:has-text("Who finds the water") .xm-mo:has(.xm-res)').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).sort(), ['Anyone Settled Yes', 'Ray V Settled Yes']);

console.log('\nmy bets');
await tap('.xm-bal');
const bal = await p.evaluate(() => [...document.querySelectorAll('.xm-kv b')].map(b => b.innerText)[0]);
ok('the balance is whole quarters', /^🍺 \d+[¼½¾]?$/.test(bal), true);
ok('the open Ryder Cup bet and the settled trousers', [await p.locator('.xm-pos .xm-p').count(), await p.locator('.xm-tk .xm-res.yes').count()], [1, 1]);
ok('and the bet still waiting', await p.locator('[data-act="xCancel"]').count(), 1);
await shot('portfolio');
await tap('[data-act="xCancel"]');
ok('which can be cancelled', await p.locator('[data-act="xCancel"]').count(), 0);
await tap('.xm-p [data-act="xSellFrom"]');
await tap('.xm-q button:has-text("All of it")');
await tap('[data-act="xSubmit"]');
await tap('.xm-bal');
ok('cashing out all of it closes the bet', await p.locator('.xm-pos .xm-p').count(), 0);
const fin = await p.evaluate(() => [...document.querySelectorAll('.xm-kv b')].map(b => b.innerText)[0]);
ok('and the balance is still whole quarters', /^🍺 \d+[¼½¾]?$/.test(fin), true);

console.log('\nthe book settles its own');
await p.evaluate(() => { const T = window.__T; T.scores['r1__g8'] = { raw: [4, 4, 1].concat(Array(15).fill(null)), by: { 0: 's1', 1: 's1', 2: 's1' }, at: { 0: Date.now(), 1: Date.now(), 2: Date.now() }, marks: {}, mF: false, mB: false, bb: false }; window.__forceRender(); });
await tap('.xm-back');
await tap('[data-act="xTab"][data-a="week"]');
ok('a hole in one settles Yes at once, for Anyone and for Dan A', (await p.locator('.xm-c:has-text("hole in one") .xm-mo:has(.xm-res)').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).sort(), ['Anyone Settled Yes', 'Dan A Settled Yes']);

console.log('\nbetting on people');
await tap('[data-act="xAbout"][data-a="g7"]');
ok('one person’s bets come from every tab, under their own headings', [await p.locator('.xm-tabs button.on').count(), await p.locator('.xm-subh').allInnerTexts()].map(x => Array.isArray(x) ? x.includes('THE WEEK') && x.includes('ROUND 2') : x), [0, true]);
const aboutRobby = await p.locator('.xm-c .xm-ct b').allInnerTexts();
ok('filtering by Robby B keeps only bets about him', [aboutRobby.includes('Who wins MVP?'), aboutRobby.includes('Will the United Kingdom win the Ryder Cup?')], [true, false]);
ok('with his row lit on each card', await p.locator('.xm-c:has-text("Who wins MVP?") .xm-mo.hit span').first().innerText(), 'Robby B');
await p.locator('.xm-c:has-text("Who makes an eagle") .xm-mo.hit button').click(); await p.waitForTimeout(400);
ok('tapping it opens his bet', await p.locator('.xm-h3').innerText(), 'Will Robby B make an eagle this week?');
ok('with every team golfer along the top (Devin O, on no team, left off), Anyone first', [await p.locator('.xm-pick button').count(), (await p.locator('.xm-pick button').first().innerText()).split('\n')[0]], [11, 'Anyone']);
await tap('[data-act="xT"][data-a="set"][data-b="0.25"]');
ok('a quarter on a 4% long shot pays over five', +(await p.locator('.xm-kv:has-text("Pays if Robby B") b').innerText()).replace(/[^\d.]/g, '') >= 5, true);
await tap('.xm-pick button:has-text("Ray V")');
ok('and another name is one tap away', await p.locator('.xm-h3').innerText(), 'Will Ray V make an eagle this week?');
await tap('.xm-back');
await tap('[data-act="xAbout"][data-a="all"]');

console.log('\na who-bet of our own');
await tap('.xm-new');
await tap('[data-act="xN"][data-a="kind"][data-b="who"]');
await p.locator('#xQ').fill('Who is last to breakfast on Friday');
for (const id of ['g6', 'g9', 'g10']) await tap(`[data-act="xN"][data-a="ppl"][data-b="${id}"]`);
ok('three people, a third each to start', /3 people, 33% each/.test(await p.locator('.xm-page').innerText()), true);
await tap('[data-act="xCreate"]');
ok('it opens as a who-card', [await p.locator('.xm-h').innerText(), await p.locator('.xm-pick button').count()], ['Who is last to breakfast on Friday?', 3]);
await tap('[data-act="xSettleWho"][data-b="g6"]');
await tap('.scrim [data-act="confirmOk"]');
ok('settled by naming who it was: Ray V Yes, the others No', (await p.locator('.xm-pick button small').allInnerTexts()).sort(), ['No', 'No', 'Yes']);
await tap('.navbtn[data-a="boards"]'); await tap('.btab[data-a="chat"]'); await tap('.ch-rooms button[data-a="r1"]');
ok('and the chat says so', (await p.locator('.ch-ev .ch-evw b').allInnerTexts()).some(t => /HOLE IN ONE/.test(t)), true);

console.log('\neveryone bets, and off the course everyone can be bet on');
ok('Jennifer D, in the gallery, has been betting all along', await p.evaluate(() => [...new Set(Object.values(window.__T.market).filter(r => r.k === 't').map(t => t.pid))]), ['s1']);
await p.evaluate(() => { localStorage.setItem('union-invitational:whoami', 'o1'); window.__UI.who = undefined; window.__forceRender(); });
await tap('.navbtn[data-a="bets"]'); await tap('.xm-back'); await tap('[data-act="xTab"][data-a="week"]');
await p.locator('.xm-c:has-text("Who wins MVP?") .xm-mo').nth(1).locator('button').first().click(); await p.waitForTimeout(400);
await tap('[data-act="xT"][data-a="set"][data-b="1"]'); await tap('[data-act="xSubmit"]');
ok('and a ref can bet on who plays well', await p.evaluate(() => Object.values(window.__T.market).filter(r => r.k === 't' && r.pid === 'o1').map(t => [t.m.slice(0, 6), t.cost])), [['s_mvp_', 1]]);
ok('his name shows on that row of the MVP card', /🍺 Justin P/.test(await p.locator('.xm-c:has-text("Who wins MVP?")').innerText()), true);
await tap('.xm-st[data-a="o1"]');
ok('tapping him in the table opens his bets under his name', (await p.locator('.xm-pbs .xm-pb').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).map(t => /^Who wins MVP: .* Yes 1 🍺 in · worth/.test(t)), [true]);
await shot('table-open');
await tap('.xm-pbs .xm-pb');
ok('and tapping a bet there opens it', /Who wins MVP/.test(await p.locator('.xm-h').innerText()), true);
ok('with a way back always in reach', await p.locator('.xm-backfab').isVisible(), true);
await tap('.xm-backfab'); await tap('.xm-st[data-a="o1"]');
ok('tapping him again folds them away', await p.locator('.xm-pbs').count(), 0);
await tap('[data-act="xTab"][data-a="off"]');
await tap('.xm-c:has-text("Who ends up in a pool") .xm-more');
const pool = await p.locator('.xm-c:has-text("Who ends up in a pool") .xm-mo span').allInnerTexts();
ok('the pool bet names golfers, the gallery and the refs', ['Anyone', 'Ray V', 'Jennifer D', 'Justin P'].map(n => pool.some(t => t.startsWith(n))), [true, true, true, true]);
await tap('[data-act="xAbout"][data-a="s2"]');
ok('and the gallery has its own place in the About row', (await p.locator('.xm-c .xm-ct b').allInnerTexts()).sort(), ['Who ends up in a pool with their clothes on?', 'Who’s the last one standing on the final night?']);
await tap('[data-act="xAbout"][data-a="all"]');
await tap('.xm-new');
ok('a bet of our own can be about anyone on the trip', await p.locator('.xm-ppl button').evaluateAll(b => ['g1', 's2', 'o1'].map(id => b.some(x => x.dataset.b === id))), [true, true, true]);
await tap('.xm-back');

console.log('\nthe chat bubble');
await tap('.navbtn[data-a="today"]'); await shut();
ok('the bubble is on Today', await p.locator('.chatfab').count(), 1);
const had = +((await p.locator('.chatfab .badge').count()) ? await p.locator('.chatfab .badge').innerText() : 0);
await p.waitForTimeout(4900);
await p.evaluate(() => { window.__T.chat['mzz1'] = { id: 'mzz1', k: 'm', rid: 'r1', pid: 's2', name: 'Aimee K', text: 'Who had Norberto Jr. in the water?', at: Date.now(), dev: 'dOther', re: null }; window.__forceRender(); });
await p.waitForTimeout(400);
ok('a message from another phone adds one to the red count', +(await p.locator('.chatfab .badge').innerText()), had + 1);
ok('and slides out beside it', (await p.locator('.chatpeek').innerText()).replace(/\s+/g, ' ').trim(), 'Aimee K Who had Norberto Jr. in the water?');
await shot('bubble');
await p.waitForTimeout(4900);
ok('the slide-out goes by itself', await p.locator('.chatpeek').count(), 0);
await tap('.chatfab');
ok('one tap: the chat rises over the screen', await p.locator('.chatsheet').count(), 1);
ok('opened to read: no keyboard until the box is tapped', await p.evaluate(() => (document.activeElement || {}).id || ''), '');
ok('the bubble steps aside while it is open', await p.locator('.chatfab').count(), 0);
await p.locator('#chatText').click();
ok('a tap in the box brings the keyboard', await p.evaluate(() => document.activeElement && document.activeElement.id), 'chatText');
/* the keyboard covering the bottom 330 pixels, as the phone reports it */
await p.evaluate(() => { const r = document.documentElement; r.style.setProperty('--vvh', '514px'); r.style.setProperty('--vvt', '0px'); r.classList.add('kbd'); });
await p.waitForTimeout(200);
const fit = await p.evaluate(() => { const s = document.querySelector('.chatsheet').getBoundingClientRect(), box = document.getElementById('chatText').getBoundingClientRect();
  const first = document.querySelector('.chatsheet .ch-feed > *'); const f = first ? first.getBoundingClientRect() : null;
  return { above: s.bottom <= 515, box: box.bottom < 514, msg: !!f && f.top < 514 }; });
ok('with the keyboard up the chat sits above it, box and newest lines in view', fit, { above: true, box: true, msg: true });
await p.keyboard.type('On my way to the 9th green');
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok('posting keeps the chat open', await p.locator('.chatsheet').count(), 1);
ok('and the keyboard up for the next line', await p.evaluate(() => document.activeElement && document.activeElement.id), 'chatText');
ok('the line is in', (await p.locator('.chatsheet .ch-feed > .ch-msg p').first().innerText()), 'On my way to the 9th green');
await shot('bubble-open');
await p.evaluate(() => { document.activeElement && document.activeElement.blur(); document.documentElement.classList.remove('kbd'); });
await p.locator('.scrim.tcscrim').click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(400);
ok('a tap above closes it', await p.locator('.chatsheet').count(), 0);
ok('and what was read is no longer counted', await p.locator('.chatfab .badge').count(), 0);
await tap('.navbtn[data-a="entry"]'); await shut();
ok('no bubble on Score Entry', await p.locator('.chatfab').count(), 0);
await tap('.navbtn[data-a="boards"]'); await tap('.btab[data-a="chat"]');
ok('nor on the chat itself', await p.locator('.chatfab').count(), 0);
await tap('.btab[data-a="photos"]');
ok('on Photos it sits above the camera button', await p.locator('.chatfab.up').count(), 1);

console.log('\nthe same name on another phone');
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(String(e)));
await q.clock.install({ time: new Date('2026-10-26T06:00:00Z') });
await q.goto('file://' + S + '/social.html'); await q.waitForTimeout(3500);
for (let i = 0; i < 6; i++) { const d = q.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await q.waitForTimeout(200); } else break; }
/* the shared book, as the second phone would read it */
await q.evaluate(pin => { window.__T.chat.id_s1 = { id: 'id_s1', k: 'id', pid: 's1', pin, at: Date.now(), dev: 'dOther' }; window.__forceRender(); }, '4826');
await q.locator('.chatfab').click(); await q.waitForTimeout(400);
await q.locator('.ch-post [data-act="whoOpen"]').click(); await q.waitForTimeout(300);
await q.locator('.who-c button:has-text("Jennifer D")').click(); await q.waitForTimeout(300);
ok('it asks for her PIN rather than a new one', [await q.locator('#whoPinA').count(), await q.locator('#whoPinB').count()], [1, 0]);
await q.locator('#whoPinA').fill('1111'); await q.locator('[data-act="whoPinGo"]').click(); await q.waitForTimeout(300);
ok('the wrong one is refused, and says who can help', /commissioner can/.test(await q.locator('.whomodal .xm-err').innerText()), true);
await q.locator('#whoPinA').fill('4826'); await q.locator('#whoPinA').press('Enter'); await q.waitForTimeout(400);
ok('the right one lets her in, back in the chat', [await q.evaluate(() => localStorage.getItem('union-invitational:whoami')), await q.locator('.chatsheet').count()], ['s1', 1]);

console.log('\na guest');
await q.evaluate(() => { localStorage.removeItem('union-invitational:whoami'); window.__UI.who = undefined; window.__forceRender(); });
await q.locator('.ch-post [data-act="whoOpen"]').click(); await q.waitForTimeout(300);
await q.locator('#guestName').fill('robby b'); await q.locator('[data-act="guestJoin"]').click(); await q.waitForTimeout(300);
ok('a bleacher name cannot be a name from the trip', /on the trip/.test(await q.locator('.whomodal .xm-err').innerText()), true);
for (const near of ['Rosa', 'manuel', 'Ray V Jr']) {
  await q.locator('#guestName').fill(near); await q.locator('[data-act="guestJoin"]').click(); await q.waitForTimeout(250);
  ok(`nor pass for one: “${near}”`, /too close to/.test(await q.locator('.whomodal .xm-err').innerText()), true);
}
await q.locator('#guestName').fill('Uncle Bob'); await q.locator('[data-act="guestJoin"]').click(); await q.waitForTimeout(400);
ok('a name of their own is a pass, straight back to the chat', [await q.locator('.chatsheet').count(), /Posting as Uncle Bob, in the bleachers/.test(await q.locator('.chatsheet .ch-as').innerText())], [1, true]);
await q.locator('#chatText').fill('Watching from Leeds. Go UK!'); await q.locator('#chatText').press('Enter'); await q.waitForTimeout(400);
const first = q.locator('.chatsheet .ch-feed > .ch-msg').first();
ok('their line is marked as from the bleachers', [(await first.locator('.ch-n').innerText()).startsWith('Uncle Bob'), await first.locator('.gtag.t-bleach').count()], [true, 1]);
await q.evaluate(() => document.activeElement && document.activeElement.blur());
await q.locator('.scrim.tcscrim').click({ position: { x: 20, y: 20 } }); await q.waitForTimeout(300);
await q.locator('.navbtn[data-a="bets"]').click(); await q.waitForTimeout(400);
ok('and they bet with the same twenty beers', (await q.locator('.xm-bal').innerText()).trim(), '🍺 20 · My bets');
await q.close();

console.log('\nwith the PINs on, as on the real app');
writeFileSync(S + '/social-pins.html', readFileSync(S + '/social.html', 'utf8').replace('PINS_ENABLED = false', 'PINS_ENABLED = true'));
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const r = await ctx3.newPage(); r.on('pageerror', e => errs.push(String(e)));
await r.clock.install({ time: new Date('2026-10-26T06:00:00Z') });
await r.goto('file://' + S + '/social-pins.html'); await r.waitForTimeout(3500);
for (let i = 0; i < 6; i++) { const d = r.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await r.waitForTimeout(200); } else break; }
await r.evaluate(() => { const T = window.__T, at = Date.now();
  T.config.pins = { master: '9991', s1: '9992', s2: '9993' };
  T.chat.id_g7 = { id: 'id_g7', k: 'id', pid: 'g7', pin: '7070', at, dev: 'dA' };
  T.chat.guest_xd1 = { id: 'guest_xd1', k: 'g', pid: 'xd1', name: 'Uncle Bob', at, dev: 'd1' };
  T.market.qguest = { id: 'qguest', k: 'q', q: 'Will Uncle Bob fly out for Sunday?', rules: '', cat: 'trip', p0: 30, pid: 'xd1', byName: 'Uncle Bob', dev: 'd1', at, result: null };
  localStorage.setItem('union-invitational:device', 'd1'); localStorage.setItem('union-invitational:whoami', 'xd1');
  window.__UI.role = 'viewer'; window.__forceRender(); });
await r.reload(); await r.waitForTimeout(3500);
for (let i = 0; i < 6; i++) { const d = r.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await r.waitForTimeout(200); } else break; }
await r.evaluate(() => { const T = window.__T, at = Date.now();
  T.config.pins = { master: '9991', s1: '9992', s2: '9993' };
  T.chat.id_g7 = { id: 'id_g7', k: 'id', pid: 'g7', pin: '7070', at, dev: 'dA' };
  T.chat.guest_xd1 = { id: 'guest_xd1', k: 'g', pid: 'xd1', name: 'Uncle Bob', at, dev: 'd1' };
  T.market.qguest = { id: 'qguest', k: 'q', q: 'Will Uncle Bob fly out for Sunday?', rules: '', cat: 'trip', p0: 30, pid: 'xd1', byName: 'Uncle Bob', dev: 'd1', at, result: null };
  window.__UI.role = 'viewer'; window.__UI.screen = 'bets'; window.__UI.xView = 'qguest'; window.__forceRender(); });
await r.waitForTimeout(400);
ok('a guest who made a bet cannot settle it', await r.locator('[data-act="xSettle"]').count(), 0);
ok('it says the commissioner does', /from the bleachers, so the commissioner settles it/.test(await r.locator('.xm-rules').innerText()), true);
await r.evaluate(() => { window.__UI.screen = 'roster'; window.__UI.xView = null; window.__forceRender(); }); await r.waitForTimeout(300);
ok('nobody but the master reviewer sees the PINs', await r.locator('.pinlist').count(), 0);
await r.evaluate(() => { window.__UI.role = 'master'; window.__forceRender(); }); await r.waitForTimeout(300);
ok('the master reviewer sees them on Roster', (await r.locator('.pinrow:has-text("Robby B") .pv').innerText()).trim(), '7070');
ok('and the guests, with a way to take a pass', [await r.locator('.pinrow:has-text("Uncle Bob")').count(), await r.locator('[data-act="guestRemove"]').count()], [1, 1]);
ok('a ref’s name says it uses the ref PIN', (await r.locator('.pinrow:has-text("Justin P") .pv').innerText()).trim(), 'uses the ref PIN');
const pickAs = async (role, pid) => { await r.evaluate(([role]) => { localStorage.removeItem('union-invitational:whoami'); window.__UI.who = undefined;
  window.__UI.role = role; window.__UI.modal = { kind: 'who' }; window.__forceRender(); }, [role]); await r.waitForTimeout(200);
  await r.locator(`[data-act="whoPick"][data-a="${pid}"]`).click(); await r.waitForTimeout(300);
  return [await r.evaluate(() => localStorage.getItem('union-invitational:whoami')), await r.locator('#whoPinA').count()]; };
ok('the commissioner picks a name with no second PIN', await pickAs('master', 'g1'), ['g1', 0]);
ok('and could pick anyone', await pickAs('master', 'g7'), ['g7', 0]);
ok('a ref picks a ref’s name with no second PIN', await pickAs('s1', 'o1'), ['o1', 0]);
ok('but a ref’s phone still needs a golfer’s own PIN', await pickAs('s1', 'g7'), [null, 1]);
ok('anyone else still makes a PIN', await pickAs('viewer', 'o3'), [null, 1]);
await r.close();

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
