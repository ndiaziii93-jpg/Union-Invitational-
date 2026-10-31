/* THE RECAP PAGE. The day's report as a link anyone in the WhatsApp group can
   open: docs/recap/?r=r1, served over HTTP like GitHub Pages serves it, with
   the shared book answered by a stand-in so nothing here reads or writes the
   real one. The page must carry the whole recap as the book lays it out —
   headline, words, tiles, Pairs Championship in points, every card, the MVP
   race, the Bingo, the honours, the photos — fit a phone, and link to
   nothing on claude.ai.
   Run: node tools/recap-page-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const file = join('docs', normalize(p).replace(/^(\.\.[/\\])+/, ''));
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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
/* read as written, not as the stylesheet sets it: small caps are a look */
const text = async sel => (await p.locator(sel).first().evaluate(e => e.textContent)).replace(/\s+/g, ' ').trim();
const texts = async sel => (await p.locator(sel).evaluateAll(es => es.map(e => e.textContent))).map(t => t.replace(/\s+/g, ' ').trim());

/* The book, as documents: the sandbox's own roster and courses, Round 1 under
   way with four cards in, a report written and shared, two photos. */
writeFileSync(S + '/recap-src.html', '<!doctype html><html><head><meta charset="utf-8"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const seed = await ctx.newPage();
await seed.goto('file://' + S + '/recap-src.html'); await seed.waitForTimeout(3000);
const rows = await seed.evaluate(BASE => {
  const T = window.__T;
  const card = raw => ({ raw: raw.concat(Array(18 - raw.length).fill(null)), by: Object.fromEntries(raw.map((_, i) => [i, 's1'])), at: {}, marks: {}, mF: false, mB: false, bb: false });
  const people = T.config.people.map(x => ({ ...x, band: { g1: 20, g2: 25, g6: 20, s4: 25 }[x.id] || x.band, role: x.id === 's4' ? 'golfer' : x.role,
    location: { g1: 'UK', g2: 'UK', g6: 'USA', s4: 'USA' }[x.id] || null }));
  const cfg = { ...T.config, people: [], pairs: [], rosterInDocs: true, rev: 3 };
  cfg.rounds = { ...cfg.rounds, r1: { ...cfg.rounds.r1, state: 'open', ctpHole: 5, ctpWinner: 'g6' } };
  const out = [{ path: 'config/tournament', doc: cfg }];
  people.forEach(x => out.push({ path: 'people/' + x.id, doc: x }));
  [{ id: 'p1', members: ['g1', 'g2'] }, { id: 'p3', members: ['g6', 's4'] }].forEach(x => out.push({ path: 'pairs/' + x.id, doc: x }));
  out.push({ path: 'scores/r1__g6', doc: card([4, 2, 6, 4, 9, 4, 5, 3, 4]) }, { path: 'scores/r1__s4', doc: card([5, 4, 6, 5, 7, 5]) },
    { path: 'scores/r1__g1', doc: card([5, 4, 5, 4, 6, 4, 5, 3, 5]) }, { path: 'scores/r1__g2', doc: card([5, 5, 5, 4, 6, 5, 5, 4, 5]) });
  out.push({ path: 'bbb/r1', doc: { holes: Array.from({ length: 18 }, (_, i) => i < 6 ? { g: { t0: { bingo: 'g6', bango: 'g1', bongo: i % 2 ? 'g2' : 's4' } } } : {}) } });
  out.push({ path: 'recaps/r1', doc: { rid: 'r1', status: 'published', at: Date.now(), body: {
    headline: 'Ray V birdies the second and the water takes the rest',
    narrative: ['Round 1 at Olympos opened under a high sky.', 'By the turn the pairs were a point apart.', 'Drea’s bongo on the fourth was the shot of the morning.'],
    swing: { value: '2 points', caption: 'the leaders pulled away over the third and fourth.' },
    pairNotes: { p3: 'Steady from Drea, fireworks from Ray.' },
    honours: [{ slot: 'shot_of_the_day', winner: 'g6', citation: 'A two on the second.' }] } } });
  out.push({ path: 'recaps/practice', doc: { rid: 'practice', status: 'draft', body: { headline: 'Not shared yet', narrative: ['Secret.'] } } });
  out.push({ path: 'photos/ph1', doc: { id: 'ph1', rid: 'r1', url: BASE + 'app/icon-512.png', at: 2, byName: 'Drea', hole: 3 } },
            { path: 'photos/ph2', doc: { id: 'ph2', rid: 'r1', url: BASE + 'app/icon-512.png', at: 1, byName: 'Ray V' } });
  return out;
}, BASE);
await seed.close();

/* the stand-in book: every read of the docs table is answered from the rows above */
let asked = 0;
await p.route(/\/rest\/v1\/docs/, route => { asked++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }); });
await p.route(/supabase\.co\/(?!rest)/, route => route.abort());

