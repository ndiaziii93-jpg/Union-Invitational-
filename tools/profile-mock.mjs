/* Sample figures for the player-card preview, derived with the book's own
   functions rather than invented: the fake part is the gross scores, and
   everything on the card is worked out from them exactly as the app would.
   Writes a JSON blob for docs/preview/profile/index.html. */
import { writeFileSync } from 'node:fs';
import * as C from '../src/club.js';

const COURSE = C.COURSE_LIB.find(c => c.name === 'Leatherhead Golf Club' && c.tee === 'White');
const course = C.courseFrom(COURSE, 'g1');
const HOLES = course.holes;

/* A seeded, repeatable shuffle, so the preview says the same thing twice. */
let seed = 20271113;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/* A player with something to say about him: good on the long holes and the
   hard ones, loose on the short ones, and liable to lose a card late. */
function play(hcp, form) {
  const raw = [];
  for (let i = 0; i < 18; i++) {
    const { par, si } = HOLES[i];
    let over = 1.20 - form;
    if (par === 5) over -= 0.38;
    if (par === 3) over += 0.52;
    if (si <= 6) over -= 0.20;
    if (si >= 13) over += 0.18;
    if (i >= 14) over += 0.28;
    const roll = rnd() + rnd() + rnd() - 1.5;
    let n = Math.round(par + over + roll * 1.25);
    if (rnd() < 0.05) n = par + 4;                  // the one that gets away
    raw.push(Math.max(2, Math.min(par + 3, n)));
  }
  return raw;
}
const mkCard = (stop, pid, hcp, form) => ({
  stop, pid, raw: play(hcp, form), hcp,
  course: { name: course.name, tee: course.tee, holes: HOLES.map(h => ({ par: h.par, si: h.si })) },
  photo: null, at: null, done: true,
});

const STOPS = [
  ['mulligan24', 'The Merry Mulligan Open', 0.30],
  ['frostbite', 'The Frostbite Open', 0.05],
  ['sweetheart', 'The Sweetheart Scramble', 0.45],
  ['spring', 'The Spring Meeting', 0.20],
  ['summer', 'The Midsummer Cup', 0.55],
  ['autumn', 'The Autumn Medal', 0.40],
];
const cards = STOPS.map(([id, , form]) => mkCard(id, 'g1', 18, form));

/* ---------- the shape of his game ---------- */
const all = [];
cards.forEach(c => { for (let h = 0; h < 18; h++) all.push({ h, par: HOLES[h].par, si: HOLES[h].si, raw: c.raw[h], pts: C.holePts(c, h) }); });
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const r1 = n => Math.round(n * 10) / 10;
const ptsWhere = f => r1(mean(all.filter(f).map(x => x.pts)));
const overWhere = f => r1(mean(all.filter(f).map(x => x.raw - x.par)));

const avgPts = mean(all.map(x => x.pts));
const byPar = [3, 4, 5].map(p => ({ par: p, over: overWhere(x => x.par === p), pts: ptsWhere(x => x.par === p), n: all.filter(x => x.par === p).length }));
const bySi = [[1, 6, 'the hard six'], [7, 12, 'the middle six'], [13, 18, 'the gentle six']]
  .map(([a, b, label]) => ({ a, b, label, pts: ptsWhere(x => x.si >= a && x.si <= b), over: overWhere(x => x.si >= a && x.si <= b) }));
const nine = [['Front', 0, 8], ['Back', 9, 17]].map(([label, a, b]) => ({ label, pts: r1(mean(cards.map(c => { let s = 0; for (let h = a; h <= b; h++) s += C.holePts(c, h); return s; }))) }));
const closing = ptsWhere(x => x.h >= 15);
const opening = ptsWhere(x => x.h <= 2);
const blanks = all.filter(x => x.pts === 0).length;
const netPar = all.filter(x => x.pts === 2).length;
const bonus = all.filter(x => x.pts >= 3).length;
const capped = all.filter(x => x.raw === x.par + 3).length;

/* the longest run of holes, across a card, without a blank */
let best = 0;
cards.forEach(c => { let run = 0; for (let h = 0; h < 18; h++) { if (C.holePts(c, h) > 0) { run++; best = Math.max(best, run); } else run = 0; } });

/* the hole that owns him: worst average points, over at least four goes */
const perHole = HOLES.map((hl, h) => ({ n: h + 1, par: hl.par, si: hl.si, pts: r1(mean(all.filter(x => x.h === h).map(x => x.pts))), over: overWhere(x => x.h === h) }));
const nemesis = perHole.slice().sort((a, b) => a.pts - b.pts)[0];
const banker = perHole.slice().sort((a, b) => b.pts - a.pts)[0];

/* ---------- the record ---------- */
const totals = cards.map(c => C.cardTotals(c));
const form = cards.map((c, i) => ({ stop: STOPS[i][1], pts: C.cardTotals(c).pts, diff: C.diffOf(c) }));

