/* The opening.
 *
 * Four complaints have been made about this animation and every one of them
 * is checked here, because none of them showed up in a single measurement:
 *
 *   the wordmark ran off both edges — the widest moment of the journey is
 *   not the moment you happen to sample;
 *
 *   you could not see the crest before it faded — the hold was being spent
 *   on the crest still arriving rather than on the crest standing still;
 *
 *   it looked different every time — it faded IN, so what you saw depended
 *   on where the loading landed inside that window, and the hold ran to the
 *   moment the tournament arrived rather than to a clock;
 *
 *   and there was a blank page before it — the crest was put up by the book,
 *   which meant waiting for two and a half megabytes of hole diagrams and
 *   the whole bundle first. It is put up by src/opening.js now, in a small
 *   script near the top of the page, and it IS the first paint.
 *
 * The sampler is installed before the page's own scripts, on rAF, so the
 * record starts at the first frame rather than whenever a test harness got
 * round to asking.
 *
 * Run: node tools/crest-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const DIR = 'docs/app';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain' };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIR, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* One whole opening, recorded from the first frame.
   `slow` answers the database after a beat; without it nothing answers at
   all — and the point of asking both ways is that it must make no
   difference, because it used to make a second of difference. */
async function watch(width, height, slow) {
  const ctx = await b.newContext({ viewport: { width, height },
    isMobile: width < 700, hasTouch: width < 700 });
  const p = await ctx.newPage();
  await ctx.route('**/*.supabase.co/**', async route => {
    if (!slow) return route.abort();
    await new Promise(r => setTimeout(r, slow));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  /* Before the page's own scripts, so nothing about the opening is missed. */
  await p.addInitScript(() => {
    window.__rows = [];
    const tick = () => {
      const wm = document.querySelector('.watermark');
      const app = document.getElementById('app');
      if (wm) {
        const cs = getComputedStyle(wm);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        window.__rows.push({ t: Math.round(performance.now()), op: parseFloat(cs.opacity),
          bw: parseFloat(cs.backgroundSize), sx: m.a, sy: m.d,
          lead: wm.classList.contains('opening'),
          book: app ? parseFloat(getComputedStyle(app).opacity) : 0 });
      }
      if (performance.now() < 6500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await p.goto(BASE, { waitUntil: 'commit' }).catch(() => {});
  await p.waitForTimeout(7000);
  const out = await p.evaluate(async () => {
    /* The drawn size is background-size across by the art's own ratio down,
       both scaled by whatever the transform is doing at that instant. */
    const wm = document.querySelector('.watermark');
    const src = (getComputedStyle(wm).backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1];
    const aspect = await new Promise(res => {
      if (!src) return res(1);
      const im = new Image();
      im.onload = () => res(im.naturalHeight / im.naturalWidth);
      im.onerror = () => res(1);
      im.src = src;
    });
    const fcp = (performance.getEntriesByType('paint')
      .find(e => e.name === 'first-contentful-paint') || {}).startTime;
    return { rows: window.__rows.map(r => ({ ...r, w: r.bw * r.sx, h: r.bw * aspect * r.sy })),
      fcp: fcp == null ? null : Math.round(fcp) };
  });
  await ctx.close();
  return out;
}

/* The hold is the flat segment of the animation, so it is exactly the time
   the crest spends at full opacity. The class is NOT the hold — it carries
   the whole opening, fade and all — and measuring it would report a hold
   nobody asked for. Nor is `opacity > 0.9`, which quietly annexes the first
   slice of the fade. */
const fullOf = rows => { const f = rows.filter(s => s.op >= 0.999);
  return f.length ? f[f.length - 1].t - f[0].t : 0; };
/* And the book arrives when it stops being held back, part way through. */
const bookAt = rows => { const r = rows.find(s => s.book > 0.02); return r ? r.t : null; };

console.log('\nthe crest IS the first paint — there is no blank before it');
const main = await watch(390, 844, 300);
const firstLead = main.rows.find(s => s.lead);
console.log('        first contentful paint ' + main.fcp + 'ms, crest on screen at '
  + (firstLead ? firstLead.t : '?') + 'ms');
ok('the crest is on screen', !!firstLead, true);
/* The old build put it up from the bundle, after two and a half megabytes of
   hole diagrams: first paint landed near nine hundred milliseconds on a
   throttled phone and the crest a third of a second after that. */
ok('and it is there within a fifth of a second', firstLead && firstLead.t < 400, true);
ok('nothing is painted before it', main.fcp != null && firstLead
  && firstLead.t <= main.fcp + 80, true);

console.log('\nsolid from the first frame');
/* A crest caught half way through fading IN is a pale crest, and which one
   you got depended on when the tournament happened to arrive. It does not
   fade in at all, so the first frame is already the whole thing. */
console.log('        first frame at opacity ' + (firstLead ? firstLead.op : '?'));
ok('the first frame is already full strength', firstLead && firstLead.op > 0.95, true);
ok('and already at its full size', firstLead
  && Math.abs(firstLead.w - main.rows.filter(x => x.lead)
    .reduce((a, x) => Math.min(a, x.w), Infinity)) < 2, true);
/* "Sometimes it pops mid fade" was the crest being caught on its way UP.
   There is no way up any more, which is precisely the claim that the crest
   only ever gets fainter, never brighter, from the first frame onwards. */
ok('it never brightens — so it is never caught on the way in', main.rows.filter(
  (s, i) => i > 0 && s.op > main.rows[i - 1].op + 0.01).length, 0);

console.log('\nheld for exactly as long as it is meant to be');
/* The hold is the time the crest is FORWARD, which is now the time it is at
   full strength too. Measuring `opacity > 0.9` instead would quietly add the
   first slice of the fade and report a hold nobody asked for. */
const held = fullOf(main.rows);
const book = bookAt(main.rows);
console.log('        held at full strength for ' + held + 'ms; book begins at ' + book + 'ms');
ok('it stands still for about one and four fifths of a second',
  held >= 1700 && held <= 1980, true);
ok('and the book starts coming up as it lets go', book != null
  && book >= 1700 && book <= 2100, true);

console.log('\nthe whole crest, at every moment of the journey');
for (const [w, h] of [[375, 812], [390, 844], [430, 932], [834, 1112]]) {
  const { rows } = w === 390 ? main : await watch(w, h, 300);
  /* Only the moments an eye can see. Below a tenth of opacity the mark is
     the faint texture it settles into, and that texture is MEANT to bleed
     off both edges — measuring it would fail every build for ever. */
  const seen = rows.filter(s => s.op > 0.1);
  ok('at ' + w + ' the crest was on screen to measure', seen.length > 3, true);
  ok('at ' + w + ' it is never cut left or right',
    Math.round(seen.reduce((a, s) => Math.max(a, s.w), 0)) <= w, true);
  ok('at ' + w + ' it is never cut top or bottom',
    Math.round(seen.reduce((a, s) => Math.max(a, s.h), 0)) <= h, true);
}

console.log('\nit zooms out; it does not merely fade');
const lead = main.rows.filter(s => s.lead);
const tightest = lead.reduce((a, s) => Math.min(a, s.w), Infinity);
const last = main.rows[main.rows.length - 1];
console.log('        ' + Math.round(tightest) + 'px across, out to ' + Math.round(last.w) + 'px');
ok('it opens out from there', last.w > tightest * 1.15, true);
ok('a good deal — this is a zoom, not a dissolve', last.w / tightest > 1.2, true);

console.log('\nand then it gets out of the way');
ok('the book is fully visible', last.book > 0.99, true);
ok('the crest is a watermark again', last.op < 0.1, true);
const cleared = main.rows.find(s => s.t > firstLead.t && !s.lead);
console.log('        the opening ends at ' + (cleared ? cleared.t : '?') + 'ms');
ok('the crest hands itself back', !!cleared, true);

console.log('\nand with the wire cut, the very same opening');
/* The hold used to run to the moment the tournament ARRIVED, so a slow open
   held the crest a whole second longer than a quick one and no two openings
   looked alike. The opening is timed from the first paint now and the book
   waits behind its own load bar, which is what it already shows for a slow
   open. */
const gone = await watch(390, 844, 0);
const up = gone.rows.find(s => s.lead);
const down = gone.rows.find(s => up && s.t > up.t && !s.lead);
const deadHeld = fullOf(gone.rows);
const deadBook = bookAt(gone.rows);
console.log('        with nothing answering: up at ' + (up ? up.t : '?')
  + 'ms, held ' + deadHeld + 'ms, book at ' + deadBook + 'ms');
ok('the crest still came up', !!up, true);
ok('and the book still appeared', gone.rows[gone.rows.length - 1].book > 0.99, true);
ok('it comes up at the same moment', !!up && Math.abs(up.t - firstLead.t) < 250, true);
ok('and is held for the same length of time', Math.abs(deadHeld - held) < 200, true);
ok('and the book comes up at the same moment too',
  deadBook != null && book != null && Math.abs(deadBook - book) < 250, true);
ok('so the opening is the same one either way',
  !!down && !!cleared && Math.abs(down.t - cleared.t) < 300, true);

await b.close();
server.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
  : '\nStraight to the crest, whole, and the same every time.');
process.exit(fails.length ? 1 : 0);
