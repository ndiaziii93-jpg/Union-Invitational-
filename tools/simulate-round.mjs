/* A ROUND, PLAYED.
 *
 * The book had no tournament in it. Every crawl walked screens that were
 * empty, which is why the agents kept reporting controls as dead when they
 * were only idle, and why a real defect on the week's entry setup had to be
 * found by reading the code instead.
 *
 * So this plays one. A field of twelve with handicaps, half of them at
 * Leatherhead and half at Lakewood, a stop open, and a round written hole
 * by hole through the book's own score entry — not poked into the store,
 * but entered the way a person enters it, so what it proves is that the
 * path works and not merely that the data fits.
 *
 * It leaves the book full, so anything run after it has a tournament to
 * look at. --keep writes the finished book out for the other agents.
 *
 * Run: node tools/simulate-round.mjs [--holes 18] [--shots] [--keep]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const HOLES = Math.max(1, Math.min(18, +arg('--holes', 18)));
const KEEP = process.argv.includes('--keep');
mkdirSync(S + '/sim', { recursive: true });
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

writeFileSync(S + '/sim/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/sim/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* THE FIELD. Twelve, with handicaps that spread the way a real society's
   do, and two home courses between them — the English half at Leatherhead,
   the California half at Lakewood, which is the whole point of a book that
   lets a stop be played wherever you are. */
const FIELD = [
  { id: 'g1',  name: 'Norberto III',   hcp: 12, course: 'leatherhead',    div: 'men' },
  { id: 'g2',  name: 'Matt',           hcp: 8,  course: 'leatherhead',    div: 'men' },
  { id: 'g3',  name: 'Doc',            hcp: 18, course: 'leatherhead',    div: 'men' },
  { id: 'g4',  name: 'Brian',          hcp: 21, course: 'leatherhead',    div: 'men' },
  { id: 'g5',  name: 'Letty',          hcp: 24, course: 'leatherhead-red', div: 'women' },
  { id: 'g6',  name: 'Jen',            hcp: 16, course: 'leatherhead-red', div: 'women' },
  { id: 'g7',  name: 'Norberto Jr.',   hcp: 5,  course: 'lakewood-white', div: 'men' },
  { id: 'g8',  name: 'Carlos',         hcp: 14, course: 'lakewood-white', div: 'men' },
  { id: 'g9',  name: 'Rey',            hcp: 9,  course: 'lakewood-blue',  div: 'men' },
  { id: 'g10', name: 'Tony',           hcp: 27, course: 'lakewood-white', div: 'men' },
  { id: 'g11', name: 'Maria',          hcp: 20, course: 'lakewood-silver', div: 'women' },
  { id: 'g12', name: 'Sam',            hcp: 11, course: 'lakewood-white', div: 'men' },
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 140)));
await p.goto(BASE); await p.waitForTimeout(2500);

console.log('\n=== the field takes the tee ===');
const seeded = await p.evaluate(([field, from, to]) => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford',
      note: 'Eighteen at your own place, wherever that is.' }],
    packages: [{ id: '7g', name: '7 nights · golfer', nights: 7, golf: true, price: 2200, inc: ['Room', 'Golf'] }],
    rooms: [], vendors: [], deadlines: { deposit: '2027-03-31', balance: '2027-08-03' } };
  /* a roster the book believes in */
  T.config.people = field.map(f => ({ id: f.id, name: f.name, display: f.name, role: 'golfer', division: f.div, band: f.hcp }));
  /* EVERY CARD LOOKED UP BEFORE ANY IS WRITTEN. The library folds a course
     somebody already has into the list in place of the published entry, so
     the moment the first player is given Leatherhead the id "leatherhead"
     stops resolving and the other three get nothing. Resolve once, then
     hand them out. */
  const lib = {};
  for (const c of C.courseLibrary(T)) lib[c.id] = c;
  const missing = [];
  for (const f of field) {
    const hit = lib[f.course];
    if (!hit) { missing.push(f.course); continue; }
    T.club['course__' + f.id] = { ...C.courseFrom(hit, f.id), approved: true };
    T.club['signup__' + f.id] = { pid: f.id, status: 'in', pkg: '7g', golf: 'all' };
  }
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null;
  window.__forceRender();
  return { people: T.config.people.length, courses: field.filter(f => T.club['course__' + f.id]).length, missing };
}, [FIELD, iso(-2), iso(12)]);
await p.waitForTimeout(800);
ok('twelve on the roster', seeded.people, 12);
ok('every one with a home course', seeded.courses, 12);
ok('and no course in the field is unknown to the book', seeded.missing, []);

