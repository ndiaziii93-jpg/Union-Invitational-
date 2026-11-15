/* Many cards, not one: the competing round that is the stop's, and the
   handicap round that is nobody's but yours. That the choice is made before
   a hole is written, that a short round still counts for the number while a
   very short one honestly does not, and that no handicap round ever reaches
   the board. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as C from '../src/club.js';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/rd', { recursive: true });

let bad = 0;
const ok = (name, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + name + '  got ' + JSON.stringify(got) +
    (want === undefined ? '' : '  want ' + JSON.stringify(want)));
};

/* ---------- the maths, straight out of the module ---------- */
console.log('--- nine holes and eighteen on one axis ---');
const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4, 4, 3, 5];
const SIS  = [3, 11, 17, 7, 1, 9, 15, 5, 13, 4, 2, 12, 18, 8, 10, 6, 16, 14];
const course = { name: 'Home', tee: 'Yellow', holes: PARS.map((par, i) => ({ par, si: SIS[i], y: 380 })) };
const made = (hcp, n, over) => { const c = C.blankClubCard('s1', 'g1', hcp, course, '2027-03-01');
  for (let i = 0; i < n; i++) c.raw[i] = PARS[i] + over; c.done = true; return c; };

const full = made(20, 18, 1), half = made(20, 9, 1), stub = made(20, 8, 1);
ok('eighteen holes is unchanged: the handicap plus what it fell short of 36',
  C.diffOf(full), Math.round((20 + (36 - C.cardTotals(full).pts)) * 10) / 10);
ok('nine holes returns a number too', typeof C.diffOf(half), 'number');
ok('and eight does not', C.diffOf(stub), null);
ok('the floor is nine', C.HCP_MIN_HOLES, 9);
/* A round played exactly to the handicap is worth two points a hole whatever
   its length, so its differential must be the handicap itself either way. */
const level = n => { const c = C.blankClubCard('s1', 'g1', 0, course, '2027-03-01');
  for (let i = 0; i < n; i++) c.raw[i] = PARS[i]; c.done = true; return c; };
ok('a scratch round played to par is a differential of 0, at nine holes and at eighteen',
  [C.diffOf(level(18)), C.diffOf(level(9))], [0, 0]);

console.log('--- the rid is the day and four characters ---');
let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const rid = C.newRid('2027-03-14', rnd);
ok('shaped as the server will insist', /^[0-9]{8}-[a-z0-9]{4}$/.test(rid), true);
ok('two on one day are two different rounds', C.newRid('2027-03-14', rnd) !== rid, true);

/* ---------- and in the app ---------- */
writeFileSync(S + '/rd/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/rd/index.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message)));
await p.goto(BASE);
await p.waitForTimeout(2500);

const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: 'Eighteen at home.' }],
    packages: [] };
  const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
  for (const pid of ['g1', 'g2']) T.club['course__' + pid] = { ...Cl.courseFrom(hit, pid), approved: true };
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null; UI.screen = 'you';
  window.__forceRender();
}, [iso(-3), iso(10)]);
await p.waitForTimeout(500);

console.log('--- the You tab offers a round, and asks what kind ---');
ok('there is a way to start one', await p.locator('[data-act="roundNew"]').count(), 1);
await act('roundNew', { a: 'frostbite' }); await p.waitForTimeout(400);
const asked = await p.evaluate(() => ({
  kind: window.__UI.modal && window.__UI.modal.kind,
  comp: document.querySelectorAll('.nr[data-a="comp"]').length,
  hcp: document.querySelectorAll('.nr[data-a="hcp"]').length,
  says: (document.querySelector('.mb-s') || {}).textContent || '' }));
ok('the window asks before anything is written', asked.kind, 'newround');
ok('with both kinds on it', [asked.comp, asked.hcp], [1, 1]);
ok('and says the choice cannot be changed later', /cannot be changed/.test(asked.says), true);

console.log('--- a handicap round: nine holes, posted ---');
await act('roundGo', { a: 'hcp' }); await p.waitForTimeout(400);
const started = await p.evaluate(() => ({ screen: window.__UI.screen, kind: window.__UI.roundKind,
  rid: window.__UI.rid, rows: Object.keys(window.__T.club).filter(k => k.indexOf('hcard__') === 0).length,
  head: (document.querySelector('.head') || {}).textContent || '',
  kicker: (document.querySelector('.kicker') || {}).textContent || '' }));
ok('it opens the entry screen as a handicap round', [started.screen, started.kind], ['clubentry', 'hcp']);
ok('with a rid shaped for the server', /^[0-9]{8}-[a-z0-9]{4}$/.test(started.rid), true);
ok('nothing is written until a score lands on it', started.rows, 0);
ok('and the screen says plainly what it is', [/handicap round/i.test(started.head), /not for the board/.test(started.kicker)], [true, true]);

