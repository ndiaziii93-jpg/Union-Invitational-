/* The crest, on the way in.
 *
 * Three things have gone wrong here and none of them shows up in a single
 * measurement. The wordmark ran off both edges — "HE UNION INVITATIONA" —
 * because the widest moment of the journey is not the moment you happen to
 * sample. It went past too quickly to be read, because the hold was being
 * spent on the crest still arriving rather than on the crest standing still.
 * And it barely moved, because the travel had been trimmed to stop the
 * cropping instead of the resting size being bounded.
 *
 * The crest only appears while the tournament is still arriving — a book
 * that opens instantly shows none, deliberately — so this cannot be run
 * against the sandbox build, which settles out of local storage in a few
 * milliseconds. It runs the real app over real HTTP with the database held
 * up for the better part of a second, which is what a phone on hotel wifi
 * does anyway.
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
/* How long each round-trip to the database takes. Slow enough that the book
   is still opening when the crest is due at 350ms — which is the whole
   condition for showing one — and quick enough that the tournament is in
   hand well before the hold runs out, so what is measured below is the hold
   and not how long the wire took. The ceiling that rescues a dead connection
   is measured separately, at the end. */
const SLOW = 600;

/* A stand-in for the project's database that PRIMES ITSELF.
 *
 * An empty database is no good here: the book refuses to seed from a single
 * read, so it spends a second and a half confirming the emptiness, and the
 * crest then measures that confirmation rather than its own hold — which is
 * how a test comes to pass against a build it was written to fail. So the
 * first page load seeds, this keeps what it wrote, and every load after that
 * is a book finding a tournament already there. */
const rows = new Map();
let stamp = 1000;

function answer(url) {
  const q = new URL(url).searchParams;
  const path = q.get('path') || '';
  let out = [...rows.values()];
  if (path.startsWith('eq.')) out = out.filter(r => r.path === path.slice(3));
  else if (path.startsWith('like.')) {
    const pre = path.slice(5).replace(/%$/, '');
    out = out.filter(r => r.path.startsWith(pre));
  }
  const gt = q.get('updated_at');
  if (gt && gt.startsWith('gt.')) out = out.filter(r => r.updated_at > gt.slice(3));
  return out.sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
}

function keep(body) {
  let sent;
  try { sent = JSON.parse(body); } catch (e) { return; }
  for (const r of (Array.isArray(sent) ? sent : [sent])) {
    if (r && r.path) rows.set(r.path, { path: r.path, doc: r.doc,
      updated_at: new Date(stamp++).toISOString() });
  }
}

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

/* One whole arrival, watched from the moment the page is asked for. Every
   sample taken while the crest was on screen comes back, so the shape of the
   journey can be read rather than guessed at. */
async function watch(width, height, dead) {
  const ctx = await b.newContext({ viewport: { width, height },
    isMobile: width < 700, hasTouch: width < 700 });
  const p = await ctx.newPage();
  /* The database, a beat late and empty. Late is the point: the crest exists
     to cover exactly this wait. Empty is simply the shortest answer that
     lets the book finish opening. With `dead` set, nothing answers at all —
     the phone that has walked out of range of the hotel. */
  await ctx.route('**/*.supabase.co/**', async route => {
    if (dead) return route.abort();
    const rq = route.request();
    if (rq.method() !== 'GET') {
      keep(rq.postData() || '');
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    await new Promise(r => setTimeout(r, SLOW));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(answer(rq.url())) });
  });
  await p.goto(BASE);
  const out = await p.evaluate(async () => {
    const t0 = Date.now();
    /* The crest is a background image, so its drawn size is background-size
       across by the art's own ratio down — both then scaled by whatever the
       transform is doing at this instant. */
    const aspect = await new Promise(res => {
      const tick = () => {
        const wm = document.querySelector('.watermark');
        if (!wm) { if (Date.now() - t0 > 4000) return res(1); return setTimeout(tick, 30); }
        const src = (getComputedStyle(wm).backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1];
        if (!src) return res(1);
        const im = new Image();
        im.onload = () => res(im.naturalHeight / im.naturalWidth);
        im.onerror = () => res(1);
        im.src = src;
      };
      tick();
    });
    const rows = [];
    while (Date.now() - t0 < 8000) {
      const wm = document.querySelector('.watermark');
      const app = document.getElementById('app');
      if (wm) {
        const cs = getComputedStyle(wm);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        const bw = parseFloat(cs.backgroundSize);
        rows.push({ t: Date.now() - t0, op: parseFloat(cs.opacity),
          w: bw * m.a, h: bw * aspect * m.d,
          lead: wm.classList.contains('leading'),
          book: app ? parseFloat(getComputedStyle(app).opacity) : 0 });
      }
      await new Promise(r => setTimeout(r, 40));
    }
    return rows;
  });
  await ctx.close();
  return out;
}

