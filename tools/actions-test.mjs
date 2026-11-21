/* EVERY ACTION REACHES ITS HANDLER, AND EVERY HANDLER HAS AN ACTION.
 *
 * The book dispatches taps through one big switch on data-act. Two things
 * go wrong there and neither makes a sound:
 *
 *   1. TWO CASES WITH THE SAME NAME. In one switch the first wins, so the
 *      second is dead code. This is how "Pick it up on 2" did nothing:
 *      'roundOpen' had been taken by the Belek week's round sheet 1500
 *      lines above the Clubhouse handler, so the Clubhouse one was never
 *      reached and NO way of resuming a handicap round worked.
 *
 *   2. A BUTTON WITH NO HANDLER. data-act="foo" with no `case 'foo'`
 *      falls through the switch and the tap is swallowed.
 *
 * Both are silent at runtime and invisible in review. They are not
 * invisible to a parser, so they are caught here instead.
 *
 * Run: node tools/actions-test.mjs
 */
import { readFileSync } from 'node:fs';
const src = readFileSync('src/app.js', 'utf8');
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

/* every `case 'x':` in the file, with the line it is on */
const cases = [];
/* unanchored: fall-through labels share a line, e.g. case 'a': case 'b': */
for (const m of src.matchAll(/case '([A-Za-z0-9_]+)':/g)) {
  cases.push({ name: m[1], line: src.slice(0, m.index).split('\n').length });
}
/* every action a button or field asks for */
const emitted = new Set();
for (const m of src.matchAll(/data-act="([A-Za-z0-9_]+)"/g)) emitted.add(m[1]);
for (const m of src.matchAll(/dataset\.act = '([A-Za-z0-9_]+)'/g)) emitted.add(m[1]);

console.log('\n' + cases.length + ' case labels, ' + emitted.size + ' actions emitted in markup\n');

console.log('1. no action name is claimed twice');
const seen = new Map(), dupes = [];
for (const c of cases) {
  if (seen.has(c.name)) dupes.push(c.name + ' (lines ' + seen.get(c.name) + ' and ' + c.line + ')');
  else seen.set(c.name, c.line);
}
ok('every case label is unique', dupes, []);

console.log('\n2. every button reaches a handler');
/* Not everything goes through the switch. Fields, drags and a few one-off
   listeners test the action by hand, so those count as handled too. */
const handled = new Set(cases.map(c => c.name));
for (const m of src.matchAll(/act === '([A-Za-z0-9_]+)'/g)) handled.add(m[1]);
for (const m of src.matchAll(/\.act === '([A-Za-z0-9_]+)'/g)) handled.add(m[1]);
for (const m of src.matchAll(/\[['"]([A-Za-z0-9_]+)['"]\]\s*:/g)) handled.add(m[1]);
/* Some data-act values are MARKERS, not actions: a drag source, a drop
   zone, a search box. Code finds them with a selector or by id instead of
   dispatching them, so a missing case is correct for these. */
for (const m of src.matchAll(/\[data-act="([A-Za-z0-9_]+)"\]/g)) handled.add(m[1]);
for (const m of src.matchAll(/getElementById\('([A-Za-z0-9_]+)'\)/g)) handled.add(m[1]);
/* Read straight off the element rather than dispatched at all.
   photoDrop earns its place: the photo strip is found by its .phstrip.drop
   class and its data-a is read directly, so the data-act never needs a
   case — but it is not spare either. It stops a tap inside the strip
   bubbling to an ancestor's action, so removing it would turn a dead tap
   into a wrong one. */
const NOT_DISPATCHED = new Set(['cardPhoto', 'photoDrop']);
const orphans = [...emitted].filter(a => !handled.has(a) && !NOT_DISPATCHED.has(a)).sort();
ok('no action is emitted without a case', orphans, []);

console.log('\n3. the one that bit us stays fixed');
ok('roundOpen is claimed once', cases.filter(c => c.name === 'roundOpen').length, 1);
ok('the Clubhouse opener has its own name', cases.filter(c => c.name === 'hcpOpen').length, 1);
ok('and something actually asks for it', emitted.has('hcpOpen'), true);
/* the Belek day sheet keeps the original */
ok('the Belek round sheet still emits roundOpen', emitted.has('roundOpen'), true);

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
