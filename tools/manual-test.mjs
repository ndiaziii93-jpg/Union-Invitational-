/* THE PRACTICE MANUAL. Under the three things on every report card: twelve
   to fifteen drills picked from the grades, each drawn, scored and with a
   coach on video; a sheet in the book, a link in the public report's
   pop-up, and a page of its own that prints. The book here is a seeded
   sandbox and the page reads a stand-in for the database.
   Run: node tools/manual-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

console.log('the pick');
const DR = await import('../src/drills.js');
const { ART_KEYS } = await import('../src/drillart.js');
ok('every drill is drawn and has a coach on video', [DR.DRILLS.length, DR.DRILLS.filter(d => !ART_KEYS.includes(d.art)).length, DR.DRILLS.filter(d => !(d.video && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(d.video.url) && d.video.who && d.video.title)).length, DR.DRILLS.filter(d => !(d.why && d.setup.length && d.steps.length && d.score && d.target && d.harder)).length], [31, 0, 0, 0]);
const pick = g => DR.manualFor({ id: 'x', name: 'X', band: 20, grades: g });
const weak = pick({ putting: 'D', par3: 'C', par4: 'B', par5: 'A', composure: 'C', consistency: 'B', team: 'A' });
const count = (l, k) => l.filter(d => d.forDept === k).length;
ok('twelve to fifteen drills, the weakest department with the most, every C or D with one, the two fundamentals last', [weak.length, count(weak, 'putting') > count(weak, 'par3'), count(weak, 'par3') >= count(weak, 'composure'), count(weak, 'composure') >= 1, weak.slice(-2).map(d => d.id), weak.slice(-2).every(d => d.forDept === null)], [15, true, true, true, ['warmup', 'mirror'], true]);
ok('a golfer with no grades yet still gets a manual', [pick({}).length >= 12, pick({}).some(d => d.id === 'warmup')], [true, true]);
ok('no drill twice, and the week plan holds every one', [new Set(weak.map(d => d.id)).size, DR.weekPlan(weak).flatMap(s => s.drills).length], [15, 15]);

/* the book, served, with a stand-in photo store */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
mkdirSync(S + '/mnsite', { recursive: true });
writeFileSync(S + '/mnsite/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const server = createServer((req, res) => {
  let q = decodeURIComponent(req.url.split('?')[0]); if (q.endsWith('/')) q += 'index.html';
  const file = q.startsWith('/docs/') ? join('docs', q.slice(6)) : join(S + '/mnsite', q);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
await p.goto(BASE); await p.waitForTimeout(3000);
const DP = { raw: [6, 3, 6, 4, 6, 5, 6, 4, 6, 5, 3, 4, 4, 4, 3, 6, 3, 7], putts: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 2, 6: 3, 7: 1, 8: 2, 9: 1, 10: 1, 11: 2, 12: 2, 13: 2, 14: 2, 15: 3, 16: 1, 17: 3 }, marks: { 4: ['water'] }, by: {}, at: {}, pu: {}, mF: false, mB: false, bb: true };
const DW = { raw: [6, 5, 7, 4, 8, 6, 7, 5, 6, 6, 5, 6, 5, 7, 6, 5, 6, 8], putts: {}, marks: { 13: ['ob'], 17: ['ob'] }, by: {}, at: {}, pu: { 14: true }, mF: false, mB: false, bb: false };
const rows = await p.evaluate(([DP, DW]) => {
  const T = window.__T;
  const gs = T.config.people.filter(x => x.role === 'golfer');
  gs.forEach((g, i) => { g.band = [16, 30, 20, 25, 15, 20, 25, 20, 30, 16, 20][i] || 20; g.location = i % 2 ? 'UK' : 'USA'; });
  for (const rid of ['r1', 'r2', 'r3']) {
    T.config.rounds[rid].state = 'closed';
    gs.forEach((g, i) => { const base = i % 2 ? DW : DP; T.scores[rid + '__' + g.id] = { ...base, raw: base.raw.map((x, h) => Math.max(2, x + ((i * 7 + h + rid.length) % 3) - 1)), rev: 1 }; });
  }
  T.recaps.report = { status: 'published', at: Date.now(), body: { summary: ['The State of the Union, paragraph one.'], players: { [gs[0].id]: { read: 'A tidy golfer with a putting problem.', letter: ['Dear golfer, a letter.'], three: ['Lay up', 'Lag putt', 'Breathe'] } } } };
  window.__forceRender();
  /* the same book as the database holds it, for the pages */
  const { people, pairs, ...cfg } = T.config;
  return [{ path: 'config/tournament', doc: cfg }, ...people.map(x => ({ path: 'people/' + x.id, doc: x })), ...pairs.map(x => ({ path: 'pairs/' + x.id, doc: x })),
    ...Object.entries(T.scores).map(([k, v]) => ({ path: 'scores/' + k, doc: v })), ...Object.entries(T.recaps).map(([k, v]) => ({ path: 'recaps/' + k, doc: v }))];
}, [DP, DW]);
await p.waitForTimeout(300);
const pid = await p.evaluate(() => window.__T.config.people.find(x => x.role === 'golfer').id);

