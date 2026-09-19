/* The numbers under the recap. The narrative can be wrong and it is funny;
   these cannot. Pure engine, no browser. Run: node tools/scoring-test.mjs */
import * as E from '../src/engine.js';
import { defaultConfig, blankCard, blankBbb } from '../src/store.js';
import { COURSES } from '../src/data.js';

const fails = [];
const ok = (n, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const good = g === w;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + g + (good ? '' : '  want ' + w));
  if (!good) fails.push(n);
};

/* ---------- a tournament we control completely ---------- */
function fresh() {
  const config = defaultConfig();
  config.people = [
    { id: 'a', name: 'A', display: 'A', role: 'golfer', band: 15, location: null, group: '7-day' },
    { id: 'b', name: 'B', display: 'B', role: 'golfer', band: 20, location: null, group: '7-day' },
    { id: 'c', name: 'C', display: 'C', role: 'golfer', band: 25, location: null, group: '7-day' },
    { id: 'd', name: 'D', display: 'D', role: 'golfer', band: 30, location: null, group: '7-day' },
    { id: 'e', name: 'E', display: 'E', role: 'golfer', band: null, location: null, group: '7-day' },
  ];
  config.pairs = [
    { id: 'p1', name: null, members: ['a', 'b'], order: 0 },
    { id: 'p2', name: null, members: ['c', 'd'], order: 1 },
  ];
  return { config, scores: {}, bbb: {} };
}
const put = (T, rid, pid, raws) => {
  const c = blankCard();
  raws.forEach((v, i) => { c.raw[i] = v; if (v != null) c.by[i] = 'master'; });
  T.scores[rid + '__' + pid] = c;
};
const par = rid => E.courseOf(fresh(), rid).holes.map(h => h.par);
const si = rid => E.courseOf(fresh(), rid).holes.map(h => h.si);

/* ---------- 1. strokes by stroke index ---------- */
console.log('\nstrokes received, by band and stroke index');
ok('a 15 takes one stroke on the hardest hole', E.strokesFor(15, 1), 1);
ok('a 15 takes one on stroke index 15', E.strokesFor(15, 15), 1);
ok('a 15 takes none on 16', E.strokesFor(15, 16), 0);
ok('a 20 takes two on the hardest two', [E.strokesFor(20, 1), E.strokesFor(20, 2)], [2, 2]);
ok('a 20 takes one on the third', E.strokesFor(20, 3), 1);
ok('a 25 takes two through stroke index 7', E.strokesFor(25, 7), 2);
ok('a 25 takes one on 8', E.strokesFor(25, 8), 1);
ok('a 30 takes two through stroke index 12', E.strokesFor(30, 12), 2);
ok('a 30 takes one on 13', E.strokesFor(30, 13), 1);
ok('no band means no score, never a guess', E.strokesFor(null, 1), null);

// every band gives back exactly the strokes it is named for
for (const band of [15, 20, 25, 30]) {
  const total = COURSES.aspendos.holes.reduce((a, h) => a + E.strokesFor(band, h.si), 0);
  ok('a ' + band + ' band receives ' + band + ' strokes over eighteen', total, band);
}

/* ---------- 2. a net score, hole by hole ---------- */
console.log('\nnet scores');
{
  const T = fresh();
  const rid = 'r1';
  const P = par(rid), SI = si(rid);
  const hardest = SI.indexOf(1);          // where the 15 band gets its stroke
  const easiest = SI.indexOf(18);         // where it does not
  const raws = Array(18).fill(null);
  raws[hardest] = P[hardest] + 1;         // a bogey on the hardest hole
  raws[easiest] = P[easiest] + 1;         // and on the easiest
  put(T, rid, 'a', raws);
  ok('a stroke turns a bogey into a par', E.playerNet(T, rid, 'a', hardest), P[hardest]);
  ok('with no stroke a bogey stays a bogey', E.playerNet(T, rid, 'a', easiest), P[easiest] + 1);

  // the triple-bogey cap bites before the stroke is taken off
  const raws2 = Array(18).fill(null);
  raws2[hardest] = P[hardest] + 7;        // a disaster
  put(T, rid, 'b', raws2);
  ok('a blow-up is capped at three over, then the strokes come off',
    E.playerNet(T, rid, 'b', hardest), P[hardest] + 3 - 2);

  // an unbanded golfer is left out rather than guessed at
  put(T, rid, 'e', raws);
  ok('an unbanded golfer has no net score', E.playerNet(T, rid, 'e', hardest), null);
  ok('and no hole played at all is null', E.playerNet(T, rid, 'a', SI.indexOf(9)), null);
}

/* ---------- 3. better ball: the pair takes the better net ---------- */
console.log('\nbetter ball');
{
  const T = fresh();
  const rid = 'r1';
  const P = par(rid), SI = si(rid);
  const h = SI.indexOf(1);
  const pair = T.config.pairs[0];         // A on 15, B on 20
  const raws = Array(18).fill(null);
  raws[h] = P[h] + 1;                     // A: bogey, one stroke -> par
  put(T, rid, 'a', raws);
  const raws2 = Array(18).fill(null);
  raws2[h] = P[h] + 1;                    // B: bogey, two strokes -> one under
  put(T, rid, 'b', raws2);
  ok('the pair takes the better of the two nets', E.pairHole(T, rid, pair, h), P[h] - 1);

  // one partner short of a score does not sink the pair
  const only = Array(18).fill(null);
  only[h] = P[h];
  const T2 = fresh();
  put(T2, rid, 'a', only);
  ok('one card is enough for the pair', E.pairHole(T2, rid, T2.config.pairs[0], h), P[h] - 1);
  ok('neither card is no score', E.pairHole(T2, rid, T2.config.pairs[1], h), null);
}

