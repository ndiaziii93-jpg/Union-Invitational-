/* LAKEWOOD COUNTRY CLUB, AGAINST THE CLUB'S OWN CARD.
 *
 * 3101 Carson Street, Lakewood, California. Taken off the printed card at
 * lakewoodgolfcc.com, which is the authority: the website's prose says
 * 7,010 off the back and the card says 7,033.
 *
 * A card typed in by hand is a card with a typo in it, and a wrong stroke
 * index is the kind of wrong nobody notices until somebody loses a match by
 * one shot. So every tee is checked against the totals the club prints.
 *
 * Run: node tools/lakewood-test.mjs
 */
import * as C from '../src/club.js';
import * as H from '../src/holes3d.js';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

/* tee, par, out, in, total — exactly as the club prints them */
const CARD = [
  ['Black',  72, 3491, 3542, 7033],
  ['Blue',   72, 3385, 3344, 6729],
  ['White',  72, 3226, 3190, 6416],
  ['Silver', 72, 2944, 2959, 5903],
  ['Orange', 72, 2274, 2219, 4493],
];
const lib = C.COURSE_LIB.filter(c => c.name === 'Lakewood Country Club');
console.log('\nthe five tees, against the printed card');
ok('all five are in the book', lib.length, 5);
for (const [tee, par, out, back, tot] of CARD) {
  const c = lib.find(x => x.tee === tee);
  if (!c) { ok(tee + ' is there', false, true); continue; }
  const sum = (a, b) => c.holes.slice(a, b).reduce((n, h) => n + h.y, 0);
  ok(tee + ': par', c.holes.reduce((n, h) => n + h.par, 0), par);
  ok(tee + ': out, in and total', [sum(0, 9), sum(9, 18), sum(0, 18)], [out, back, tot]);
  ok(tee + ': every stroke index once, 1 to 18',
    c.holes.map(h => h.si).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
  ok(tee + ': eighteen holes', c.holes.length, 18);
}

/* ONE CARD FOR THE COURSE. The club prints two — a men's par 72 with its
   index, and a second index under the Silver where the 6th and the 13th
   play as 5s for 74. The book plays every tee off the men's card, so that
   a stop played off the Silver and one played off the Black are the same
   par and the stableford points they pay are comparable. This is the one
   place the book knowingly prints less than the club does, so it is pinned
   here rather than left to drift back. */
console.log('\none card for the course, whichever tee you stand on');
const white = lib.find(c => c.tee === 'White'), silver = lib.find(c => c.tee === 'Silver');
ok('the 6th is a par 4 off every tee', [white.holes[5].par, silver.holes[5].par], [4, 4]);
ok('and so is the 13th', [white.holes[12].par, silver.holes[12].par], [4, 4]);
ok('the 6th is the hardest hole from anywhere',
  [white.holes.findIndex(h => h.si === 1) + 1, silver.holes.findIndex(h => h.si === 1) + 1], [6, 6]);
ok('and every tee agrees, hole for hole',
  lib.every(c => c.holes.every((h, i) => h.par === white.holes[i].par && h.si === white.holes[i].si)), true);

console.log('\nit stands beside Leatherhead rather than instead of it');
const names = new Set(C.COURSE_LIB.map(c => c.name));
ok('both clubs are in the library', [names.has('Leatherhead Golf Club'), names.has('Lakewood Country Club')], [true, true]);
const T = { club: {}, config: { people: [] } };
ok('and a search for it finds every tee', C.courseLibrary(T).filter(c => /lakewood/i.test(c.name)).length, 5);

/* ------------------------------------------------------------------ *
 * THE SHAPE OF EACH HOLE.
 *
 * The eighteen in TRACED_LKW were read by hand off the hole flyovers the
 * commissioner sent \u2014 which way each hole bends, which side the water is
 * on, where the sand sits and how far out. That reading is the thing most
 * likely to rot: a tweak to the generator drowns a bunker or puts a lake on
 * the wrong side, and nothing else in the suite would notice.
 *
 * So the facts are pinned here, beside where they came from.
 * ------------------------------------------------------------------ */
const KEY = 'lakewood-country-club';
const wht = C.COURSE_LIB.find(c => c.name === 'Lakewood Country Club' && c.tee === 'White');
const mod = n => H.model(KEY, { n, par: wht.holes[n - 1].par, mY: Math.round(wht.holes[n - 1].y * 0.9144) });
const each = f => Array.from({ length: 18 }, (_, i) => f(i + 1));

console.log('\nevery hole stands up, drawn from the flyovers');
ok('all eighteen are shaped', each(n => mod(n).traced), each(() => 'flyover'));
ok('none of them fell back to the card', each(n => mod(n).traced).filter(t => t === false).length, 0);

console.log('\nthe sand, hole by hole, as the flyovers count it');
ok('bunkers per hole', each(n => mod(n).bunkers.length),
  [2, 2, 2, 3, 2, 2, 3, 3, 3, 2, 2, 3, 5, 2, 3, 2, 2, 4]);
/* Sand drawn off the ground is sand nobody sees, and sand under water is
   worse: that is exactly how the 3rd lost both its bunkers when its lake
   was moved out to the 62 yard marker. */
ok('all of it sits on the island',
  each(n => n).every(n => { const m = mod(n); return m.bunkers.every(b => Math.abs(b.d) < Math.max(...m.islandW)); }), true);
ok('and none of it is under water',
  each(n => n).every(n => { const m = mod(n); return m.bunkers.every(b => !m.wet(b.t, b.d)); }), true);
/* Sized as a fraction of the length, a bunker shrinks to a speck on a 127
   metre hole. A bunker is about nine metres across wherever it is. */
ok('a bunker is a bunker on the short holes too',
  each(n => n).every(n => mod(n).bunkers.every(b => b.rx >= 3.9 && b.rx <= 11.01)), true);

console.log('\nthe water: which holes have it, and which side it is on');
ok('the holes with water on them', each(n => mod(n).lakes.length ? n : 0).filter(Boolean), [2, 3, 5, 6, 9, 11, 12]);
const side = n => { const d = mod(n).lakes.flat().map(q => q[1]);
  return Math.min(...d) < 0 && Math.max(...d) > 0 ? 'both' : Math.max(...d) <= 0 ? 'left' : 'right'; };
ok('the 2nd: water the whole left side', side(2), 'left');
ok('the 5th: the pond is left and long', side(5), 'left');
ok('the 6th: the creek is on the right', side(6), 'right');
ok('the 9th: the lake takes the right side home', side(9), 'right');
ok('the 11th: the lake holds the left', side(11), 'left');
ok('the 12th: left is wet', side(12), 'left');

console.log('\nthe 3rd is a forced carry, as the flyover\u2019s own 62 yard marker says');
const h3 = mod(3);
ok('dry off the tee', h3.wet(.30, 0), false);
ok('wall to wall in the middle', h3.wet(.60, 0), true);
ok('dry again at the green', h3.wet(.95, 0), false);

console.log('\nthe 6th is stroke one: the creek bites the right of the drive');
const h6 = mod(6);
ok('it is the hardest hole on the card', wht.holes[5].si, 1);
ok('the line itself stays dry', h6.wet(.48, 0), false);
ok('but it is wet a short pull right', h6.wet(.48, .085 * h6.len), true);

console.log('\nthe doglegs turn the way they turn');
const turn = n => { const m = mod(n); return Math.round(m.cl[m.cl.length - 1][0]); };
ok('the 6th goes right', turn(6) > 40, true);
ok('the 7th goes left', turn(7) < -40, true);
ok('the 16th goes left', turn(16) < -10, true);
ok('the 1st, 4th, 13th and 14th are straight enough to call straight',
  [1, 4, 13, 14].every(n => Math.abs(turn(n)) < 30), true);

console.log('\nand it is drawn, not surveyed \u2014 the window has to keep saying so');
ok('no hole claims to be a survey', each(n => mod(n).traced === true).filter(Boolean).length, 0);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
