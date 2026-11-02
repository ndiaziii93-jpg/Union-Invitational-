/* THE PLAYERS REPORT. The numbers are read off every card the same way on
   every phone and on the public page: DP's real Sunday card from the book
   is the fixture, and what it says is checked to the stroke. Then the
   Boards tab, the writer (a stand-in) filling the letters in batches and
   keeping them in recaps/report, and the page the link opens.
   Run: node tools/report-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* ---------- the engine, in node ---------- */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', hidden: false, addEventListener() {} };
globalThis.window = { addEventListener() {} };
const R = await import('../src/report.js');
const E = await import('../src/engine.js');
const { assemble } = await import('../src/recappage.js');
/* DP's Sunday at Olympos, as the book holds it: 85 (46 / 39), 36 points, 33 putts on 17 counted holes */
const DP = { raw: [6, 3, 6, 4, 6, 5, 6, 4, 6, 5, 3, 4, 4, 4, 3, 6, 3, 7], putts: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 2, 6: 3, 7: 1, 8: 2, 9: 1, 10: 1, 11: 2, 12: 2, 13: 2, 14: 2, 15: 3, 16: 1, 17: 3 },
  marks: { 0: ['ob'], 1: ['shot'], 4: ['putt3'], 6: ['putt3'], 12: ['shot'], 15: ['putt3'], 17: ['putt3'] }, by: {}, at: {}, pu: {}, mF: false, mB: false, bb: false };
const DW = { raw: [6, 5, 7, 4, 8, 6, 7, 5, 6, 6, 5, 6, 5, 7, 6, 5, 6, 8], putts: {}, marks: { 13: ['ob'], 17: ['ob'] }, by: {}, at: {}, pu: { 14: true }, mF: false, mB: false, bb: false };
const rows = [
  { path: 'config/tournament', doc: { rev: 3, rounds: { r1: { state: 'open' }, r2: { state: 'open' }, r3: { state: 'open' } } } },
  { path: 'people/dp', doc: { id: 'dp', display: 'DP', role: 'golfer', band: 16, location: 'USA', order: 1 } },
  { path: 'people/dw', doc: { id: 'dw', display: 'Duncan W', role: 'golfer', band: 30, location: 'UK', order: 2 } },
  { path: 'pairs/p1', doc: { id: 'p1', members: ['dp', 'dw'], order: 1 } },
  { path: 'scores/r3__dp', doc: DP }, { path: 'scores/r3__dw', doc: DW },
  { path: 'scores/r2__dp', doc: { ...DP, raw: [5, 4, 6, 3, 7, 4, 6, 4, 5, 4, 3, 5, 6, 5, 4, 6, 3, 6], putts: {}, marks: {} } },
];
const T = assemble(rows);
const now = E.nowLocal();
const r3 = R.roundStats(T, 'r3', 'dp');
ok('gross 85, 46 out and 39 back, 36 points (15 and 21)', [r3.gross, r3.front, r3.back, r3.pts, r3.ptsF, r3.ptsB], [85, 46, 39, 36, 15, 21]);
ok('seven pars, eight bogeys, three doubles', [r3.dist.birdie, r3.dist.par, r3.dist.bogey, r3.dist.double, r3.dist.worse], [0, 7, 8, 3, 0]);
ok('par 3s +2 over six, par 4s +6 over seven, par 5s +6 over five (Olympos is 6/7/5)', [r3.byPar['3'], r3.byPar['4'], r3.byPar['5']], [[2, 6], [6, 7], [6, 5]]);
ok('33 putts on 17 counted holes, four three-putts, five one-putts', [r3.putts, r3.puttHoles, r3.p3, r3.p1], [33, 17, 4, 5]);
ok('one OB, two shots of the hole, no pick-up', [r3.marks.ob, r3.marks.shot, r3.pu], [1, 2, 0]);
ok('his ball counted on most holes beside a partner who went out of bounds', [r3.teamHoles, r3.counted > 12, r3.carried > 0], [18, true, true]);
const F = R.fieldReport(T, now);
const dp = F.players.find(p => p.id === 'dp');
ok('two rounds, the best is Sunday, the trend is down', [dp.rounds.length, dp.best.rid, dp.best.gross, dp.trend], [2, 'r3', 85, -1]);
ok('the grades: par 3s best, par 5s worst, putting from the counted holes', [dp.grades.par3, ['C', 'D'].includes(dp.grades.par5), dp.grades.putting, dp.grades.par3 < dp.grades.par5], ['A', true, 'B', true]);
ok('the team, the cup and the handicap read are on his page', [dp.pair.partner, dp.matches.length, dp.rec.w, typeof dp.playsTo], ['Duncan W', 3, 1, 'number']);
ok('the field: two golfers, four cards, Duncan the most OB', [F.totals.players, F.totals.cards, F.leaders.mostOb.name, F.leaders.lowGross.name], [2, 3, 'Duncan W', 'DP']);
const brief = R.reportInput(T, now);
ok('the brief for the writer carries each golfer by id, with the grades and the damage', [brief.ids, /GOLFER id=dp name=DP/.test(brief.players.dp), /four three-putts|4 three-putts/.test(brief.players.dp), /the damage: hole 1 \(par 4\) 6 ob/.test(brief.players.dp)], [['dp', 'dw'], true, true, true]);
const html = R.renderReport(T, null, { now });
ok('the report draws the summary and a card a golfer, the numbers alone until the words come', [(html.match(/rp-player/g) || []).length, /Not written yet/.test(html), (html.match(/class="rp-strip"/g) || []).length], [2, true, 3]);

