/* The player card: that a name opens it, that the figures on it are the ones
   the book's own functions give, and that the three things you can touch —
   the turn, a box in the last six, a point on the web — each do their own job
   and none of them does another's. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/pc', { recursive: true });
writeFileSync(S + '/pc/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/pc/index.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';

let bad = 0;
const ok = (name, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + name + '  got ' + JSON.stringify(got) +
    (want === undefined ? '' : '  want ' + JSON.stringify(want)));
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message)));
await p.goto(BASE);
await p.waitForTimeout(2500);

const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* Four closed stops, four golfers, every card finished and posted, so the
   handicap, the merit table and the head-to-heads all have something to say. */
const seeded = await p.evaluate(([d1, d2, d3, d4]) => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  const STOPS = [['s1', 'The First', d1], ['s2', 'The Second', d2], ['s3', 'The Third', d3], ['s4', 'The Fourth', d4]];
  T.club.season = {
    phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: STOPS.map(([id, name, from]) => ({ id, name, from, to: from, format: 'stableford', note: 'Eighteen at home.' })),
  };
  const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
  const WHO = ['g1', 'g2', 'g3', 'g4'];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const pid of WHO) {
    const course = { ...C.courseFrom(hit, pid), approved: true };
    T.club['course__' + pid] = course;
    for (const [sid] of STOPS) {
      const card = C.blankClubCard(sid, pid, 20, course);
      for (let h = 0; h < 18; h++) {
        const par = course.holes[h].par;
        card.raw[h] = Math.max(2, Math.min(par + 3, Math.round(par + 1 + (rnd() + rnd() - 1) * 2)));
      }
      card.done = true; card.at = Date.now();
      T.club[C.cardKey(sid, pid)] = card;
    }
  }
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null; UI.screen = 'season'; UI.seasonTab = 'merit';
  window.__forceRender();
  const st = C.playerStats(T, 'g1', new Date().toISOString().slice(0, 10));
  return { cards: st.cards, ready: st.ready, attrs: st.attrs ? st.attrs.length : 0,
    form: st.form.map(f => [f.pts, f.off]), h2h: st.h2h.length,
    hcp: st.hcp.playing, banker: st.banker ? st.banker.n : null, courses: st.courses.length };
}, [ago(60), ago(45), ago(30), ago(15)]);

console.log('--- the figures ---');
ok('four cards count', seeded.cards, 4);
ok('four is enough for the web', seeded.ready, true);
ok('five attributes', seeded.attrs, 5);
ok('every round carries what it was off the handicap',
  seeded.form.every(([pts, off]) => off === pts - 36), true);
ok('three other golfers to be measured against', seeded.h2h, 3);
ok('a union handicap once the cards are in', typeof seeded.hcp === 'number', true);
ok('one course, so the banker hole means something', seeded.courses, 1);
ok('and it found one', typeof seeded.banker === 'number', true);

console.log('--- opening it ---');
await p.evaluate(() => { const n = document.querySelector('.pname'); if (n) n.click(); });
await p.waitForTimeout(600);
const opened = await p.evaluate(() => {
  const m = document.querySelector('.pcmodal');
  if (!m) return { there: false };
  const f = document.querySelector('.pc-front'), bk = document.querySelector('.pc-back');
  return { there: true, kind: window.__UI.modal && window.__UI.modal.kind,
    name: (document.querySelector('.pc-hd h3') || {}).textContent,
    boxes: document.querySelectorAll('.pc-box').length,
    points: document.querySelectorAll('.pc-pt').length,
    frontShown: getComputedStyle(f).backfaceVisibility === 'hidden',
    backTurned: getComputedStyle(bk).transform.indexOf('matrix3d') === 0,
    wide: m.scrollWidth <= m.clientWidth + 1 };
});
ok('the window is a player card', opened.kind, 'pcard');
ok('with the name on it', !!opened.name, true);
ok('six boxes in the last six', opened.boxes, 4);   // four cards so far, so four boxes
ok('five points on the web', opened.points, 5);
ok('the back is turned away', opened.backTurned, true);
ok('nothing runs off the side', opened.wide, true);

console.log('--- a box in the last six ---');
const box = await p.evaluate(() => {
  const b0 = document.querySelector('.pc-box');
  const before = b0.textContent;
  b0.click();
  const after = b0.textContent;
  return { before, after, off: b0.classList.contains('off'),
    flipped: document.querySelector('.pc-flip').classList.contains('on'),
    state: !!(window.__UI.modal.off && window.__UI.modal.off[0]) };
});
ok('the box changes what it says', box.before !== box.after, true);
ok('and says it is off the handicap now', /off hcp/.test(box.after), true);
ok('tapping a box does NOT turn the card', box.flipped, false);
ok('the window remembers the box', box.state, true);

console.log('--- turning it over ---');
await p.evaluate(() => document.querySelector('.pc-front .pc-turn').click());
await p.waitForTimeout(800);
ok('the card is on its back', await p.evaluate(() => document.querySelector('.pc-flip').classList.contains('on')), true);

console.log('--- a point on the web ---');
const pt = await p.evaluate(() => {
  const g = document.querySelector('.pc-back .pc-pt');
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const cap = document.querySelector('.pc-cap');
  return { cap: cap.textContent.trim(), on: g.classList.contains('on'),
    stillBack: document.querySelector('.pc-flip').classList.contains('on'),
    k: g.dataset.k, v: g.dataset.v };
});
ok('the point lights up', pt.on, true);
ok('and the line underneath names it', pt.cap.indexOf(pt.k) === 0, true);
ok('with its figure', pt.cap.indexOf(pt.v) > 0, true);
ok('touching a point does NOT turn the card back', pt.stillBack, true);

console.log('--- a redraw must not undo any of it ---');
const kept = await p.evaluate(() => {
  window.__forceRender();
  return { back: document.querySelector('.pc-flip').classList.contains('on'),
    off: document.querySelector('.pc-box').classList.contains('off'),
    lit: !!document.querySelector('.pc-pt.on') };
});
ok('still on its back', kept.back, true);
ok('the box is still turned', kept.off, true);
ok('the point is still lit', kept.lit, true);

console.log('--- somebody with no cards ---');
const empty = await p.evaluate(() => {
  const T = window.__T, UI = window.__UI;
  for (const k of Object.keys(T.club)) if (k.indexOf('card__') === 0 && k.indexOf('__g2') > 0) delete T.club[k];
  UI.modal = { kind: 'pcard', pid: 'g2', back: false, off: {}, pt: null };
  window.__forceRender();
  return { there: !!document.querySelector('.pcmodal'),
    points: document.querySelectorAll('.pc-pt').length,
    says: (document.querySelector('.pc-cap') || {}).textContent || '',
    verd: (document.querySelector('.pc-verd p') || {}).textContent || '' };
});
ok('the card still opens', empty.there, true);
ok('no web without the cards for one', empty.points, 0);
ok('and it says how many more are wanted', /more card/.test(empty.says), true);
ok('the caddie keeps his counsel', /counsel/.test(empty.verd), true);

await p.screenshot({ path: S + '/pc/empty.png' });
await ctx.close();
await b.close();
srv.close();

if (errs.length) { bad += errs.length; console.log('PAGE ERRORS: ' + errs.join(' | ')); }
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