const score = async (i, v) => { await p.evaluate(i => { window.__UI.clubHole = i; }, i); await act('clubScore', { a: String(v) }); };
const pars = await p.evaluate(() => window.__T.club.course__g1.holes.map(h => h.par));
for (let i = 0; i < 9; i++) await score(i, pars[i] + 1);
await p.waitForTimeout(400);
const nine = await p.evaluate(() => {
  const T = window.__T, rid = window.__UI.rid;
  const c = T.club['hcard__g1__' + rid];
  return { there: !!c, kind: c && c.kind, date: c && c.date, pid: c && c.pid,
    thru: window.__C.cardTotals(c).thru, raw18: Array.isArray(c.raw) && c.raw.length === 18,
    panel: !!document.querySelector('#cardDone'),
    post: document.querySelectorAll('[data-act="clubPost"]').length };
});
ok('the round is written under its own key', [nine.there, nine.kind, nine.pid], [true, 'hcp', 'g1']);
ok('carrying the day it was played', /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(nine.date), true);
ok('eighteen boxes long, as the server insists, with nine filled', [nine.raw18, nine.thru], [true, 9]);
ok('and it offers to post at nine, with no photograph demanded', [nine.panel, nine.post], [true, 1]);

await act('clubPost'); await p.waitForTimeout(400);
const posted = await p.evaluate(() => {
  const T = window.__T, rid = window.__UI.rid, today = new Date().toISOString().slice(0, 10);
  const c = T.club['hcard__g1__' + rid];
  return { done: !!c.done, counts: window.__C.countsForHcp({ card: c }),
    n: window.__C.unionHcp(T, 'g1', today).n,
    board: window.__C.stopBoard(T, 'frostbite').length,
    merit: window.__C.merit(T, today).length,
    toast: String(window.__UI.toast || '') };
});
ok('it posts', posted.done, true);
ok('it counts towards the handicap', [posted.counts, posted.n], [true, 1]);
ok('and the toast says so', /counts towards your handicap/.test(posted.toast), true);
ok('but it is on no board and pays no merit', [posted.board, posted.merit], [0, 0]);

console.log('--- a second round the same day, and a short one ---');
await act('roundNew', { a: 'frostbite' }); await p.waitForTimeout(300);
await act('roundGo', { a: 'hcp' }); await p.waitForTimeout(300);
const rid2 = await p.evaluate(() => window.__UI.rid);
for (let i = 0; i < 6; i++) await score(i, pars[i] + 1);
await p.waitForTimeout(300);
const short = await p.evaluate(() => ({
  words: (document.querySelector('#cardDone p') || {}).textContent || '',
  post: document.querySelectorAll('[data-act="clubPost"]').length }));
ok('six holes still offers to post', short.post, 1);
ok('and says honestly that it will not move the handicap', /will not move your handicap/.test(short.words), true);
await act('clubPost'); await p.waitForTimeout(400);
const after = await p.evaluate(([rid2]) => {
  const T = window.__T, today = new Date().toISOString().slice(0, 10);
  const st = window.__C.playerStats(T, 'g1', today);
  return { rows: Object.keys(T.club).filter(k => k.indexOf('hcard__g1__') === 0).length,
    two: !!T.club['hcard__g1__' + rid2],
    n: window.__C.unionHcp(T, 'g1', today).n,
    cards: st.cards, posted: st.posted, short: st.short, holes: st.counts.holes };
}, [rid2]);
ok('two rounds on one day are two rows', [after.rows, after.two], [2, true]);
ok('the short one does not move the handicap', after.n, 1);
ok('the player card counts one round, and two posted', [after.cards, after.posted, after.short], [1, 2, 1]);
ok('but every hole of both feeds the figures', after.holes, 15);

console.log('--- the competing card is still the stop’s, on the old terms ---');
await act('roundNew', { a: 'frostbite' }); await p.waitForTimeout(300);
await act('roundGo', { a: 'comp' }); await p.waitForTimeout(400);
ok('declaring it competing opens the stop’s own card',
  await p.evaluate(() => [window.__UI.roundKind, window.__UI.stopId, window.__UI.screen]),
  ['comp', 'frostbite', 'clubentry']);
for (let i = 0; i < 18; i++) await score(i, pars[i] + 1);
await p.waitForTimeout(400);
const comp = await p.evaluate(() => ({
  key: !!window.__T.club.card__frostbite__g1,
  thru: window.__C.cardTotals(window.__T.club.card__frostbite__g1).thru,
  post: document.querySelectorAll('[data-act="clubPost"]').length,
  photoIn: document.querySelectorAll('input[data-act="cardPhoto"]').length }));
ok('it writes to the stop’s key, not a round of its own', comp.key, true);
ok('eighteen in', comp.thru, 18);
ok('and there is no Post until the signed card is photographed', [comp.post, comp.photoIn], [0, 1]);

console.log('--- and it does not ask twice ---');
await act('go', { a: 'you' }); await p.waitForTimeout(300);
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(400);
ok('a card already under way is carried on without being asked again',
  await p.evaluate(() => [window.__UI.modal, window.__UI.screen, window.__UI.roundKind]),
  [null, 'clubentry', 'comp']);

console.log('--- the rounds are listed where you started them ---');
await act('go', { a: 'you' }); await p.waitForTimeout(400);
const list = await p.evaluate(() => ({
  rows: document.querySelectorAll('.rlist .rrow').length,
  tags: [...document.querySelectorAll('.rr-t')].map(x => x.textContent.trim()) }));
ok('every round is on the You tab', list.rows, 3);
ok('each saying whether it counted', list.tags, ['unfinished', 'too short', 'counts']);

await p.screenshot({ path: S + '/rd/you.png', fullPage: true });
await ctx.close();
await b.close();
srv.close();

if (errs.length) { bad += errs.length; console.log('PAGE ERRORS: ' + errs.join(' | ')); }
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