/* a field around him, so the finishes and the head-to-heads are real orders */
const RIVALS = [['g2', 'Norberto Jr.', 19], ['g3', 'Matt D', 16], ['g4', 'Manuel P', 24], ['g5', 'Gabriel P', 21], ['g6', 'Ray V', 22], ['g8', 'Dan A', 14], ['g9', 'Duncan W', 12], ['g11', 'Devin O', 27]];
const T = { config: { people: [{ id: 'g1', role: 'golfer', display: 'Norberto III', band: 20 }, ...RIVALS.map(([id, nm, b]) => ({ id, role: 'golfer', display: nm, band: b }))] }, club: {} };
cards.forEach(c => { T.club[C.cardKey(c.stop, 'g1')] = c; });
RIVALS.forEach(([id, , hcp], k) => STOPS.forEach(([s], i) => { T.club[C.cardKey(s, id)] = mkCard(s, id, hcp, 0.10 + 0.055 * k + ((i + k) % 4) * 0.09); }));
T.club.season = { phase: 'club', frozen: true, stops: STOPS.map(([id, name], i) => ({ id, name, from: '2027-0' + (i + 1) + '-01', to: '2027-0' + (i + 1) + '-20', format: 'stableford' })) };

const today = '2027-11-01';
const boards = STOPS.map(([id, name]) => ({ id, name, board: C.stopBoard(T, id) }));
const mine = boards.map(b => ({ ...b, row: b.board.find(r => r.pid === 'g1') }));
const wins = mine.filter(x => x.row && x.row.pos === 1).length;
const podiums = mine.filter(x => x.row && x.row.pos <= 3).length;
const bestFin = Math.min(...mine.map(x => x.row ? x.row.pos : 99));
const meritRows = C.merit(T, today);
const meritMe = meritRows.find(r => r.pid === 'g1') || { pts: 0, pos: null };
const u = C.unionHcp(T, 'g1', today);

const h2h = RIVALS.slice(0, 4).map(([id, nm]) => {
  let w = 0, l = 0;
  boards.forEach(b => {
    const a = b.board.find(r => r.pid === 'g1'), c = b.board.find(r => r.pid === id);
    if (!a || !c) return;
    if (a.pts > c.pts) w++; else if (a.pts < c.pts) l++;
  });
  return { name: nm, w, l };
});

/* ---------- the attributes, and what each one is ---------- */
const cap99 = (v, lo, hi) => Math.max(1, Math.min(99, Math.round(((v - lo) / (hi - lo)) * 99)));
const attrs = [
  { k: 'Grind', v: cap99(bySi[0].pts, 0.6, 2.6), of: 'points a hole on stroke index 1 to 6', raw: bySi[0].pts + ' pts' },
  { k: 'Nerve', v: cap99(closing - avgPts, -1.0, 0.6), of: 'points on 16, 17 and 18 against his own average', raw: (closing >= avgPts ? '+' : '') + r1(closing - avgPts) + ' pts' },
  { k: 'Fireworks', v: cap99(bonus / all.length, 0.05, 0.35), of: 'share of holes worth three points or more', raw: bonus + ' holes' },
  { k: 'Metronome', v: cap99(netPar / all.length, 0.15, 0.50), of: 'share of holes at exactly two points', raw: netPar + ' holes' },
  { k: 'Damage', v: 100 - cap99(blanks / all.length, 0.05, 0.42), of: 'blank holes, counted the other way up', raw: blanks + ' blanks' },
];

const out = {
  player: { name: 'Norberto Diaz III', short: 'Norberto III', band: 20, hcp: u.hcp, playing: Math.round(u.hcp), from: u.from, cards: cards.length },
  course: { name: course.name, tee: course.tee, par: C.coursePar(course) },
  record: { played: cards.length, wins, podiums, best: bestFin, merit: meritMe.pts, meritPos: meritMe.pos, meritOf: meritRows.length },
  totals: { avgPts: r1(avgPts * 18), bestPts: Math.max(...totals.map(t => t.pts)), worstPts: Math.min(...totals.map(t => t.pts)) },
  form, byPar, bySi, nine, perHole, nemesis, banker, h2h, attrs,
  counts: { blanks, netPar, bonus, capped, run: best, holes: all.length },
  marks: { opening: r1(opening), closing: r1(closing), avg: r1(avgPts) },
  diffs: u.diffs,
};
writeFileSync('docs/preview/profile/data.js',
  '/* Sample figures for the player-card preview. The gross scores behind these\n'
  + '   are invented; every number on the cards is worked out from them by the\n'
  + '   book\u2019s own functions. Rebuild with: node tools/profile-mock.mjs */\n'
  + 'window.PROFILE = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(JSON.stringify({ hcp: out.player.hcp, record: out.record, attrs: out.attrs.map(a => a.k + ' ' + a.v), byPar: out.byPar, bySi: out.bySi.map(s => s.label + ' ' + s.pts), nine: out.nine, nemesis, banker, counts: out.counts, marks: out.marks, h2h, form: form.map(f => f.pts) }, null, 1));
