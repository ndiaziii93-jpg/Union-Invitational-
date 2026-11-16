/* The You tab carries your own player card: that it is there at all, that it
   draws the Bert you chose with your face in it, that the figures on it are
   the book's own and not a second set, and that both doors work — one into
   the card to read it, one into the look to change it. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as C from '../src/club.js';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/yc', { recursive: true });

let bad = 0;
const ok = (name, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + name + '  got ' + JSON.stringify(got) +
    (want === undefined ? '' : '  want ' + JSON.stringify(want)));
};

writeFileSync(S + '/yc/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/yc/index.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message)));
await p.goto(BASE);
await p.waitForTimeout(2500);

const FACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* Three closed stops, every card in, so the handicap, the merit table and the
   count all have something to say and the figures can be checked against the
   book's own functions rather than against themselves. */
const seeded = await p.evaluate(([ds, face]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  const STOPS = [['mulligan', 'The Merry Mulligan Open'], ['frostbite', 'The Frostbite Open'],
    ['sweetheart', 'The Sweetheart Scramble']].map(([id, name], i) => ({
    id, name, from: ds[i], to: ds[i], format: 'stableford', note: 'Eighteen at home.' }));
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' }, stops: STOPS, packages: [] };
  const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
  let sd = 5; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const who = Cl.golfersOf ? null : null;
  ['g1', 'g2', 'g3'].forEach(pid => {
    const course = { ...Cl.courseFrom(hit, pid), approved: true };
    T.club['course__' + pid] = course;
    for (const st of STOPS) {
      const card = Cl.blankClubCard(st.id, pid, 20, course);
      for (let i = 0; i < 18; i++) { const par = course.holes[i].par;
        card.raw[i] = Math.max(2, Math.min(par + 3, Math.round(par + 1.1 + (rnd() + rnd() - 1) * 2))); }
      card.done = true; card.at = Date.now();
      T.club[Cl.cardKey(st.id, pid)] = card;
    }
  });
  T.club.profile__g1 = { pid: 'g1', bert: 'frostbite', face: { url: face, x: 40, y: 30, zoom: 180, at: 1 } };
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null; UI.screen = 'you';
  window.__forceRender();
  const today = new Date().toISOString().slice(0, 10);
  const st = Cl.playerStats(T, 'g1', today);
  return { cards: st.cards, ready: st.ready, hcp: Cl.unionHcp(T, 'g1', today).hcp,
    pos: (Cl.merit(T, today).find(r => r.pid === 'g1') || {}).pos || null,
    bert: Cl.bertOf(T, 'g1').name };
}, [[ago(90), ago(60), ago(30)], FACE]);
await p.waitForTimeout(600);

console.log('--- it is on the You tab ---');
const blk = await p.evaluate(() => {
  const y = document.querySelector('.yc');
  if (!y) return { there: false };
  const line = y.closest('.cline');
  return { there: true,
    kicker: (line.querySelector('.ck') || {}).textContent || '',
    name: (y.querySelector('.yc-w b') || {}).textContent || '',
    smalls: [...y.querySelectorAll('.yc-w small')].map(s => s.textContent.trim()),
    figures: document.querySelectorAll('.yc .av img').length,
    faces: document.querySelectorAll('.yc .av-mug').length,
    acts: [...(line.querySelectorAll('.yc-acts button') || [])].map(b => b.dataset.act) };
});
ok('the You tab carries a player card block', blk.there, true);
ok('under its own heading', blk.kicker, 'Your player card');
ok('with my name on it, not the costume’s', blk.name, 'Norberto III');
ok('it draws a Bert', blk.figures, 1);
ok('with my face in the ball, because I put one there', blk.faces, 1);
ok('and two doors: read it, or change it', blk.acts, ['pcard', 'lookOpen']);

console.log('--- the figures are the book’s own ---');
ok('the Union handicap as the book has it',
  blk.smalls[0].indexOf(seeded.hcp == null ? 'No Union handicap yet' : 'Union ' + seeded.hcp) >= 0, true);
ok('the count of cards in', blk.smalls[0].indexOf(seeded.cards + ' card') >= 0, true);
ok('and where I stand on merit', blk.smalls[0].indexOf('on merit') >= 0, seeded.pos != null);
ok('it names the Bert I chose', blk.smalls[1].indexOf(seeded.bert) === 0, true);
ok('and says the photograph is in', /face in the ball/.test(blk.smalls[1]), true);
ok('three cards is enough, so the web is drawn', /drawn from your own cards/.test(blk.smalls[2]), seeded.ready);

console.log('--- the door into the card ---');
await p.evaluate(() => document.querySelector('.yc-acts [data-act="pcard"]').click());
await p.waitForTimeout(500);
const card = await p.evaluate(() => ({
  kind: window.__UI.modal && window.__UI.modal.kind,
  pid: window.__UI.modal && window.__UI.modal.pid,
  there: !!document.querySelector('.pcmodal'),
  look: !!document.querySelector('.pc-look') }));
