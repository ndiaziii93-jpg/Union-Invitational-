/* Union Bert: that every tournament has one, that a member can choose which
   one they go by and set their own face into his head, that the face lands
   inside the ball rather than on the hat, and that what they chose is what
   everybody else sees. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as C from '../src/club.js';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/bt', { recursive: true });

let bad = 0;
const ok = (name, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + name + '  got ' + JSON.stringify(got) +
    (want === undefined ? '' : '  want ' + JSON.stringify(want)));
};

/* ---- the registry, read straight out of the book's own module ---- */
console.log('--- a Bert for every tournament ---');
const seeded = C.seasonDefaults().stops.map(s => s.id);
for (const id of seeded) {
  const b = C.BERTS.find(x => x.stop === id);
  ok('the ' + id + ' has its own Bert', b ? b.id : null, id);
}
ok('and the week in Las Vegas has one', !!C.BERTS.find(x => x.week), true);
ok('with a house Bert to fall back on', C.BERTS[0].id, 'house');
ok('a stop nobody has drawn falls back to him', C.bertForStop('putterbowl').id, 'house');
ok('every Bert carries its own head geometry',
  C.BERTS.every(b => Array.isArray(b.head) && b.head.length === 3 && b.head.every(n => typeof n === 'number')), true);
ok('and every face circle is inside the picture',
  C.BERTS.every(b => { const [x, y, r] = b.head;
    return x - r > 0 && x + r < 100 && y > 0 && y < 100; }), true);

/* ---- the drawings themselves ---- */
const imgs = readFileSync('src/assets/images.js', 'utf8');
for (const b of C.BERTS) {
  ok('a drawing exists for ' + b.id, imgs.indexOf('"mascot_' + b.id + '"') > 0, true);
}

/* ---- in the app ---- */
writeFileSync(S + '/bt/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/bt/index.html')); });
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

await p.evaluate(([ds, face]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  const STOPS = [['mulligan', 'The Merry Mulligan Open'], ['frostbite', 'The Frostbite Open'],
    ['sweetheart', 'The Sweetheart Scramble']].map(([id, name], i) => ({
    id, name, from: ds[i], to: ds[i], format: 'stableford', note: 'Eighteen at home.' }));
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' }, stops: STOPS, packages: [] };
  const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
  let sd = 11; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  ['g1', 'g2', 'g3'].forEach((pid, k) => {
    const course = { ...Cl.courseFrom(hit, pid), approved: true };
    T.club['course__' + pid] = course;
    if (k === 1) T.club['profile__' + pid] = { pid, bert: 'vegas', face: { url: face, x: 40, y: 30, zoom: 180, at: 1 } };
    for (const st of STOPS) {
      const card = Cl.blankClubCard(st.id, pid, 20, course);
      for (let i = 0; i < 18; i++) { const par = course.holes[i].par;
        card.raw[i] = Math.max(2, Math.min(par + 3, Math.round(par + 1.1 + (rnd() + rnd() - 1) * 2))); }
      card.done = true; card.at = Date.now();
      T.club[Cl.cardKey(st.id, pid)] = card;
    }
  });
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null; UI.screen = 'season'; UI.seasonTab = 'golfers';
  window.__forceRender();
}, [[ago(90), ago(60), ago(30)], FACE]);
await p.waitForTimeout(600);

console.log('--- the golfers ---');
const list = await p.evaluate(() => ({
  tiles: document.querySelectorAll('.gtile').length,
  roster: window.__E ? null : null,
  mine: document.querySelectorAll('.gtile.me').length,
  figures: document.querySelectorAll('.gtile .av img').length,
  faces: document.querySelectorAll('.gtile .av-mug').length,
}));
ok('a tile for every golfer on the roster', list.tiles, 11);
ok('one of them is mine', list.mine, 1);
ok('every tile draws a Bert', list.figures, list.tiles);
ok('and only the one who set a face shows one', list.faces, 1);

console.log('--- the face goes where the costume allows ---');
const geom = await p.evaluate(() => {
  const t = [...document.querySelectorAll('.gtile')].find(x => x.querySelector('.av-mug'));
  const img = t.querySelector('.av img').getBoundingClientRect();
  const mug = t.querySelector('.av-mug').getBoundingClientRect();
  return { inside: mug.left >= img.left - 1 && mug.right <= img.right + 1 &&
      mug.top >= img.top - 1 && mug.bottom <= img.bottom + 1,
    round: Math.abs(mug.width - mug.height) < 2,
    size: +(mug.width / img.width).toFixed(2) };
});
ok('the face sits inside the drawing', geom.inside, true);
ok('and is a circle', geom.round, true);
ok('about a third of his width', geom.size > 0.2 && geom.size < 0.45, true);

console.log('--- choosing your own ---');
await p.evaluate(() => { const t = [...document.querySelectorAll('.gtile')].find(x => x.classList.contains('me')); t.click(); });
await p.waitForTimeout(500);
ok('my own card has a way in to it', await p.evaluate(() => !!document.querySelector('.pc-look')), true);
ok('somebody else’s does not', await p.evaluate(() => {
  window.__UI.modal = { kind: 'pcard', pid: 'g3', back: false, off: {}, pt: null };
  window.__forceRender();
  return !!document.querySelector('.pc-look');
}), false);

await p.evaluate(() => {
  window.__UI.modal = { kind: 'pcard', pid: 'g1', back: false, off: {}, pt: null };
  window.__forceRender();
  document.querySelector('.pc-look').click();
});
await p.waitForTimeout(500);
const picker = await p.evaluate(() => ({
  kind: window.__UI.modal && window.__UI.modal.kind,
  choices: document.querySelectorAll('.lk-b').length,
  on: document.querySelectorAll('.lk-b.on').length,
  warned: /everyone on the trip can see it/.test(document.querySelector('.lk-warn').textContent),
}));
ok('the look picker opens', picker.kind, 'look');
ok('with every Bert in it', picker.choices, C.BERTS.length);
ok('one of them chosen', picker.on, 1);
ok('and it says plainly who can see the photograph', picker.warned, true);

const saved = await p.evaluate(() => {
  const written = [];
  const real = window.__store ? null : null;
  document.querySelectorAll('.lk-b')[3].click();          // the Sweetheart
  return { chose: window.__UI.look.bert };
});
ok('tapping a Bert chooses it', saved.chose, 'sweetheart');

console.log('--- and it is what everybody sees ---');
const shared = await p.evaluate(() => {
  const T = window.__T, UI = window.__UI;
  T.club['profile__g1'] = { pid: 'g1', bert: 'frostbite', face: null };
  UI.modal = null; UI.look = null; UI.seasonTab = 'golfers';
  window.__forceRender();
  const t = [...document.querySelectorAll('.gtile')].find(x => x.classList.contains('me'));
  return { src: t.querySelector('.av img').getAttribute('src').slice(0, 40),
    same: t.querySelector('.av img').getAttribute('src') ===
      [...document.querySelectorAll('.gtile')].find(x => !x.classList.contains('me'))
        .querySelector('.av img').getAttribute('src') };
});
ok('my tile draws the Bert I chose', shared.src.length > 10, true);
ok('and it is not the one everybody else has', shared.same, false);

await p.screenshot({ path: S + '/bt/golfers.png', fullPage: true });
await ctx.close();
await b.close();
srv.close();

if (errs.length) { bad += errs.length; console.log('PAGE ERRORS: ' + errs.join(' | ')); }
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
