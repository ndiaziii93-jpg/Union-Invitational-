/* THE TOURNAMENT RECAP. After the last day's report, the whole week in the same
   size and style, in gold: a card under that report that glows until opened,
   a gold chip among the days, written by the book itself from the brief of the
   whole week, and a page of its own the group can open (docs/recap/?r=week).
   The writer is a stand-in and the shared book is answered from documents, so
   nothing here reads or writes the real one.
   Run: node tools/week-recap-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SHOTS = process.env.SHOTS || '';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const P = n => 'This is paragraph number ' + n + ' of the week, long enough to be a real paragraph about the golf and the banter across Belek, with a score, a hole and a name in it so that it reads as a feature would.';
const story = ns => JSON.stringify({ headline: 'Seven days, three rounds and one very sore loser', narrative: ns.map(P) });
const extras = JSON.stringify({ voices: [], swing: { value: '9 points', caption: 'the gap between first and last.' }, pairNotes: {},
  honours: [{ slot: 'golfer_of_the_week', winner: 'g10', citation: 'Too good, too often.' }, { slot: 'heroic_failure', winner: 'g6', citation: 'A nine, with style.' }] });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* ---------- in the book ---------- */
writeFileSync(S + '/week.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(a => {
  window.__asked = [];
  const fn = async input => { const q = String(input); window.__asked.push(q);
    if (/THE EXTRAS ONLY/.test(q)) return { text: a.extras, truncated: false };
    if (/CARRY THE STORY ON/.test(q)) return { text: a.more, truncated: false };
    return { text: a.story, truncated: false }; };
  window.claude = { use: async name => name === 'sample' ? fn : null };
}, { extras, story: story([1, 2, 3, 4, 5]), more: story([6, 7, 8, 9]) });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + S + '/week.html'); await p.waitForTimeout(3000);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
await shut();
const openRound = rid => p.evaluate(rid => { Object.assign(window.__UI, { recapOpen: true, recap: { rid, busy: false, err: '', stream: '', edit: false, view: 'report' } }); window.__forceRender(); }, rid);

console.log('\nbefore the last day has a report');
await openRound('r3');
ok('there is no gold card and no gold chip', [await p.locator('.weekcard').count(), await p.locator('.chip.gold').count()], [0, 0]);

console.log('\nonce the last day’s report is written');
await p.evaluate(() => { const T = window.__T; T.recaps.r3 = { rid: 'r3', status: 'published', at: Date.now(), body: { headline: 'Sunday at Olympos', narrative: ['A long, real paragraph about the last day at Olympos with names, holes and scores in it, enough words to count as one.'] } }; });
await openRound('r3');
const dump = await p.evaluate(() => ({ card: !!document.querySelector('.weekcard'), glow: !!document.querySelector('.weekcard.glow'), chip: !!document.querySelector('.chip.gold'),
  cardText: (document.querySelector('.weekcard') || {}).textContent || '', after: (() => { const c = document.querySelector('.weekcard'), g = document.querySelector('.recapgrid'); return !!(c && g && (g.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)); })() }));
ok('a gold card sits under the report, glowing', [dump.card, dump.glow, dump.after], [true, true, true]);
ok('and a gold chip among the days', dump.chip, true);
ok('the card says what it is', /The Tournament Recap/.test(dump.cardText) && /Write it/.test(dump.cardText), true);

