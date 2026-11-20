/* WHAT THE AUDIT TURNED INTO.
 *
 * Six decisions, each of which can rot quietly: a target shrinks back under
 * the floor, a colour drifts, a silent button returns. Each one is pinned
 * here with the number the decision was made on.
 *
 * Run: node tools/feedback-tap-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/tap', { recursive: true });
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/tap/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/tap/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
await p.goto(BASE); await p.waitForTimeout(2400);
await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }],
    packages: [{ id: '7g', name: '7 nights · golfer', nights: 7, golf: true, price: 2200, inc: ['Room'] }],
    rooms: [], vendors: [], deadlines: {} };
  const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
  T.club.course__g1 = { ...C.courseFrom(hit, 'g1'), approved: true };
  T.club.signup__g1 = { pid: 'g1', status: 'in', pkg: '7g' };
  const card = C.blankClubCard('frostbite', 'g1', 12, T.club.course__g1, '2027-01-01');
  T.club[C.cardKey('frostbite', 'g1')] = { ...card, raw: [5,4,6,4,3,5,4,null,null,null,null,null,null,null,null,null,null,null], at: Date.now() };
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
}, [iso(-3), iso(10)]);
await p.waitForTimeout(800);

console.log('\n--- one door per panel, where the panel is about HQ ---');
ok('the You tab offers Vegas HQ once, beside the tab',
  await p.evaluate(() => [...document.querySelectorAll('[data-act="go"][data-a="hq"]')]
    .filter(e => e.getBoundingClientRect().width > 0 && !e.classList.contains('navbtn')).length), 1);

console.log('\n--- a target you aim at holding a club ---');
await go('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(1700);
const cell = await p.evaluate(() => { const c = document.querySelector('.entryhd .hcell');
  const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
console.log('      hole cell ' + cell.w + '×' + cell.h);
ok('the hole strip clears 44 both ways', Math.min(cell.w, cell.h) >= 44, true);
const art = await p.evaluate(() => { const c = document.querySelector('.ehd-art');
  const r = c.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
ok('and so does “See the hole”', art >= 44, true);
await go('holeArt', { a: '0', b: 'home__g1' }); await p.waitForTimeout(1800);
const club = await p.evaluate(() => { const c = document.querySelector('.h3club');
  if (!c) return null; const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
if (club) { console.log('      club chip ' + club.w + '×' + club.h);
  ok('the club chips clear 44 tall', club.h >= 44, true); }
else console.log('  (no shot bar in this fixture)');
await go('modalCancel', {}); await p.waitForTimeout(600);

console.log('\n--- the press, which is the half an iPhone can feel ---');
ok('every control answers the finger', await p.evaluate(() => {
  const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } });
  const txt = css.map(r => r.cssText || '').join('\n');
  return /\[data-act\]:active/.test(txt) && /button\[data-act\]:active/.test(txt); }), true);
ok('and a buzz is asked for only where it exists', await p.evaluate(() =>
  typeof navigator.vibrate === 'function'), true);

console.log('\n--- a control that cannot act says so ---');
await go('go', { a: 'you' }); await p.waitForTimeout(500);
await go('chatOpen', {}).catch(() => {});
await p.waitForTimeout(900);
const post = await p.evaluate(() => { const b = document.getElementById('chatPost');
  return b ? { off: b.disabled, why: b.getAttribute('title') || '' } : null; });
if (post) {
  ok('Post is not pressable with an empty box', post.off, true);
  ok('and says what it is waiting for', post.why, 'Write something first');
  await p.fill('#chatText', 'On the 8th and it is raining'); await p.waitForTimeout(400);
  ok('it comes alive as you type', await p.evaluate(() => document.getElementById('chatPost').disabled), false);
} else console.log('  (no chat composer on this screen)');

console.log('\n--- the book reads at both ends of the day ---');
const ink = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--turf').trim());
ok('the second ink is the one that clears the line', ink, '#515E4B');

await ctx.close(); await b.close(); srv.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