ok('it opens a player card', [card.kind, card.there], ['pcard', true]);
ok('and it is mine', card.pid, 'g1');
ok('so the way in to the look is on it too', card.look, true);

console.log('--- the door into the look ---');
await p.evaluate(() => { window.__UI.modal = null; window.__forceRender();
  document.querySelector('.yc-acts [data-act="lookOpen"]').click(); });
await p.waitForTimeout(500);
const look = await p.evaluate(() => ({
  kind: window.__UI.modal && window.__UI.modal.kind,
  bert: window.__UI.look && window.__UI.look.bert,
  choices: document.querySelectorAll('.lk-b').length }));
ok('the look picker opens straight from the You tab', look.kind, 'look');
ok('standing on the Bert I am already wearing', look.bert, 'frostbite');
ok('with every costume in it', look.choices, C.BERTS.length);

console.log('--- somebody with no cards and no photograph ---');
const bare = await p.evaluate(() => {
  const T = window.__T, UI = window.__UI;
  for (const k of Object.keys(T.club)) if (k.indexOf('card__') === 0 && k.indexOf('__g1') > 0) delete T.club[k];
  delete T.club.profile__g1;
  UI.modal = null; UI.look = null; UI.screen = 'you';
  window.__forceRender();
  const y = document.querySelector('.yc');
  return { there: !!y, faces: document.querySelectorAll('.yc .av-mug').length,
    figures: document.querySelectorAll('.yc .av img').length,
    smalls: y ? [...y.querySelectorAll('.yc-w small')].map(s => s.textContent.trim()) : [] };
});
ok('the block is still there with nothing posted', bare.there, true);
ok('and says plainly that no card is in, not “0 cards in”', /no cards yet/.test(bare.smalls[0]), true);
ok('the house Bert stands in', bare.figures, 1);
ok('and no face is put on him uninvited', bare.faces, 0);
ok('it says no photograph is in it yet', /no photograph in it yet/.test(bare.smalls[1]), true);
ok('and how many more cards the web wants', /web fills in after 3 more cards/.test(bare.smalls[2]), true);

/* The Clubhouse goes two columns on an iPad, and the block is narrow there.
   A flex row dropped the buttons into a ragged stack, and 17px of padding
   either side wrapped "Change my look" onto a second line. Both are checked
   at the width that broke them, not only on the phone. */
console.log('--- and in the narrow column an iPad gives it ---');
await p.setViewportSize({ width: 834, height: 1112 });
await p.waitForTimeout(400);
const two = await p.evaluate(() => {
  const bs = [...document.querySelectorAll('.yc-acts button')];
  const r = bs.map(b => b.getBoundingClientRect());
  return { sameRow: Math.abs(r[0].top - r[1].top) < 2,
    sameWidth: Math.abs(r[0].width - r[1].width) < 2,
    oneLine: bs.every(b => b.getBoundingClientRect().height < 58),
    column: Math.round(r[0].width + r[1].width) };
});
ok('both buttons sit on one row', two.sameRow, true);
ok('and are the same width as each other', two.sameWidth, true);
ok('with neither label wrapped onto a second line', two.oneLine, true);

await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);

/* SIX PEOPLE READ "waiting for signal", believed the book had their
   answers and walked away. When this phone is holding writes the server
   would not take, the You tab has to say so where the eye lands. */
console.log('--- when the book has not got your answers ---');
const heldOn = await p.evaluate(() => {
  window.__meta.pinHeld = 2;
  window.__UI.modal = null; window.__UI.screen = 'you';
  window.__forceRender();
  const b = document.querySelector('.cline.held');
  return { there: !!b,
    says: b ? b.querySelector('.ct').textContent.trim() : '',
    lost: b ? /Nothing is lost/.test(b.textContent) : false,
    act: b ? (b.querySelector('button') || {}).dataset?.act : '',
    first: !!document.querySelector('.clubgrid > .cline.held:first-child') };
});
ok('the You tab says so, not just the foot', heldOn.there, true);
ok('and says how many', /2 things you entered have/.test(heldOn.says), true);
ok('that nothing is lost', heldOn.lost, true);
ok('with the one button that fixes it', heldOn.act, 'whoPick');
ok('at the top, above everything else', heldOn.first, true);
ok('and it is gone when nothing is held', await p.evaluate(() => {
  window.__meta.pinHeld = 0; window.__forceRender();
  return document.querySelectorAll('.cline.held').length; }), 0);

console.log('--- nothing runs off the side ---');
ok('the block fits the phone', await p.evaluate(() => {
  const y = document.querySelector('.yc').closest('.cline');
  return y.scrollWidth <= y.clientWidth + 1; }), true);

await p.screenshot({ path: S + '/yc/you.png', fullPage: true });
await ctx.close();
await b.close();
srv.close();

if (errs.length) { bad += errs.length; console.log('PAGE ERRORS: ' + errs.join(' | ')); }
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
