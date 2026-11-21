/* IS LAKEWOOD ACTUALLY READY TO PLAY?
 *
 * The card test proves the yardages match the club's printed card, and the
 * shape tests prove the eighteen drawings are the right shape. Neither
 * proves a member can pick the course and play a round on it.
 *
 * This walks the whole way a member actually goes: find the course, make it
 * theirs, let the hole window read it, open a card, put eighteen numbers in,
 * and read the points off the other end. If any link in that chain is
 * broken, Lakewood is in the book but not in play.
 *
 * Run: node tools/lakewood-ready-test.mjs
 */
import * as C from '../src/club.js';
import * as H from '../src/holes3d.js';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

/* A member with nothing: no course of their own, nothing in the club yet. */
const T = { club: {}, config: { people: [] } };
const ME = 'g1';

console.log('\n1. a member who has never entered a course can still find it');
ok('it is in the library for them', C.courseLibrary(T).filter(c => /lakewood/i.test(c.name)).length, 5);
ok('typing two letters finds it', C.courseFind(T, 'lak').filter(c => /lakewood/i.test(c.name)).length > 0, true);
ok('and every tee is offered', C.courseFind(T, 'lakewood').map(c => c.tee).sort(),
  ['Black', 'Blue', 'Orange', 'Silver', 'White']);

console.log('\n2. they can make it their own course');
const hit = C.courseLibrary(T).find(c => /lakewood/i.test(c.name) && c.tee === 'White');
const mine = C.courseFrom(hit, ME);
ok('the course is well formed', C.courseOk(mine), true);
ok('par 72', C.coursePar(mine), 72);
ok('eighteen holes', mine.holes.length, 18);
ok('every stroke index once', mine.holes.map(h => h.si).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
/* Picking a course never arrives approved: the commissioner approves it.
   That is a label on the card, not a lock on play — proved below. */
ok('it starts unapproved, as any course does', mine.approved, false);
T.club['course__' + ME] = mine;

console.log('\n3. the hole window can read it');
const book = C.courseAsBook(mine);
ok('the book builds it', !!book, true);
/* The shapes hang off the COURSE name, not the member, so two members at
   Lakewood stand on the same 1st. */
ok('and keys the shapes by the course, not the member', book.shapeKey, 'lakewood-country-club');
ok('eighteen holes, numbered', book.holes.map(h => h.n), Array.from({ length: 18 }, (_, i) => i + 1));
ok('every hole has a length in metres', book.holes.every(h => h.mY > 60 && h.mY < 520), true);

console.log('\n4. every hole stands up in 3D, through the real path a member takes');
const shaped = book.holes.map(h => H.model(book.shapeKey, h));
ok('all eighteen are the flyover shapes', shaped.map(m => m.traced), shaped.map(() => 'flyover'));
ok('none fell back to a shape made up from the card', shaped.filter(m => m.traced === false).length, 0);
ok('every one has sand on it', shaped.every(m => m.bunkers.length > 0), true);
ok('the seven water holes still have their water', shaped.map((m, i) => m.lakes.length ? i + 1 : 0).filter(Boolean), [2, 3, 5, 6, 9, 11, 12]);

console.log('\n5. a round can be played on it and scored');
const stop = 'frostbite';
/* Gross par on every hole, off scratch: the definition of 36 points. */
let card = C.blankClubCard(stop, ME, 0, mine, '2027-11-15');
mine.holes.forEach((h, i) => { card.raw[i] = h.par; });
let t = C.cardTotals(card);
ok('eighteen holes played', t.thru, 18);
ok('gross equals par', [t.gross, t.par], [72, 72]);
ok('level par off scratch is 36 points', t.pts, 36);
ok('and it is level to par', t.toPar, 0);

/* A 14 handicapper going round in 86 — par plus a shot on the 14 hardest. */
const hard14 = mine.holes.map((h, i) => ({ i, si: h.si })).sort((a, b) => a.si - b.si).slice(0, 14).map(x => x.i);
card = C.blankClubCard(stop, ME, 14, mine, '2027-11-15');
mine.holes.forEach((h, i) => { card.raw[i] = h.par + (hard14.includes(i) ? 1 : 0); });
t = C.cardTotals(card);
ok('a 14 handicapper round in 86', t.gross, 86);
ok('shoots his handicap for 36 points', t.pts, 36);

/* An unapproved course must not block any of that. */
ok('and none of it needed the commissioner first', C.courseOf(T, ME).approved, false);
ok('the card still scored', t.thru, 18);

console.log('\n6. it sits beside Leatherhead rather than instead of it');
ok('both are still in the library', ['Leatherhead Golf Club', 'Lakewood Country Club']
  .map(n => C.courseLibrary(T).some(c => c.name === n)), [true, true]);
ok('and the member’s own copy did not shadow the other tees',
  C.courseLibrary(T).filter(c => /lakewood/i.test(c.name)).length, 5);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good — Lakewood is in play');
process.exit(fails.length ? 1 : 0);