console.log('\nopening it writes the week');
await p.locator('.weekcard').first().click();
await p.waitForFunction(() => window.__T.recaps.week && window.__T.recaps.week.body, null, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(400);
const wk = await p.evaluate(() => ({ body: (window.__T.recaps.week || {}).body || null, status: (window.__T.recaps.week || {}).status, asked: window.__asked.map(q => /THE EXTRAS ONLY/.test(q) ? 'extras' : /CARRY THE STORY ON/.test(q) ? 'more' : 'story'),
  brief: (window.__asked[0] || '').includes('THE TOURNAMENT BRIEF'), sports: /professional sports writer/.test(window.__asked[0] || ''), r3: (window.__asked[0] || '').includes('Sunday at Olympos') }));
ok('story, carry-on, extras', wk.asked, ['story', 'more', 'extras']);
ok('written from the tournament brief, as a sports writer, with the days’ reports in it', [wk.brief, wk.sports, wk.r3], [true, true, true]);
ok('nine paragraphs, headline and honours kept', [wk.body && wk.body.narrative.length, wk.body && wk.body.headline, wk.body && wk.body.honours.map(h => h.slot)], [9, 'Seven days, three rounds and one very sore loser', ['golfer_of_the_week', 'heroic_failure']]);
ok('and shared with the group, since the book wrote it', wk.status, 'published');
const view = await p.evaluate(() => ({ gold: !!document.querySelector('.recapbox.gold'), head: (document.querySelector('.rhero .rechead') || {}).textContent, paras: document.querySelectorAll('.artbody .recpara').length,
  honours: [...document.querySelectorAll('.honour .who')].length, link: /recap\/\?r=week/.test(document.body.innerHTML) }));
ok('it opens in gold, in the day’s own layout', [view.gold, view.head, view.paras], [true, 'Seven days, three rounds and one very sore loser', 9]);
await p.evaluate(() => { window.__UI.recapOpen = false; window.__forceRender(); });
await openRound('r3');
ok('and keeps glowing until opened once it exists', await p.locator('.weekcard.glow').count(), 1);
await p.locator('.weekcard').first().click(); await p.waitForTimeout(300);
await openRound('r3');
ok('opened, it stops glowing', [await p.locator('.weekcard').count(), await p.locator('.weekcard.glow').count(), await p.locator('.chip.gold.glow').count()], [1, 0, 0]);
ok('no errors in the book', errs, []);
await ctx.close();

/* ---------- the page ---------- */
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
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const seed = await ctx2.newPage();
await seed.goto('file://' + S + '/week.html'); await seed.waitForTimeout(3000);
const rows = await seed.evaluate(([BASE, narr]) => {
  const T = window.__T;
  const card = raw => ({ raw: raw.concat(Array(18 - raw.length).fill(null)), by: Object.fromEntries(raw.map((_, i) => [i, 's1'])), at: {}, marks: {}, mF: false, mB: false, bb: false });
  const people = T.config.people.map(x => ({ ...x, band: { g1: 20, g2: 25, g6: 20, s4: 25 }[x.id] || x.band, location: { g1: 'UK', g2: 'UK', g6: 'USA', s4: 'USA' }[x.id] || null }));
  const cfg = { ...T.config, people: [], pairs: [], rosterInDocs: true, rev: 3 };
  const out = [{ path: 'config/tournament', doc: cfg }];
  people.forEach(x => out.push({ path: 'people/' + x.id, doc: x }));
  [{ id: 'p1', members: ['g1', 'g2'] }, { id: 'p3', members: ['g6', 's4'] }].forEach(x => out.push({ path: 'pairs/' + x.id, doc: x }));
  ['r1', 'r2', 'r3'].forEach(r => out.push({ path: 'scores/' + r + '__g6', doc: card([4, 2, 6, 4, 9, 4, 5, 3, 4]) }, { path: 'scores/' + r + '__g1', doc: card([5, 4, 5, 4, 6, 4, 5, 3, 5]) }));
  const day = (rid, h) => out.push({ path: 'recaps/' + rid, doc: { rid, status: 'published', at: Date.now(), body: { headline: h, narrative: ['A long, real paragraph about ' + rid + ' with names, holes and scores in it, enough words to count as one.'] } } });
  day('r1', 'Round one'); day('r2', 'Round two'); day('r3', 'Round three');
  out.push({ path: 'recaps/week', doc: { rid: 'week', status: 'published', at: Date.now(), body: { headline: 'Seven days, three rounds and one very sore loser', narrative: narr,
    voices: [{ who: 'Drea', para: 2, hole: 3, rid: 'r1', text: 'Bongo on the fourth, thank you very much.' }],
    swing: { value: '9 points', caption: 'the gap between first and last.' }, pairNotes: {},
    honours: [{ slot: 'golfer_of_the_week', winner: 'g6', citation: 'Too good, too often.' }, { slot: 'heroic_failure', winner: 'g1', citation: 'A nine, with style.' }] } } });
  [['ph1', 'r1', 1, 3], ['ph2', 'r2', 2, 5], ['ph3', 'r3', 3, 8], ['ph4', 'r1', 4, null]].forEach(([id, rid, at, hole]) =>
    out.push({ path: 'photos/' + id, doc: { id, rid, url: BASE + 'app/icon-512.png', at, byName: id === 'ph1' ? 'Drea' : 'Ray V', hole } }));
  return out;
}, [BASE, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => 'Paragraph ' + n + ' of the week, a proper long paragraph with names, a hole and a score in it, so that it counts as real writing on the page.')]);
await seed.close();
const q = await ctx2.newPage();
const errs2 = []; q.on('pageerror', e => errs2.push(String(e)));
await q.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
await q.route(/supabase\.co\/(?!rest)/, route => route.abort());
const text = async sel => (await q.locator(sel).first().evaluate(e => e.textContent)).replace(/\s+/g, ' ').trim();

