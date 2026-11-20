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
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

/* tee, par, out, in, total — exactly as the club prints them */
const CARD = [
  ['Black',  72, 3491, 3542, 7033],
  ['Blue',   72, 3385, 3344, 6729],
  ['White',  72, 3226, 3190, 6416],
  ['Silver', 74, 2944, 2959, 5903],
  ['Orange', 74, 2274, 2219, 4493],
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

console.log('\nthe card carries two indexes and two pars, and the book keeps them apart');
const white = lib.find(c => c.tee === 'White'), silver = lib.find(c => c.tee === 'Silver');
ok('the 6th is a par 4 off the white and a 5 off the silver',
  [white.holes[5].par, silver.holes[5].par], [4, 5]);
ok('and so is the 13th', [white.holes[12].par, silver.holes[12].par], [4, 5]);
ok('the hardest hole is the 6th off the white, the 7th off the silver',
  [white.holes.findIndex(h => h.si === 1) + 1, silver.holes.findIndex(h => h.si === 1) + 1], [6, 7]);

console.log('\nit stands beside Leatherhead rather than instead of it');
const names = new Set(C.COURSE_LIB.map(c => c.name));
ok('both clubs are in the library', [names.has('Leatherhead Golf Club'), names.has('Lakewood Country Club')], [true, true]);
const T = { club: {}, config: { people: [] } };
ok('and a search for it finds every tee', C.courseLibrary(T).filter(c => /lakewood/i.test(c.name)).length, 5);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
