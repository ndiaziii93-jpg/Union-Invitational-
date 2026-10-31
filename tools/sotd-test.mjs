/* SHOT OF THE DAY. A ref nominates on the course, from the gold ★ on a
   golfer's row, with a few words; as many as they like. After the round the
   refs pick a shortlist, the vote opens to everyone, one a phone, and the
   commissioner closes it. The winner goes to the recap in the ref's words.
   Run: node tools/sotd-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
writeFileSync(S + '/sotd.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
/* a stand-in for Claude that keeps what it was asked */
await ctx.addInitScript(() => {
  window.__asked = [];
  const fn = async input => { window.__asked.push((Array.isArray(input) ? input.map(m => m.content).join('\n') : String(input))); return { text: '{}' }; };
  window.claude = { use: async name => name === 'sample' ? fn : null };
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.clock.install({ time: new Date('2026-10-31T08:00:00Z') });
await p.goto('file://' + S + '/sotd.html'); await p.waitForTimeout(3500);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(200); };
const shot = async n => { if (SHOTS) await p.screenshot({ path: S + '/sotd-' + n + '.png' }); };
await shut();
const go = h => p.evaluate(h => { window.__T.config.rounds.r2.state = 'open'; Object.assign(window.__UI, { screen: 'entry', entryRound: 'r2', entryHole: h, modal: null, draft: null, countMode: false }); window.__forceRender(); }, h);

console.log('\non the course');
await go(3); await p.waitForTimeout(500); await shut();
const ids = await p.locator('.sn-btn').evaluateAll(es => es.map(e => e.dataset.a));
ok('every golfer on the ref’s card has the gold ★', ids.length > 1, true);
await tap(`.sn-btn[data-a="${ids[0]}"]`);
ok('it opens a box for what the shot was', await p.locator('#sotdText').count(), 1);
await tap('[data-act="sotdSend"]');
ok('it will not nominate without a word about it', /Say what the shot was/.test(await p.locator('.snsheet').innerText()), true);
await p.locator('#sotdText').click();
await p.locator('#sotdText').pressSequentially('Holed out from the bunker', { delay: 5 });
const box = await p.locator('#sotdText').elementHandle();
await p.evaluate(() => window.__forceRender());
await p.locator('#sotdText').pressSequentially(' for an eagle', { delay: 5 });
ok('the box is not rebuilt under the thumb while it is typed in', [await box.evaluate(e => e.isConnected), await p.locator('#sotdText').inputValue()], [true, 'Holed out from the bunker for an eagle']);
await shot('nominate');
await tap('[data-act="sotdSend"]');
ok('nominated: the button turns dark and says so', (await p.locator(`.sn-btn[data-a="${ids[0]}"]`).innerText()).trim(), '★ Nominated');
const nominate = async (h, who, t) => { await go(h); await p.waitForTimeout(300); await shut(); await tap(`.sn-btn[data-a="${who}"]`); await p.locator('#sotdText').fill(t); await tap('[data-act="sotdSend"]'); };
await nominate(5, ids[1], 'Punched out under the pine and ran it up to two feet');
await nominate(7, ids[0], 'Driver off the deck onto the green');
await nominate(8, ids[2] || ids[1], 'Sixty-foot putt, dead centre');
ok('as many as they like', await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'sn').length), 4);

console.log('\nin count mode too');
await p.evaluate(() => { window.__UI.countMode = true; window.__forceRender(); }); await p.waitForTimeout(300);
ok('each count tile has a small gold ★', await p.locator('.ctile .sn-btn.mini').count(), ids.length);
await p.evaluate(() => { window.__UI.countMode = false; window.__forceRender(); });

console.log('\nafter the round: the refs shortlist');
await p.evaluate(() => { Object.assign(window.__UI, { screen: 'boards', boardTab: 'sotd' }); window.__forceRender(); }); await p.waitForTimeout(400); await shut();
ok('Boards has a Shot tab listing every nomination, in the ref’s words', [await p.locator('.btab.on').evaluate(e => e.lastChild.textContent.trim()), await p.locator('.sn-card').count(), /Holed out from the bunker for an eagle/.test(await p.locator('#app').innerText())], ['Shot', 4, true]);
ok('stage one is the refs’ shortlist', (await p.locator('.sn-stage span.on').innerText()).trim(), '1 · Refs shortlist');
const noms = await p.locator('[data-act="sotdPick"]').evaluateAll(es => es.map(e => e.dataset.a));
await tap(`[data-act="sotdPick"][data-a="${noms[0]}"]`); await tap(`[data-act="sotdPick"][data-a="${noms[1]}"]`); await tap(`[data-act="sotdPick"][data-a="${noms[3]}"]`);
await tap(`[data-act="sotdPick"][data-a="${noms[2]}"]`);
ok('a ref picks up to three', await p.locator('.sn-pick.on').count(), 3);
await shot('shortlist');
await tap('[data-act="sotdStage"][data-a="vote"]');
ok('then the vote opens, on the shortlist only', [(await p.locator('.sn-stage span.on').innerText()).trim(), await p.locator('[data-act="sotdVote"]').count()], ['2 · Everyone votes', 3]);

console.log('\neveryone votes');
const vs = await p.locator('[data-act="sotdVote"]').evaluateAll(es => es.map(e => e.dataset.a));
await tap(`[data-act="sotdVote"][data-a="${vs[1]}"]`);
ok('one vote a phone, shown on the bar', [await p.locator('.sn-vote.on').count(), (await p.locator('.sn-card').nth(1).locator('.sn-n').innerText()).trim()], [1, '1 vote']);
await tap(`[data-act="sotdVote"][data-a="${vs[2]}"]`);
ok('voting again moves the vote', [await p.locator('.sn-vote.on').count(), await p.evaluate(() => Object.values(window.__T.chat).filter(r => r.k === 'sv').length)], [1, 1]);
await shot('vote');
await tap('[data-act="sotdClose"]');
const win = await p.evaluate(v => window.__T.chat[v], vs[2]);
ok('the commissioner closes it and the winner is crowned', [await p.locator('.sn-crown').count(), (await p.locator('.sn-crown').innerText()).includes(win.t)], [1, true]);
await shot('winner');
const told = await p.evaluate(v => { const W = window.__T.chat[v]; return W && W.t; }, vs[2]);
ok('the winner is the nomination the vote chose', told, win.t);
await p.evaluate(() => { const x = document.createElement('button'); x.dataset.act = 'recapGen'; x.dataset.a = 'r2'; document.getElementById('app').appendChild(x); x.click(); });
await p.waitForTimeout(1500);
const prompt = await p.evaluate(() => (window.__asked || []).find(q => /THE CARD/.test(q)) || '');
ok('and the recap writer is told the voted shot of the day, in the ref’s words', /SHOT OF THE DAY \(voted by the group\): .*Sixty-foot putt, dead centre/.test(prompt), true);
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