console.log('\nthe page, as the group would open it');
await p.goto(BASE + 'recap/?r=r1'); await p.waitForSelector('.rechead', { timeout: 20000 }); await p.waitForTimeout(600);
ok('it read the book once', asked, 1);
ok('a whole document, that fits a phone', [await p.evaluate(() => !!document.doctype), await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)], [true, true]);
ok('the headline is on the front, over the photos', await text('.rhero .rechead'), 'Ray V birdies the second and the water takes the rest');
ok('with the round, the course and the day', await text('.rh-k'), 'Round 1 of 3 · Cullinan Aspendos · Friday 30 Oct');
ok('the photos of the round slide across the top, newest first', [await p.locator('.rh-slide').count(), await p.locator('.rh-slide').first().getAttribute('data-by')], [2, 'Drea']);
ok('the tiles: leading pair in points, the swing, the cards in', (await texts('.rtile .rt-l')), ['Leading pair', 'Swing of the day', 'Cards in']);
ok('the leading pair’s tile is points with raw beside', /^Leading pair ?\d+ ?pts ?[+−E]\d* raw ?Ray V & Drea$/.test(await text('.rtile')), true);
ok('the words, under a byline', [await text('.byline b'), await p.locator('.artbody .recpara').count(), await text('.artbody .recpara.lead')], ['By the Union Register', 3, 'Round 1 at Olympos opened under a high sky.']);
ok('a photo set between the paragraphs', await p.locator('.artbody .rinline').count(), 1);
ok('two pairs: no swing to report, and the tile says so', [await p.locator('.swing').count(), await text('.rtile:nth-child(2) .rt-n')], [0, 'Not yet']);
ok('the leaders’ hole by hole', await p.locator('.ribcell').count(), 18);
ok('the Pairs Championship in points, the writer’s note on a pair under its name', [await texts('.rectable').then(t => t[0].includes('pts · raw')), await text('.rectable .row.lead .rt-who')], [true, 'Ray V & DreaSteady from Drea, fireworks from Ray.']);
ok('every card, with handicaps', (await texts('.recfield .row .rt-who')).slice(0, 2), ['Ray Vhcp 20 · thru 9', 'Norberto IIIhcp 20 · thru 9']);
ok('the Ryder Cup: a row a singles match, UK on the left, and the cup score', [await p.locator('.reccup .row').count(), (await texts('.reccup .rc-a')).every(t => t.startsWith('🇬🇧')),
  /The cup: United Kingdom \d+ – \d+ United States/.test(await text('.reccupline'))], [2, true, true]);
ok('it sits after the Pairs Championship and before every card', await p.evaluate(() => [...document.querySelectorAll('h3.sub')].map(h => h.textContent.trim()).filter(t => /Pairs|Ryder|Every card/.test(t))), ['Pairs Championship', 'Ryder Cup', 'Every card']);
ok('the MVP race and the Bingo', [await p.locator('.recmvp .row').count(), (await texts('.recbbb .row .rt-who'))[0]], [4, 'Norberto III0 bingo · 6 bango · 0 bongo']);
ok('the honours and the side games', [await text('.honour .rt-v'), await text('.recapcols .row .rt-v')], ['Ray V', 'Ray V']);
ok('closest to the pin read off the round', (await texts('.recapcols .row')).some(t => /Closest to the pin, 5 Ray V/.test(t)), true);
ok('the photos from the round, each a link to the full picture', [await p.locator('.phstrip .ph a[target=_blank]').count(), await text('.phstrip .ph figcaption')], [2, 'Hole 4 Drea']);
ok('and what is up next', /^Up next Round 2/.test(await text('.upnext')), true);
ok('nothing on it points at Claude', await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('and the way into the book is on the page', await p.locator('.recaptop a.rm[href="../app/"]').count(), 1);
ok('the page is titled for the share preview', await p.title(), 'Ray V birdies the second and the water takes the rest · Round 1 — Four-ball Stableford team play · The Union Invitational');
if (SHOTS) { await p.screenshot({ path: `${SHOTS}/recap-page.png`, fullPage: true }); }

console.log('\na report not yet shared');
await p.goto(BASE + 'recap/?r=practice'); await p.waitForSelector('.rechead', { timeout: 20000 }); await p.waitForTimeout(400);
ok('keeps its words to itself', [await text('.rhero .rechead'), await p.locator('.byline').count()], ['Practice — Get Loose Foursomes', 0]);
ok('while the standings are still there', await p.locator('.rectable').count() > 0, true);
await p.goto(BASE + 'recap/'); await p.waitForSelector('.rechead', { timeout: 20000 }); await p.waitForTimeout(400);
ok('with no round named, the page opens on the latest shared report', await p.evaluate(() => window.__rid), 'r1');

ok('no errors on the way', errs, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