console.log('\nin the book');
await act('go', { a: 'boards' }); await act('boardTab', { a: 'report' }); await p.waitForTimeout(400);
await act('reportPlayer', { a: pid }); await p.waitForTimeout(400);
ok('the report card carries the manual block under the three things, with a button and the page link', [await p.locator('.rplayer .rp-three + .rp-manual').count(), await p.locator('.rplayer .rp-manual [data-act="manualOpen"]').count(), await p.locator('.rplayer .rp-manual a[href$="manual/?p=' + pid + '"]').count()], [1, 1, 1]);
await p.locator('.rplayer .rp-manual [data-act="manualOpen"]').click(); await p.waitForTimeout(500);
const sheet = await p.evaluate(() => { const s = document.querySelector('.mnsheet'); return { n: s.querySelectorAll('.mn-drill').length, art: s.querySelectorAll('.mn-drill .da').length, videos: [...s.querySelectorAll('.mn-video')].filter(a => /youtube\.com\/watch/.test(a.href) && a.target === '_blank').length, three: s.querySelectorAll('.mn-three li').length, grades: s.querySelectorAll('.mn-grades .mn-g').length, plan: s.querySelectorAll('.mn-sess').length, wide: s.scrollWidth - s.clientWidth, pdf: !!s.querySelector('.acts a[href*="manual/?p="]') }; });
ok('the sheet: every drill drawn and with its coach, the three things, the grades, the week, no sideways scroll, a way to the page', [sheet.n >= 12 && sheet.n <= 15, sheet.art === sheet.n, sheet.videos === sheet.n, sheet.three, sheet.grades, sheet.plan >= 3, sheet.wide <= 1, sheet.pdf], [true, true, true, 3, 7, true, true, true]);
ok('nothing in the book points at Claude', await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('no errors in the book', errs, []);

console.log('\nthe pages');
const q = await ctx.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(String(e)));
await q.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
await q.route(/supabase\.co\/(?!rest)/, route => route.abort());
await q.goto(BASE + 'docs/manual/?p=' + pid); await q.waitForSelector('.mn-drill', { timeout: 20000 });
const page = await q.evaluate(() => ({ title: document.title, n: document.querySelectorAll('.mn-drill').length, bar: !document.getElementById('mnbar').hidden, pdf: !!document.querySelector('#mnbar button'), wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, doctype: !!document.doctype, print: [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.media && /print/.test(r.media.mediaText)); } catch (e) { return false; } }), claude: [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length, read: /putting problem/.test(document.body.innerText) }));
ok('the page: the golfer\'s manual, Save as PDF, a print layout, its own doctype, nothing sideways, nothing of Claude', [/practice manual/.test(page.title), page.n >= 12, page.bar, page.pdf, page.wide <= 1, page.doctype, page.print, page.claude, page.read], [true, true, true, true, true, true, true, 0, true]);
ok('the drawings move by the browser\'s own SVG animation, along the drawn paths', await q.evaluate(() => { const s = document.querySelectorAll('.mn-drill svg.da'); return [s.length > 0, [...s].every(x => x.querySelector('animate, animateMotion, animateTransform')), [...s].some(x => x.querySelector('animateMotion[path]')), [...s].every(x => !x.animationsPaused())]; }), [true, true, true, true]);
await q.screenshot({ path: S + '/manual-page.png', fullPage: false });
await q.locator('.mn-drill').nth(0).screenshot({ path: S + '/manual-drill1.png' });
await q.locator('.mn-drill').nth(5).screenshot({ path: S + '/manual-drill6.png' });
await q.goto(BASE + 'docs/manual/'); await q.waitForSelector('.mn-index', { timeout: 20000 });
ok('with no golfer named, the page lists them', [await q.locator('.mn-index .rp-row').count(), await q.locator('#mnbar').isHidden()], [11, true]);
await q.goto(BASE + 'docs/recap/?r=report'); await q.waitForSelector('.rp-row', { timeout: 20000 });
ok('the public report\'s pop-up links to the manual page', await q.evaluate(pid => document.querySelectorAll('.rp-pop[data-pop="' + pid + '"] .rp-manual a[href$="manual/?p=' + pid + '"]').length, pid), 1);
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const r = await ctx3.newPage();
await r.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
await r.route(/supabase\.co\/(?!rest)/, route => route.abort());
await r.goto(BASE + 'docs/manual/?p=' + pid); await r.waitForSelector('.mn-drill', { timeout: 20000 });
ok('a reader who asked for less motion gets the drawings still', await r.evaluate(() => [...document.querySelectorAll('.mn-drill svg.da')].every(x => x.animationsPaused())), true);
await ctx3.close();
ok('no errors on the pages', errs2, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
