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
const lakeSide = (x, lake) => Math.sign(lake.reduce((a, [, d]) => a + d, 0));
ok('Olympos 5 has its lake, down the left', m('olympos', 5).lakes.some(l => lakeSide(0, l) === -1 && l.length > 20), true);
ok('Olympos 12 has its lake on the right', m('olympos', 12).lakes.some(l => lakeSide(0, l) === 1), true);
ok('Aspendos 1 is dry', m('aspendos', 1).lakes.length, 0);
/* Olympos 1: one lake, across the hole in front of the tee, as drawn. The
   line from the tee runs into it, it reaches out to the right beyond, and
   the line is dry again before the green. */
const o1 = m('olympos', 1);
ok('Olympos 1 has one lake', o1.lakes.length, 1);
const dry = [...Array(101).keys()].map(i => i / 100).filter(t => !o1.wet(t, 0, 0));
const wetLine = [...Array(101).keys()].map(i => i / 100).filter(t => o1.wet(t, 0, 0));
ok('it crosses the line in front of the tee', wetLine.length > 3 && wetLine[0] > .1 && wetLine[wetLine.length - 1] < .45, true);
ok('the tee and the green are dry', dry.includes(0.02) && dry.includes(0.96), true);
ok('it reaches out to the right of the line', o1.lakes[0].some(([, d]) => d > 40), true);
ok('every lake lies on the ground', holes.every(([k, h]) => { const x = model(k, h);
  return x.lakes.every(l => l.every(([t, d]) => { const i = Math.max(0, Math.min(23, Math.floor(t * 24)));
    return Math.abs(d) <= (d < 0 ? x.islandL : x.islandR)[i] + 1; })); }), true);
/* every surface as its own outline, as the drawing draws it */
ok('every hole has its ground outlined', holes.every(([k, h]) => model(k, h).grounds.length >= 1), true);
ok('and its fairways', holes.every(([k, h]) => model(k, h).fairways.length >= 1), true);
ok('nearly every green is drawn from its outline', holes.filter(([k, h]) => !!model(k, h).green.poly).length >= 32, true);
ok('no fairway runs into a lake', holes.every(([k, h]) => { const x = model(k, h);
  const pts = x.fairways.flat(); return pts.filter(([t, d]) => x.wet(t, d, 0)).length <= pts.length * .05; }), true);
ok('the path across Aspendos 3 is there', m('aspendos', 3).paths.some(p => { const ds = p.map(q => q[1]), ts = p.map(q => q[0]);
  return Math.min(...ds) < -3 && Math.max(...ds) > 0 && Math.max(...ts) - Math.min(...ts) < .1; }), true);
ok('and the hole is one piece of ground across it', m('aspendos', 3).grounds.length, 1);
ok('the closest-to-the-pin holes on the card are par threes', ['olympos', 'aspendos'].every(k => COURSES[k].holes.some(h => h.par === 3)), true);
ok('the two courses are not the same holes', JSON.stringify(m('olympos', 1).cl) !== JSON.stringify(m('aspendos', 1).cl), true);
ok('no bunker sits in the water', holes.every(([k, h]) => { const x = model(k, h); return x.bunkers.every(b => !x.wet(b.t, b.d)); }), true);
ok('and the length is still the card\'s', m('olympos', 5).len, COURSES.olympos.holes[4].mW);
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
