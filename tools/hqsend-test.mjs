/* AN ANSWER TYPED AND NEVER BLURRED.
 *
 * Three people said their Vegas HQ answers did not come through, and one of
 * them was walked through it and it worked. That is the whole diagnosis: the
 * chips saved on the tap, the boxes saved on `change` — which a browser
 * fires when a box LOSES FOCUS — and being walked through it meant tapping
 * somewhere else, which blurred the box.
 *
 * So the test never blurs anything. It types into the box and then does what
 * a person does: nothing, then puts the phone away. The old code wrote
 * nothing at all in that story.
 *
 * Run: node tools/hqsend-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/hq', { recursive: true });
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/hq/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/hq/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const signup = () => p.evaluate(() => (window.__T.club || {})['signup__g1'] || null);
const travel = () => p.evaluate(() => (window.__T.club || {})['travel__g1'] || null);

await p.goto(BASE); await p.waitForTimeout(2400);
await p.evaluate(() => {
  const T = window.__T, UI = window.__UI;
  T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' }, stops: [],
    packages: [{ id: 'full', name: 'The lot', price: 2200, inc: ['Room', 'Golf'] }],
    rooms: [], vendors: [], deadlines: {} };
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'hq'; UI.modal = null; window.__forceRender();
});
await p.waitForTimeout(600);
await go('signStatus', { a: 'in' }); await p.waitForTimeout(500);

console.log('\n--- an answer typed, and the box never left ---');
const shirt = p.locator('[data-act="signField"][data-a="shirt"]');
await shirt.waitFor({ timeout: 8000 });
await shirt.click();
await shirt.type('XXL', { delay: 55 });
ok('the box holds what was typed', await shirt.inputValue(), 'XXL');
/* no blur, no tap elsewhere, no Enter: exactly what the three of them did */
await p.waitForTimeout(900);
ok('and the book has it without anyone tapping away', (await signup() || {}).shirt, 'XXL');

console.log('\n--- the phone is put away mid-answer ---');
const initials = p.locator('[data-act="signField"][data-a="initials"]');
await initials.click(); await initials.type('ND', { delay: 40 });
/* hidden before the pause is up: the write must still go */
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(350);
ok('what was half typed is written out', (await signup() || {}).initials, 'ND');
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(600);

console.log('\n--- two flight boxes in quick succession ---');
/* A travel document is written whole, so these have to become ONE write or
   the second is built on a copy of the book without the first in it. */
const fl = p.locator('[data-act="travelField"][data-a="out.flight"]');
const ld = p.locator('[data-act="travelField"][data-a="out.lands"]');
await fl.click(); await fl.type('BA275', { delay: 30 });
await ld.click(); await ld.type('15:40', { delay: 30 });
await p.waitForTimeout(900);
ok('both are kept, not just the later one', [((await travel() || {}).out || {}).flight, ((await travel() || {}).out || {}).lands], ['BA275', '15:40']);

console.log('\n--- the Send button ---');
const send = p.locator('[data-act="signSend"]');
ok('it is on the screen', await send.count(), 1);
ok('and says nothing has been sent', (await p.locator('.ss-state b').innerText()).toLowerCase(), 'not sent yet');
/* type into the LAST box and press Send without leaving it: the sweep has
   to catch the box the thumb is still in */
const nameOn = p.locator('[data-act="signField"][data-a="nameOn"]');
await nameOn.click(); await nameOn.type('Norberto III', { delay: 20 });
await send.click({ force: true }); await p.waitForTimeout(800);
ok('the box under the thumb went too', (await signup() || {}).nameOn, 'Norberto III');
ok('and the book marks it sent', typeof (await signup() || {}).sentAt, 'number');
ok('the line now says it is in', (await p.locator('.ss-state b').innerText()).startsWith('In the book'), true);
await p.locator('.signsend').screenshot({ path: S + '/hq/send.png' });

console.log('\n--- it survives a reload, which is what the commissioner sees ---');
await p.reload(); await p.waitForTimeout(2400);
await p.evaluate(() => { const UI = window.__UI; UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'hq'; window.__forceRender(); });
await p.waitForTimeout(700);
const after = await signup();
ok('every answer is still there', [after.shirt, after.initials, after.nameOn], ['XXL', 'ND', 'Norberto III']);

await ctx.close(); await b.close(); srv.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