/* ---------- in the book ---------- */
writeFileSync(S + '/rep.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__asked = [];
  const fn = async input => { const q = String(input); window.__asked.push(q);
    if (/EXECUTIVE SUMMARY ONLY/.test(q)) return { text: JSON.stringify({ summary: ['Paragraph one of the summary, long enough to count as a real paragraph about the week, with the winners and the numbers in it.', 'Paragraph two, the same, about where the week was won and lost on the par fives and the front nines.'] }), truncated: false };
    const ids = ((q.match(/LETTERS FOR THESE GOLFERS ONLY: ([^.]+)\./) || [])[1] || '').split(',').map(x => x.trim()).filter(Boolean);
    const players = {}; ids.forEach(id => { players[id] = { letter: ['Dear ' + id + ', a paragraph of coaching long enough to count, about your par fives and your front nine.', 'A second paragraph about the putting, where it was counted, and the one thing to do about it.'], three: ['Lay up on the par 5s', 'Lag putts to three feet', 'A first-tee routine'] }; });
    return { text: JSON.stringify({ players }), truncated: false }; };
  window.claude = { use: async name => name === 'sample' ? fn : null };
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + S + '/rep.html'); await p.waitForTimeout(3000);
for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; }
await p.evaluate(([DP, DW]) => { const T = window.__T; T.config.rounds.r3.state = 'open';
  const ids = T.config.people.filter(x => x.role === 'golfer').map(x => x.id);
  T.scores['r3__' + ids[0]] = DP; T.scores['r3__' + ids[1]] = DW; T.scores['r3__' + ids[2]] = { ...DP, raw: DP.raw.map(x => x + 1) };
  window.__forceRender(); }, [DP, DW]);
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="report"]').click(); await p.waitForTimeout(600);
ok('Boards has the Report tab, with a card a golfer and the numbers live', [await p.locator('.btab[data-a="report"].on').count(), await p.locator('.rp-player').count(), await p.locator('.rp-exec .rp-tile').count()], [1, 3, 6]);
ok('the commissioner can write the notes; the group cannot yet share what is not there', [await p.locator('[data-act="reportWrite"]').count(), await p.locator('[data-act="reportShare"]').count()], [1, 0]);
await p.locator('[data-act="reportWrite"]').click();
await p.waitForFunction(() => { const r = window.__T.recaps.report; return r && r.body && Object.keys(r.body.players || {}).length >= 3 && !window.__UI.report.busy; }, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(400);
const got = await p.evaluate(() => ({ asked: window.__asked.map(q => /EXECUTIVE SUMMARY ONLY/.test(q) ? 'summary' : 'letters'), n: Object.keys(window.__T.recaps.report.body.players).length, status: window.__T.recaps.report.status, sum: window.__T.recaps.report.body.summary.length,
  letters: document.querySelectorAll('.rp-player .rp-p').length, three: document.querySelectorAll('.rp-three li').length, err: window.__UI.report.err }));
ok('the summary first, then the letters in one batch of three, kept for everyone', [got.asked, got.n, got.status, got.sum, got.err], [['summary', 'letters'], 3, 'published', 2, '']);
ok('and drawn: two paragraphs a letter, three things each', [got.letters, got.three, await p.locator('[data-act="reportShare"]').count()], [6, 9, 1]);
ok('the writer was told to be constructive and given the never-list', await p.evaluate(() => /CONSTRUCTIVE/.test(window.__asked[0]) && /NEVER, because it reads as machine-written/.test(window.__asked[0]) && /GOLFER id=/.test(window.__asked[1])), true);
ok('no errors in the book', errs, []);
await ctx.close();

/* ---------- the page ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => { let q = decodeURIComponent(req.url.split('?')[0]); if (q.endsWith('/')) q += 'index.html'; const f = join('docs', normalize(q).replace(/^(\.\.[/\\])+/, '')); if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('no'); return; } res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(String(e)));
const pageRows = rows.concat([{ path: 'recaps/report', doc: { rid: 'report', status: 'published', at: Date.now(), body: { v: 1, summary: ['The summary paragraph, long enough to be real, with the winners and the numbers in it for the whole group to read.'], players: { dp: { letter: ['Dear DP, the letter paragraph, long enough to count, about the par fives.'], three: ['Lay up', 'Lag it', 'Routine'] } } } } },
  { path: 'recaps/r3', doc: { rid: 'r3', status: 'published', at: Date.now(), body: { headline: 'Sunday', narrative: ['A long enough paragraph about Sunday at Olympos with names and holes and scores in it so that it counts.'] } } }]);
await q.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageRows) }));
await q.route(/supabase\.co\/(?!rest)/, route => route.abort());
await q.goto(BASE + 'recap/?r=report'); await q.waitForSelector('.report', { timeout: 20000 }); await q.waitForTimeout(500);
ok('the page: the summary, a card a golfer, the letter and the grades, in the colours', [await q.locator('.rp-player').count(), await q.locator('.rp-exec .rp-p').count(), await q.locator('#rp-dp .rp-p').count(), await q.locator('#rp-dp .rp-gl.rp-gA').count() >= 1, await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)], [2, 1, 1, true, true]);
ok('the days are chips, the report among them', [await q.locator('.recaparch a.chip[href="?r=r3"]').count(), await q.locator('.recaparch a.chip.on[href="?r=report"]').count()], [1, 1]);
ok('and a day\'s page points at the report once it is shared', await (async () => { await q.goto(BASE + 'recap/?r=r3'); await q.waitForSelector('.rechead', { timeout: 20000 }); return q.locator('.recaparch a.chip[href="?r=report"]').count(); })(), 1);
ok('the page title says what it is', await (async () => { await q.goto(BASE + 'recap/?r=report'); await q.waitForSelector('.report', { timeout: 20000 }); return q.title(); })(), 'The Players Report · The Union Invitational');
ok('nothing on it points at Claude', await q.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('no errors on the page', errs2, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