/* ---------- 4. a whole round, and the cumulative standings ---------- */
console.log('\nround totals and the week');
{
  const T = fresh();
  const now = E.nowLocal();
  const counting = E.countingRounds(T).map(r => r.id);
  ok('three rounds count towards the championship', counting.length, 3);
  ok('the practice day is not one of them', counting.includes('practice'), false);

  // everyone plays every counting round to their band exactly: gross = par + strokes,
  // so every net is a par and every pair is level
  for (const rid of counting) {
    const holes = E.courseOf(T, rid).holes;
    for (const p of T.config.people) {
      if (p.band == null) continue;
      put(T, rid, p.id, holes.map(hl => hl.par + E.strokesFor(p.band, hl.si)));
    }
  }
  const board = E.pairsBoard(T, now);
  ok('both pairs are level after three rounds', board.map(r => r.total), [0, 0]);

  // now one pair drops a shot in each round: three under across the week
  for (const rid of counting) {
    const holes = E.courseOf(T, rid).holes;
    const raws = holes.map(hl => hl.par + E.strokesFor(15, hl.si));
    raws[0] -= 1;                          // A holes one fewer on the first
    put(T, rid, 'a', raws);
  }
  const board2 = E.pairsBoard(T, now);
  const lead = board2.find(r => r.id === 'p1');
  ok('one shot a round is three under for the week', lead.total, -3);
  ok('and that pair leads', board2[0].id, 'p1');
  ok('the other pair is still level', board2.find(r => r.id === 'p2').total, 0);

  // the practice day must not touch any of it
  const holes = E.courseOf(T, 'practice').holes;
  put(T, 'practice', 'a', holes.map(hl => hl.par - 2));
  ok('a practice round changes no standing', E.pairsBoard(T, now).find(r => r.id === 'p1').total, -3);
}

/* ---------- 5. what the recap is handed ---------- */
console.log('\nthe recap inputs');
{
  const T = fresh();
  const rid = 'r1';
  const holes = E.courseOf(T, rid).holes;
  for (const p of T.config.people) {
    if (p.band == null) continue;
    put(T, rid, p.id, holes.map(hl => hl.par + E.strokesFor(p.band, hl.si)));
  }
  ok('a round with every card in reads as complete', E.roundComplete(T, rid), true);
  const half = blankCard();
  half.raw[0] = 4;
  T.scores[rid + '__a'] = half;
  ok('one short card and it is not', E.roundComplete(T, rid), false);
}

/* ---------- 6. the figures the recap prints ---------- */
console.log('\nthe recap figures');
{
  const T = fresh();
  const rid = 'r1';
  const now = E.nowLocal();
  const holes = E.courseOf(T, rid).holes;
  // both pairs play to their bands, then the leaders take three shots out of
  // the field across holes 4 to 6
  for (const p of T.config.people) {
    if (p.band == null) continue;
    put(T, rid, p.id, holes.map(h => h.par + E.strokesFor(p.band, h.si)));
  }
  const lead = holes.map(h => h.par + E.strokesFor(15, h.si));
  lead[3] -= 1; lead[4] -= 1; lead[5] -= 1;
  put(T, rid, 'a', lead);

  const rb = E.pairRoundBoard(T, rid);
  ok('the round board has both pairs', rb.length, 2);
  ok('and the leaders are three under for the day', rb[0].today, -3);

  const rib = E.ribbon(T, rid);
  ok('the ribbon has a cell per hole', rib.length, 18);
  ok('holes 4, 5 and 6 are under par', [rib[3].d, rib[4].d, rib[5].d], [-1, -1, -1]);
  ok('hole 1 is level', rib[0].d, 0);

  const table = E.recapTable(T, rid, now);
  ok('the table shows today and the week', [table[0].today, table[0].total], [-3, -3]);

  const sg = E.sideGames(T, rid);
  ok('nothing is claimed that was not recorded', [sg.ctp, sg.ld, sg.bbb], [null, null, null]);
  ok('and no cap was hit', sg.caps, 0);

  // a blow-up on one hole, and the cap count follows it
  const blown = lead.slice();
  blown[10] = holes[10].par + 6;
  put(T, rid, 'a', blown);
  ok('a capped hole is counted once', E.sideGames(T, rid).caps, 1);

  // what the generator is handed must carry the ids it is told to use
  const input = E.recapInput(T, rid, now);
  ok('the brief names the pairs by id', input.includes('p1 = '), true);
  ok('and carries the cards', input.includes('CARDS (gross then net'), true);
  ok('and says where the cap bit', input.includes('cap hit on holes'), true);
}

/* ---------- 7. which round the recap is for, and how it stands ---------- */
console.log('\nthe panel on Today');
{
  const T = fresh();
  const holes = E.courseOf(T, 'r1').holes;
  let st = E.roundStanding(T, 'r1');
  ok('nothing in means not started', [st.started, st.complete, st.inCards], [false, false, 0]);

  put(T, 'r1', 'a', holes.map((h, i) => (i < 3 ? h.par : null)));
  st = E.roundStanding(T, 'r1');
  ok('one card going in is in progress', [st.started, st.complete], [true, false]);
  ok('and it counts the cards, not the holes', st.inCards, 1);

  for (const p of T.config.people) {
    if (p.band == null) continue;
    put(T, 'r1', p.id, holes.map(h => h.par + E.strokesFor(p.band, h.si)));
  }
  st = E.roundStanding(T, 'r1');
  ok('every card in is complete', st.complete, true);
  ok('and the recap is for that round', E.recapRound(T, E.nowLocal()), 'r1');
}

console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe numbers under the recap hold.');
process.exit(fails.length ? 1 : 0);