console.log('\nthe page for the whole week');
await q.goto(BASE + 'recap/?r=week'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(600);
ok('a whole document in gold, that fits a phone', [await q.locator('.recapbox.gold').count(), await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)], [1, true]);
ok('the headline is over the photos of the week', [await text('.rhero .rechead'), await q.locator('.rh-slide').count()], ['Seven days, three rounds and one very sore loser', 4]);
ok('a byline and nine paragraphs', [await text('.byline b'), await q.locator('.artbody .recpara').count()], ['By the Union Register', 9]);
ok('photos set between paragraphs, and the quote under the one it is tagged for with its round and hole',
  [await q.locator('.artbody .rinline').count() > 0, await q.evaluate(() => { const v = document.querySelector('.artbody blockquote.rvoice'); return v ? [v.previousElementSibling.className, v.querySelector('.rv-h').textContent.replace(/\s+/g, ' ').trim()] : null; })],
  [true, [await q.evaluate(() => document.querySelectorAll('.artbody .rinline')[1] ? 'rinline' : 'rinline'), '· R1 hole 4']]);
ok('the quote’s hole is matched to a photo of that hole', await q.evaluate(() => [...document.querySelectorAll('.artbody .rinline figcaption')].some(f => /Hole 4/.test(f.textContent))), true);
ok('the honours, in the week’s own categories', [await q.locator('.honour').count(), (await q.locator('.honour .who').allInnerTexts()).map(t => t.split('\n')[0].trim())], [5, ['Golfer of the week', 'Round of the week', 'Shot of the week', 'Most improved', 'Heroic failure']]);
ok('the winners are named', (await q.locator('.honour .rt-v').allInnerTexts()).filter(t => t.trim() !== '—').length, 2);
ok('the final tables are there: pairs, MVP, Ryder', await q.evaluate(() => [...document.querySelectorAll('h3.sub')].map(h => h.textContent.trim())), ['Worth mentioning', 'The final tables', 'Ryder Cup']);
ok('the days are chips that link to their own pages, the week among them in gold', [await q.locator('.recaparch a.chip[href^="?r=r"]').count(), await q.locator('.recaparch a.chip.gold.on').count()], [3, 1]);
ok('nothing points at Claude', await q.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('and the way into the book is on the page', await q.locator('.recaptop a.rm[href="../app/"]').count(), 1);
ok('the page is titled for the share preview', await q.title(), 'Seven days, three rounds and one very sore loser · The Tournament Recap · The Union Invitational');
if (SHOTS) await q.screenshot({ path: SHOTS + '/week-page.png', fullPage: true });

console.log('\nthe last day’s page points on to it');
await q.goto(BASE + 'recap/?r=r3'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(500);
ok('a gold card under the report and a gold chip, both to ?r=week', [await q.locator('a.weekcard[href="?r=week"]').count(), await q.locator('.recaparch a.chip.gold[href="?r=week"]').count()], [1, 1]);
await q.goto(BASE + 'recap/?r=r1'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(500);
ok('the first day has the chip but no card', [await q.locator('a.weekcard').count(), await q.locator('.recaparch a.chip.gold').count()], [0, 1]);

console.log('\nthe week not shared yet');
await q.unroute(/\/rest\/v1\/docs/);
await q.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows.map(r => r.path === 'recaps/week' ? { path: r.path, doc: { ...r.doc, status: 'draft' } } : r)) }));
await q.goto(BASE + 'recap/?r=week'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(500);
ok('keeps its words to itself', [await q.locator('.byline').count(), await q.locator('.artbody .recpara').count()], [0, 1]);
await q.goto(BASE + 'recap/?r=r3'); await q.waitForSelector('.rechead', { timeout: 20000 }); await q.waitForTimeout(500);
ok('and the round page shows no gold link', [await q.locator('a.weekcard').count(), await q.locator('.recaparch a.chip.gold').count()], [0, 0]);
ok('no errors on the page', errs2, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
