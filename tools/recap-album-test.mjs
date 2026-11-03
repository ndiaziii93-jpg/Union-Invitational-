/* EVERY PHOTO OF THE ROUND ON THE FRONT OF THE RECAP. The photographs across
   the top used to stop at fifteen. Now every photo of the round cycles by, and
   each is tappable: full screen, paged with arrows, a swipe or the keys. The
   words are never touched.
   Run: node tools/recap-album-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const N = 40;
const NARR = [1, 2, 3, 4, 5, 6].map(n => 'Paragraph ' + n + ' of Round 2, a proper long paragraph with names, a hole and a score in it, so that it counts as real writing and stays exactly as written.');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* ---------- in the book ---------- */
writeFileSync(S + '/album.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + S + '/album.html'); await p.waitForTimeout(3000);
for (let i = 0; i < 4; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } }
await p.evaluate(([N, NARR]) => { const T = window.__T;
  T.recaps.r2 = { rid: 'r2', status: 'published', at: Date.now(), body: { headline: 'Saturday at Olympos', narrative: NARR, voices: [] } };
  for (let i = 0; i < N; i++) T.photos['p' + i] = { id: 'p' + i, rid: 'r2', hole: i % 18, url: 'https://x.test/p' + i + '.jpg', at: 1000 + i, byName: 'Drea' };
  T.photos.pv = { id: 'pv', rid: 'r2', kind: 'video', url: 'https://x.test/v.mp4', at: 5 };
  Object.assign(window.__UI, { recapOpen: true, recap: { rid: 'r2', busy: false, err: '', stream: '', edit: false, view: 'report' } }); window.__forceRender(); }, [N, NARR]);
await p.waitForTimeout(500);
const textBefore = await p.locator('.artbody .recpara').allInnerTexts();
ok('every photo of the round is on the front, not just fifteen (a clip is not a slide)', await p.locator('.rh-slide').count(), N);
ok('and each one can be tapped', await p.locator('.rh-slide.open[data-act="recapAlbum"]').count(), N);
await p.locator('.rh-slide').nth(3).dispatchEvent('click'); await p.waitForTimeout(300);
ok('a tap opens it full screen, saying where it is in the round', [await p.locator('.pviewer').count(), (await p.locator('.pviewer .pv-top span').innerText()).trim()], [1, '4 of ' + N]);
await p.locator('.pv-nav.r').click(); await p.waitForTimeout(200);
ok('the arrow goes to the next', (await p.locator('.pviewer .pv-top span').innerText()).trim(), '5 of ' + N);
for (let i = 0; i < 5; i++) await p.locator('.pv-nav.l').click();
await p.waitForTimeout(200);
ok('and round the end to the last', (await p.locator('.pviewer .pv-top span').innerText()).trim(), N + ' of ' + N);
await p.locator('.pviewer [data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('Done puts it away and the report is where it was', [await p.locator('.pviewer').count(), await p.locator('.rechead').count()], [0, 1]);
ok('the words are untouched', await p.locator('.artbody .recpara').allInnerTexts(), textBefore);
ok('and the report text in the book is as written', await p.evaluate(() => window.__T.recaps.r2.body.narrative.length), 6);
ok('no errors in the book', errs, []);
await ctx.close();

/* ---------- the public page ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let q = decodeURIComponent(req.url.split('?')[0]); if (q.endsWith('/')) q += 'index.html';
  const file = join('docs', normalize(q).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const seed = await ctx2.newPage();
await seed.goto('file://' + S + '/album.html'); await seed.waitForTimeout(3000);
const rows = await seed.evaluate(([BASE, N, NARR]) => { const T = window.__T;
  const cfg = { ...T.config, people: [], pairs: [], rosterInDocs: true, rev: 3 };
  const out = [{ path: 'config/tournament', doc: cfg }];
  T.config.people.forEach(x => out.push({ path: 'people/' + x.id, doc: x }));
  out.push({ path: 'recaps/r2', doc: { rid: 'r2', status: 'published', at: Date.now(), body: { headline: 'Saturday at Olympos', narrative: NARR, voices: [] } } });
  for (let i = 0; i < N; i++) out.push({ path: 'photos/p' + i, doc: { id: 'p' + i, rid: 'r2', hole: i % 18, url: BASE + 'app/icon-512.png?n=' + i, at: 1000 + i, byName: 'Drea' } });
  return out; }, [BASE, N, NARR]);
await seed.close();
const q = await ctx2.newPage();
const errs2 = []; q.on('pageerror', e => errs2.push(String(e)));
await q.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
await q.route(/supabase\.co\/(?!rest)/, route => route.abort());
await q.goto(BASE + 'recap/?r=r2'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(600);
ok('the page’s front has every photo too, each tappable', [await q.locator('.rh-slide').count(), await q.locator('.rh-slide.open[data-full]').count()], [N, N]);
ok('with a count, and no row of forty dots', [(await q.locator('.rh-count').innerText()).includes('/ ' + N), await q.locator('.rh-dots').count()], [true, 0]);
await q.locator('.rh-slide').nth(2).click(); await q.waitForTimeout(300);
const cap = () => q.locator('#rfull .rfull-cap').innerText();
ok('a tap opens it full screen with its place in the set', [await q.locator('#rfull').count(), (await cap()).startsWith('3 / ' + N)], [1, true]);
await q.locator('#rfull .rfull-nav.r').click(); await q.waitForTimeout(150);
ok('the arrow pages on', (await cap()).startsWith('4 / ' + N), true);
await q.keyboard.press('ArrowLeft'); await q.keyboard.press('ArrowLeft'); await q.keyboard.press('ArrowLeft'); await q.keyboard.press('ArrowLeft'); await q.waitForTimeout(150);
ok('the keys page back, and round the start to the end', (await cap()).startsWith(N + ' / ' + N), true);
await q.keyboard.press('Escape'); await q.waitForTimeout(150);
ok('Escape puts it away', await q.locator('#rfull').count(), 0);
await q.locator('.artbody .rin-open').first().click().catch(() => {}); await q.waitForTimeout(200);
ok('the photos in the article still open on their own, paging among the article’s', await q.evaluate(() => { const o = document.getElementById('rfull'); return o ? document.querySelectorAll('.artbody [data-full]').length > 0 : 'none'; }), true);
ok('the words on the page are as written', await q.locator('.artbody .recpara').count(), 6);
ok('no errors on the page', errs2, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
