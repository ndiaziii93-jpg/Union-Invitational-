/* PUTTS, AS A SECOND TAP.
 *
 * The keypad used to ask for the gross and nothing else, so a card a member
 * scored themselves carried no putting at all — only a refereed round did.
 * The second tap fixes that, and the whole point is that it costs nothing:
 *
 *   - a member who ignores it scores exactly as fast as before, and
 *   - a card with putts on six holes reports six, not eighteen with twelve
 *     zeros in it.
 *
 * Both of those are easy to break, so both are pinned here, by driving the
 * real keypad rather than calling the helper.
 *
 * Run: node tools/putts-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/putts', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/putts/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/putts/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR ' + e.message); bad++; });
const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const card = () => p.evaluate(() => { const T = window.__T; const k = Object.keys(T.club).find(x => x.startsWith('card__')); return k ? T.club[k] : null; });
const hole = () => p.evaluate(() => window.__UI.clubHole);
const padOpen = () => p.evaluate(() => !!document.querySelector('.keypad'));

await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);
await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }], packages: [] };
  const hit = Cl.courseLibrary(T).find(x => /lakewood/i.test(x.name) && x.tee === 'White');
  T.club.course__g1 = { ...Cl.courseFrom(hit, 'g1'), approved: true };
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
}, [iso(-3), iso(10)]);
await p.waitForTimeout(400);
await go('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(350);
if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) { await go('roundGo', { a: 'comp' }); await p.waitForTimeout(600); }
await p.waitForTimeout(600);

console.log('\n1. the fast path is untouched for anyone who ignores putts');
await go('clubPad'); await p.waitForTimeout(250);
ok('the keypad opens', await padOpen(), true);
ok('it starts on the 1st', await hole(), 0);
await go('clubScore', { a: '5' }); await p.waitForTimeout(250);
ok('a gross tap moves straight to the 2nd, as it always did', await hole(), 1);
await go('clubScore', { a: '4' }); await p.waitForTimeout(250);
ok('and again to the 3rd', await hole(), 2);
ok('two holes are on the card', (await card()).raw.slice(0, 3), [5, 4, null]);
ok('with no putts object at all', (await card()).putts == null || Object.keys((await card()).putts).length === 0, true);

console.log('\n2. the second tap is there and it writes');
await go('clubPutts', { a: '2' }); await p.waitForTimeout(250);
ok('two putts on the 3rd', (await card()).putts, { 2: 2 });
ok('and it did not touch the score', (await card()).raw[2], null);

console.log('\n3. once the round is counting, the pad waits for the tap');
await go('clubPutts', { a: '2' }); await p.waitForTimeout(200);   /* clear it again */
ok('tapping the lit key clears it', (await card()).putts, {});
await go('clubPutts', { a: '1' }); await p.waitForTimeout(250);
ok('one putt on the 3rd, so this round is counting now', (await card()).putts, { 2: 1 });
await go('clubScore', { a: '4' }); await p.waitForTimeout(250);
ok('the 3rd already has its putts, so the gross still moves on', await hole(), 3);
await go('clubScore', { a: '6' }); await p.waitForTimeout(300);
ok('the 4th has none, so the pad holds the hole open', await hole(), 3);
ok('but the score saved anyway — it is never a gate', (await card()).raw[3], 6);
ok('and the row says so', await p.evaluate(() => !!document.querySelector('.keypad .putts.waiting')), true);

console.log('\n4. a hole can always be skipped');
await go('clubPadNext'); await p.waitForTimeout(250);
ok('go to the next hole and nothing is lost', await hole(), 4);
ok('the 4th keeps its score with no putts on it', [(await card()).raw[3], (await card()).putts[3] ?? null], [6, null]);

console.log('\n5. you cannot have putted more times than you hit it');
await go('clubScore', { a: '3' }); await p.waitForTimeout(300);
ok('a 3 on the 5th', (await card()).raw[4], 3);
ok('the 4+ key is dead', await p.evaluate(() => { const k = [...document.querySelectorAll('.keypad .pk')].find(x => x.dataset.a === '4'); return !!(k && k.disabled); }), true);
await go('clubPutts', { a: '4' }); await p.waitForTimeout(250);
ok('and tapping it anyway writes nothing', (await card()).putts[4] ?? null, null);
await go('clubPutts', { a: '2' }); await p.waitForTimeout(250);
ok('two putts in a 3 is allowed, and lands', (await card()).putts[4], 2);

console.log('\n6. the card reports what was counted, not what was not');
const sum = await p.evaluate(() => { const e = document.querySelector('.puttsum'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; });
ok('the summary counts only the counted holes', /on 2 counted holes/.test(sum || ''), true);
ok('and adds up only those', /^3 putts on 2 counted holes/.test(sum || ''), true);
ok('and it is partial, not eighteen holes of nothing', /18 counted/.test(sum || ''), false);
console.log('      ' + sum);
const t = await p.evaluate(() => { const T = window.__T, C = window.__C; const k = Object.keys(T.club).find(x => x.startsWith('card__')); return C.cardTotals(T.club[k]).pts; });
ok('the points are the points, putts or no putts', typeof t === 'number' && t > 0, true);
await p.screenshot({ path: S + '/putts/keypad.png' });

await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
