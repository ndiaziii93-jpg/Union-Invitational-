/* A RECAP'S PHOTOGRAPHS. Tap one and it opens full screen, with the others
   of the article a tap away; the commissioner can swap it for any other
   photograph taken that day (the round's own, or the trip's from the same
   date), and the choice is kept in the report and honoured by the public
   page. Run: node tools/recap-photo-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
/* a picture that is plainly its own: a one-colour PNG per photo id, so the screen says which one it is showing */
const px = n => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#3a6"/><text x="20" y="110" font-size="60" fill="#fff">' + n + '</text></svg>');
const PARA = n => 'Paragraph ' + n + ' of the report, long enough to count as a real paragraph with a score, a hole and a name in it for the group.';
const SEED = () => {
  const T = window.__T, now = Date.now();
  T.config.rounds.r2.state = 'open';
  const mk = (id, extra) => ({ id, rid: 'r2', hole: 3, url: window.__px(id), thumb: window.__px(id), at: now - Object.keys(T.photos).length * 1000, by: 'g1', byName: 'Someone', kind: 'photo', ...extra });
  for (let k = 1; k <= 8; k++) T.photos['p' + k] = mk('p' + k, { hole: k });
  T.photos.t1 = mk('t1', { rid: 'trip', hole: null, day: '2026-10-31' });          // the trip, the same day
  T.photos.t2 = mk('t2', { rid: 'trip', hole: null, day: '2026-10-29' });          // the trip, another day: never offered
  T.recaps.r2 = { rid: 'r2', status: 'published', at: now, body: { headline: 'A report', narrative: [1, 2, 3, 4, 5].map(n => window.__para(n)), voices: [], swing: null, pairNotes: {}, honours: [] } };
};
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const file = join('docs', normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

writeFileSync(S + '/rp.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(([px, PARA]) => {
  window.__px = new Function('n', 'return (' + px + ')(n)'); window.__para = new Function('n', 'return (' + PARA + ')(n)');
}, [px.toString(), PARA.toString()]);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.clock.install({ time: new Date('2026-10-31T16:00:00Z') });
await p.goto('file://' + S + '/rp.html'); await p.waitForTimeout(3000);
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
await shut();
await p.evaluate(SEED);
await p.evaluate(() => { Object.assign(window.__UI, { recapOpen: true, recap: { rid: 'r2', busy: false, err: '', stream: '', edit: false, view: 'report' } }); window.__forceRender(); });
await p.waitForTimeout(500);
const slotImgs = () => p.locator('.artbody .rinline img').evaluateAll(es => es.map(e => decodeURIComponent(e.src).match(/>(\w+)<\/text>/)[1]));
const tap = async sel => { await p.locator(sel).first().click(); await p.waitForTimeout(250); };

console.log('\nthe article');
const before = await slotImgs();
ok('a photo sits under every paragraph but the last', before.length, 4);
ok('each one is a button that opens it full screen', await p.locator('.rinline .rin-open').count(), 4);

console.log('\nfull screen');
await tap('.rinline:nth-of-type(1) .rin-open, .rinline .rin-open');
ok('a tap opens the photograph full screen', [await p.locator('.pviewer').count(), await p.locator('.pviewer img').count()], [1, 1]);
ok('with the position in the report', /1 of 4 in the report/.test(await p.locator('.pv-top').innerText()), true);
await tap('.pviewer .pv-nav.r');
ok('the next arrow goes to the next paragraph’s photo', /2 of 4 in the report/.test(await p.locator('.pv-top').innerText()), true);

