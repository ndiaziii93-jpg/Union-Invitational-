/* SELECT MANY PHOTOS, TO MOVE THEM. A pile that went into the wrong round is
   ticked all at once (a whole day with one tap, or one at a time) and moved to
   the right round in one go. A photo moves only if it is yours; holes are kept
   when the new round is on the same course.
   Run: node tools/photo-select-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/psel.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { window.claude = { use: async n => n === 'assets' ? { upload: async () => ({ id: 'a', url: 'x.jpg' }) } : null }; });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
await p.goto('file://' + S + '/psel.html'); await p.waitForTimeout(3500); await shut();
/* twelve photos wrongly in Round 3 (four with a hole), two already in Round 1, one trip photo */
await p.evaluate(() => { const T = window.__T, dev = window.__UI && 'x';
  const mk = (id, rid, hole, extra) => { T.photos[id] = { id, rid, hole, url: 'https://x.test/' + id + '.jpg', at: Date.now() - 1000, byName: 'Me', dev: window.__myDev || null, ...extra }; };
  for (let i = 0; i < 12; i++) mk('w' + i, 'r3', i < 4 ? i : null);
  mk('k1', 'r1', null); mk('k2', 'r1', 2); mk('t1', 'trip', null, { day: '2026-10-30' });
  window.__forceRender(); });
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
const rids = () => p.evaluate(() => Object.values(window.__T.photos).reduce((o, x) => { o[x.rid] = (o[x.rid] || 0) + 1; return o; }, {}));
ok('twelve are in Round 3 to begin with', (await rids()).r3, 12);
await p.locator('[data-act="photoSelOn"]').click(); await p.waitForTimeout(200);
ok('Select turns the tiles into tick boxes, and offers Select all on each day', [await p.locator('.pg-ck').count() > 0, await p.locator('[data-act="photoSelSec"]').count() >= 2, await p.locator('.pg-fab').count()], [true, true, 0]);
ok('Move waits until something is picked', await p.locator('.pg-selbar [data-act="photoSelMove"][disabled]').count(), 1);
await p.locator('[data-act="photoSelSec"][data-a="course:r3"]').click(); await p.waitForTimeout(200);
ok('one tap on a round’s Select all picks the whole pile', (await p.locator('.pg-selbar b').innerText()).trim(), '12');
await p.locator('.pg-t.picked').first().click(); await p.waitForTimeout(200);
ok('and any one can be taken out', (await p.locator('.pg-selbar b').innerText()).trim(), '11');
await p.locator('[data-act="photoSelMove"]').click(); await p.waitForTimeout(300);
ok('Move asks where to', [await p.locator('.modal.phmove .banner, .modal.phmove').count() > 0, (await p.locator('.modal.phmove [data-act="photoManyRid"]').allInnerTexts())], [true, ['Practice', 'Round 1', 'Round 2', 'Round 3', 'The trip']]);
ok('and will not go until a place is chosen', await p.locator('[data-act="photoManyGo"][disabled]').count(), 1);
await p.locator('[data-act="photoManyRid"][data-a="r2"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="photoManyGo"]').click(); await p.waitForTimeout(1500);
const r = await rids();
ok('the eleven are in Round 2, the one left out stays in Round 3, the rest untouched', [r.r2, r.r3, r.r1, r.trip], [11, 1, 2, 1]);
const held = await p.evaluate(() => Object.values(window.__T.photos).filter(x => x.rid === 'r2').map(x => x.hole).sort((a, c) => (a == null) - (c == null) || a - c));
ok('holes are kept: Round 2 is on the same course as Round 3', held.filter(h => h != null).length >= 3, true);
ok('Select mode is over, and the book says what it did', [await p.locator('.pg-selbar').count(), /Moved 11 to Round 2/.test(await p.locator('.pg-done').innerText().catch(() => ''))], [0, true]);
console.log('\nmoving to another course drops the hole; a trip photo keeps its day');
await p.locator('[data-act="photoSelOn"]').click();
await p.locator('[data-act="photoSelSec"][data-a="course:r2"]').click(); await p.locator('[data-act="photoSelMove"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="photoManyRid"][data-a="r1"]').click(); await p.locator('[data-act="photoManyGo"]').click(); await p.waitForTimeout(1500);
ok('Round 1 is on Aspendos: the holes are cleared', await p.evaluate(() => Object.values(window.__T.photos).filter(x => x.rid === 'r1' && x.id.startsWith('w')).every(x => x.hole == null)), true);
await p.locator('[data-act="photoSelOn"]').click(); await p.locator('[data-act="photoSelSec"][data-a="course:r1"]').click(); await p.locator('[data-act="photoSelMove"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="photoManyRid"][data-a="trip"]').click(); await p.locator('[data-act="photoManyGo"]').click(); await p.waitForTimeout(1500);
ok('moved to the trip, each keeps the day of the round it came from', await p.evaluate(() => [...new Set(Object.values(window.__T.photos).filter(x => x.rid === 'trip').map(x => x.day))].sort()), ['2026-10-30']);
ok('no errors', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