/* How long the crest is forward: first sample with the class to last. */
const holdOf = rows => { const l = rows.filter(s => s.lead);
  return l.length ? l[l.length - 1].t - l[0].t : 0; };

console.log('\nthe whole crest, at every moment of the journey');
await watch(390, 844);          // the load that seeds, so the rest find it there
for (const [w, h] of [[375, 812], [390, 844], [430, 932], [834, 1112]]) {
  const rows = await watch(w, h);
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

const main = await watch(390, 844);

console.log('\nsolid from the first frame');
/* The complaint that mattered: "sometimes it shows the full crest and then
   fades, others it pops mid fade". A crest caught half way through fading IN
   is a pale crest, and which one you got depended on when the tournament
   happened to arrive. It does not fade in any more, so the very first frame
   it is on screen is already the whole thing. */
const firstLead = main.find(s => s.lead);
console.log('        first frame at opacity ' + (firstLead ? firstLead.op : '?'));
ok('the first frame is already full strength', firstLead && firstLead.op > 0.95, true);
ok('and it is already at its full size', firstLead
  && Math.abs(firstLead.w - main.filter(x => x.lead).reduce((a, x) => Math.min(a, x.w), Infinity)) < 2, true);
ok('no frame of it is ever a faint crest', main.filter(
  s => s.lead && s.op < 0.95).length, 0);

console.log('\nheld for exactly as long as it is meant to be');
/* The hold is the time the crest spends FORWARD, which is now the time it
   spends at full strength too, because it neither fades in nor starts fading
   out until it is let go. Measuring `opacity > 0.9` instead would quietly
   add the first slice of the fade — about a seventh of a second of a second
   and a half — and report a hold nobody asked for. */
const held = holdOf(main);
console.log('        held at full strength for ' + held + 'ms');
/* 1800ms, asked for by name. The sampler runs on a 40ms tick, so allow it
   one tick at each end. */
ok('it stands still for about one and four fifths of a second',
  held >= 1720 && held <= 1900, true);

console.log('\nit zooms out; it does not merely fade');
/* Not the first sample with the class on it — that one is caught with the
   transition barely started, still at very nearly the resting size, and it
   would report a journey of nothing at all. The tightest moment is the one
   the eye reads as the crest being held up close. */
const lead = main.filter(s => s.lead);
const tightest = lead.reduce((a, s) => Math.min(a, s.w), Infinity);
const last = main[main.length - 1];
console.log('        ' + Math.round(tightest) + 'px across, out to ' + Math.round(last.w) + 'px');
ok('it came forward at all', lead.length > 0, true);
ok('and opens out from there', last.w > tightest * 1.15, true);
ok('a good deal — this is a zoom, not a dissolve', last.w / tightest > 1.2, true);

console.log('\nand then it gets out of the way');
ok('the book is fully visible', last.book > 0.99, true);
ok('the crest is a watermark again', last.op < 0.1, true);
const cleared = main.find(s => s.t > firstLead.t && !s.lead);
console.log('        crest cleared at ' + (cleared ? cleared.t : '?') + 'ms');
ok('the crest does clear', !!cleared, true);

console.log('\nand with the wire cut, the very same opening');
/* This is the other half of "why is it inconsistent". The hold used to be
   measured to the moment the tournament ARRIVED, so a slow open held the
   crest longer than a quick one and no two openings looked alike. The hold
   is now the hold: with nothing answering at all, the crest goes up at the
   same moment, stays exactly as long, and the book comes up behind its own
   load bar. */
const gone = await watch(390, 844, true);
const up = gone.find(s => s.lead);
const down = gone.find(s => up && s.t > up.t && !s.lead);
ok('the crest still came forward', !!up, true);
ok('and the book still appeared', gone[gone.length - 1].book > 0.99, true);
const deadHeld = holdOf(gone);
console.log('        with nothing answering: up at ' + (up ? up.t : '?')
  + 'ms, held ' + deadHeld + 'ms, cleared at ' + (down ? down.t : '?') + 'ms');
ok('it comes up at the same moment', !!up && Math.abs(up.t - firstLead.t) < 200, true);
ok('and is held for the same length of time', Math.abs(deadHeld - held) < 200, true);
ok('so the opening is the same one either way', !!down && Math.abs(down.t - cleared.t) < 250, true);

await b.close();
server.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
  : '\nThe whole crest, long enough to read, and gone when it should be.');
process.exit(fails.length ? 1 : 0);