console.log('\nswap it');
ok('the commissioner has Swap on the full-screen view', await p.locator('.pv-own [data-act="recapSwap"]').count(), 1);
await tap('.pv-own [data-act="recapSwap"]');
const offered = await p.locator('.rsw-t img').evaluateAll(es => es.map(e => decodeURIComponent(e.src).match(/>(\w+)<\/text>/)[1]).sort());
ok('every photo from that day is offered: the round’s eight, and the trip’s from the same date, not another day’s', offered, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 't1']);
ok('the one now in the slot is marked, the others in the report say so', [await p.locator('.rsw-t.on').count(), await p.locator('.rsw-used').count()], [1, 3]);
await tap('.rsw-t[aria-label*="Someone"]:has(img[src*="p6"]), .rsw-t:has(img[src*="p6"])');
const saved = await p.evaluate(() => window.__T.recaps.r2.body.pics);
ok('picking one saves the choice in the report, for that paragraph only', Object.keys(saved), ['1']);
ok('and shows it full screen straight away', await p.locator('.pviewer img').evaluate(e => decodeURIComponent(e.src).match(/>(\w+)<\/text>/)[1]), saved['1']);
await tap('.pviewer .pv-top button');
const after = await slotImgs();
ok('back in the article only that slot changed', after.map((x, i) => x === before[i]), [true, false, true, true]);
ok('to the photograph that was picked', after[1], saved['1']);

console.log('\nthe trip’s photo of that day');
await tap('.rinline:nth-of-type(1) .rin-swap, .rin-swap');
await p.locator('.rsw-t:has(img[src*="t1"])').first().click(); await p.waitForTimeout(250);
ok('can be used too', await p.evaluate(() => Object.values(window.__T.recaps.r2.body.pics).includes('t1')), true);
await shut();

console.log('\nback to automatic');
const i1 = await p.evaluate(() => Object.keys(window.__T.recaps.r2.body.pics)[0]);
await p.evaluate(i => { Object.assign(window.__UI, { modal: { kind: 'rswap', rid: 'r2', i: +i } }); window.__forceRender(); }, i1); await p.waitForTimeout(300);
await tap('[data-act="recapPhotoAuto"]');
ok('puts the slot back to the one it had', (await p.evaluate(i => (window.__T.recaps.r2.body.pics || {})[i] || null, i1)), null);
await shut();

ok('no errors on the way', errs, []);

console.log('\nthe public page');
const pub = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
const perrs = []; pub.on('pageerror', e => perrs.push(String(e)));
const para = n => 'Paragraph ' + n + ' of the report, long enough to count as a real paragraph with a score, a hole and a name in it for the group.';
const pic = n => BASE + 'app/icon-512.png?' + n;
const rows = [
  { path: 'config/tournament', doc: { rev: 3, rounds: { r2: { state: 'open' } } } },
  { path: 'recaps/r2', doc: { rid: 'r2', status: 'published', at: Date.now(), body: { headline: 'A report', narrative: [1, 2, 3, 4, 5].map(para), voices: [], swing: null, pairNotes: {}, honours: [], pics: { 1: 'p6', 2: 't1' } } } },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ path: 'photos/p' + k, doc: { id: 'p' + k, rid: 'r2', hole: k, url: pic('p' + k), at: Date.now() - k * 1000, byName: 'Someone', kind: 'photo' } })),
  { path: 'photos/t1', doc: { id: 't1', rid: 'trip', day: '2026-10-31', url: pic('t1'), at: Date.now() - 99999, kind: 'photo', byName: 'Someone' } },
  { path: 'photos/t2', doc: { id: 't2', rid: 'trip', day: '2026-10-29', url: pic('t2'), at: Date.now() - 88888, kind: 'photo', byName: 'Someone' } },
];
await pub.route(/\/rest\/v1\/docs/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
await pub.route(/supabase\.co\/(?!rest)/, route => route.abort());
await pub.goto(BASE + 'recap/?r=r2'); await pub.waitForSelector('.artbody', { timeout: 20000 }); await pub.waitForTimeout(600);
const pubSrcs = await pub.locator('.artbody .rinline img').evaluateAll(es => es.map(e => e.src.split('?').pop()));
ok('the public page honours the choices: the picked photo, the trip photo, the rest automatic', [pubSrcs[1], pubSrcs[2], pubSrcs.length], ['p6', 't1', 4]);
ok('no Swap on the public page', await pub.locator('.rin-swap').count(), 0);
await pub.locator('.rin-open').first().click(); await pub.waitForTimeout(300);
ok('a tap opens it full screen', [await pub.locator('#rfull').count(), await pub.locator('#rfull img').count()], [1, 1]);
await pub.keyboard.press('Escape'); await pub.waitForTimeout(200);
ok('Escape puts it away', await pub.locator('#rfull').count(), 0);
ok('no errors on the public page either', perrs, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
