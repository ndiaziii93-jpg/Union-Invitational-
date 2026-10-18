/* Every hole's 3D is traced from its own drawing: the course it belongs
   to, the water where the drawing has water and only there, the trees off
   the lakes. Run: node tools/trace-test.mjs */
import { TRACED, model } from '../src/holes3d.js';
import { COURSES } from '../src/data.js';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const holes = [];
for (const [key, c] of Object.entries(COURSES)) c.holes.forEach((h, i) => holes.push([key, { ...h, n: i + 1 }]));
ok('all 36 holes are traced from a drawing', holes.filter(([k, h]) => TRACED[k + '_' + h.n]).length, 36);
ok('and every model says so', holes.every(([k, h]) => model(k, h).traced === 'drawing'), true);
const m = (k, n) => { const h = COURSES[k].holes[n - 1]; return model(k, { ...h, n }); };
ok('Olympos 5 has its lake, down the left', m('olympos', 5).water.some(w => w.side === -1 && w.segs.length > 10), true);
ok('Olympos 12 has its lake on the right', m('olympos', 12).water.some(w => w.side === 1), true);
ok('Aspendos 1 is dry', m('aspendos', 1).water.length, 0);
ok('the two courses are not the same holes', JSON.stringify(m('olympos', 1).cl) !== JSON.stringify(m('aspendos', 1).cl), true);
ok('no bunker sits in the water', holes.every(([k, h]) => { const x = model(k, h); return x.bunkers.every(b => !x.wet(b.t, b.d)); }), true);
ok('and the length is still the card\'s', m('olympos', 5).len, COURSES.olympos.holes[4].mW);
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