/* ---- the eleven others play their rounds, written straight to their cards ---- */
console.log('\n=== eleven cards come in ===');
const written = await p.evaluate(([field, holes]) => {
  const T = window.__T, C = window.__C;
  /* A seeded shuffle so the same field gives the same tournament: a board
     that changes every run proves nothing twice. */
  let s = 20271114;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let n = 0;
  for (const f of field.slice(1)) {
    const course = T.club['course__' + f.id];
    const card = C.blankClubCard('frostbite', f.id, f.hcp, course, '2027-01-01');
    const raw = Array(18).fill(null);
    for (let h = 0; h < holes; h++) {
      const par = course.holes[h].par;
      /* A HANDICAP IS A PREDICTION, SO THE FIXTURE HAD BETTER HONOUR IT.
         The first cut gave everybody scores around par whatever their
         handicap, and a 27 shooting level par scores sixty-three points and
         wins by six — a board no golfer would believe. A player plays to
         his handicap: his gross lands near par plus his shots, which is
         his handicap spread over eighteen holes, and that is what puts a
         field of twelve where a real one sits, in the thirties. */
      const lambda = f.hcp / 18;
      const over = Math.max(-1, Math.min(4, Math.round(lambda + (rnd() - 0.44) * 2.2)));
      raw[h] = Math.max(1, par + over);
    }
    T.club[C.cardKey('frostbite', f.id)] = { ...card, raw, at: Date.now() - (field.length - n) * 60000,
      done: holes >= 18, final: false };
    n++;
  }
  window.__forceRender();
  return n;
}, [FIELD, HOLES]);
await p.waitForTimeout(900);
ok('eleven cards are in the book', written, 11);

/* ---- and the twelfth is played by hand, through the book's own screens ---- */
console.log('\n=== and Norberto plays his, hole by hole, through the book ===');
const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const shut = async () => { for (let i = 0; i < 5; i++) {
  if (!await p.locator('.scrim').count()) return;
  await p.locator('.scrim [data-act="modalCancel"]').first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(220); } };

await go('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(700);
if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) {
  await go('roundGo', { a: 'comp' }); await p.waitForTimeout(800);
}
await shut();
ok('the score screen is open', await p.locator('.entryhd').count(), 1);

const MINE = [5, 4, 4, 6, 4, 5, 4, 5, 3, 4, 5, 3, 4, 4, 4, 6, 4, 3];
let entered = 0;
for (let h = 0; h < HOLES; h++) {
  await go('clubHole', { a: String(h) }); await p.waitForTimeout(120);
  /* the keypad the Clubhouse actually draws: clubPad opens it, clubScore
     writes the number, and the number IS the save — there is no second
     button, which is the whole point of the screen */
  await go('clubPad', {}); await p.waitForTimeout(120);
  await go('clubScore', { a: String(MINE[h]) }); await p.waitForTimeout(150);
  entered++;
}
await p.waitForTimeout(700);
const mine = await p.evaluate(() => { const C = window.__C, T = window.__T;
  const c = T.club[C.cardKey('frostbite', 'g1')];
  if (!c) return null; const t = C.cardTotals(c);
  return { thru: t.thru, pts: t.pts, gross: t.gross }; });
console.log('      his card: ' + (mine ? mine.thru + ' holes, ' + mine.gross + ' gross, ' + mine.pts + ' points' : 'none'));
ok('his round went in through the screens', mine && mine.thru, HOLES);

/* ---- the board ---- */
console.log('\n=== the board ===');
const board = await p.evaluate(() => {
  const C = window.__C, T = window.__T;
  return C.stopBoard(T, 'frostbite').map(r => ({ name: (C.person(T, r.pid) || {}).name || r.pid, pts: r.pts, thru: r.thru }));
});
board.slice(0, 12).forEach((r, i) => console.log('      ' + String(i + 1).padStart(2) + '.  ' + String(r.pts).padStart(2) + ' pts  thru ' + String(r.thru).padStart(2) + '   ' + r.name));
ok('everybody who played is on it', board.length, 12);
ok('and it is in order', board.every((r, i) => i === 0 || board[i - 1].pts >= r.pts), true);

await go('go', { a: 'season' }); await p.waitForTimeout(900); await shut();
await p.screenshot({ path: S + '/sim/season.png', fullPage: true });
/* the board itself, so it can be looked at and not only counted */
for (const sel of ['.btbl', '.boardtbl', 'table.board', '.bwrap', '.cline:has(.brow)', 'table']) {
  const el = p.locator(sel).first();
  if (await el.count()) { await el.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(250);
    await el.screenshot({ path: S + '/sim/board.png' }).catch(() => {});
    console.log('      board drawn as ' + sel); break; }
}
await go('go', { a: 'you' }); await p.waitForTimeout(900);
await p.screenshot({ path: S + '/sim/you.png', fullPage: true });

if (KEEP) {
  const book = await p.evaluate(() => JSON.stringify(window.__T));
  writeFileSync(S + '/sim/book.json', book);
  console.log('\nthe played book: ' + S + '/sim/book.json');
}
console.log('\nscreens: ' + S + '/sim/');
if (errs.length) { console.log('PAGE ERRORS: ' + JSON.stringify(errs.slice(0, 5))); fails.push('pageerror'); }
await ctx.close(); await b.close(); srv.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
