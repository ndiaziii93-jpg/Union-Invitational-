/* A PHOTO CAN CHANGE ITS ROUND. Pictures go up when there is signal, often
   the day after, and land in the round being played — so whoever added one
   (or the commissioner) moves it: to another round, to practice, to the
   trip, and onto a hole or off one. Nobody else gets the button.
   Run: node tools/photo-move-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/photo-move.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUDAoAAAgQAAG5/1yqAAAAAElFTkSuQmCC', 'base64');
const MOCK = () => { window.claude = { use: async n => n !== 'assets' ? null : { upload: async blob => ({ id: 'a1', url: 'blob-' + Date.now() + '.jpg', sizeBytes: blob.size }) } }; };

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(MOCK);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const mine = () => p.evaluate(() => Object.values(window.__T.photos).filter(Boolean).map(x => ({ rid: x.rid, hole: x.hole })));

await p.goto('file://' + S + '/photo-move.html'); await p.waitForTimeout(3500);
await shut(); await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(700); await shut();
const cam = p.locator('.holeplate .hp-cam').first();
await cam.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
await cam.click(); await p.waitForTimeout(250);
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoLib"]').click()]);
await chooser.setFiles({ name: 'tue.png', mimeType: 'image/png', buffer: PNG }); await p.waitForTimeout(1500);
const round = await p.evaluate(() => window.__UI.entryRound);
ok('a photo added today lands in the round being played, on hole 1', await mine(), [{ rid: round, hole: 0 }]);

console.log('\nbut it was taken on the practice day');
await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
await p.locator('.pg-t').first().click(); await p.waitForTimeout(400);
ok('the one who added it sees Move beside Remove', [await p.locator('.pviewer .pv-mv').count(), await p.locator('.pviewer .pv-rm').count()], [1, 1]);
await p.locator('.pv-mv').click(); await p.waitForTimeout(300);
ok('it asks which round, and which hole', [await p.locator('.phmove .chip[data-act="photoMoveRid"]').allInnerTexts(), await p.locator('.phmove .chip[data-act="photoMoveHole"]').count()],
  [['Practice', 'R1', 'R2', 'R3', 'The trip'], 19]);
ok('starting from where it is', [await p.locator('.phmove .chip[data-act="photoMoveRid"].on').getAttribute('data-a'), await p.locator('.phmove .chip[data-act="photoMoveHole"].on').innerText()], [round, '1']);
await p.locator('.phmove .chip[data-act="photoMoveRid"][data-a="practice"]').click(); await p.waitForTimeout(200);
await p.locator('.phmove .chip[data-act="photoMoveHole"][data-a="8"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="photoMoveGo"]').click(); await p.waitForTimeout(500);
ok('it is in the practice round now, on the 9th', await mine(), [{ rid: 'practice', hole: 8 }]);
ok('and the viewer says so', /practice · hole 9/i.test(await p.locator('.pviewer').innerText()), true);

console.log('\nor was the dinner, not the golf');
await p.locator('.pv-mv').click(); await p.waitForTimeout(300);
await p.locator('.phmove .chip[data-act="photoMoveRid"][data-a="trip"]').click(); await p.waitForTimeout(200);
ok('the trip has no holes to pick', await p.locator('.phmove .chip[data-act="photoMoveHole"]').count(), 0);
await p.locator('[data-act="photoMoveGo"]').click(); await p.waitForTimeout(500);
const practiceDay = await p.evaluate(() => window.__T.config.rounds && window.__T.config.rounds.practice && window.__T.config.rounds.practice.date);
ok('it moves to the trip album, on the practice day, with no hole', await p.evaluate(() => Object.values(window.__T.photos).map(x => ({ rid: x.rid, hole: x.hole, day: x.day }))), [{ rid: 'trip', hole: null, day: '2026-10-27' }]);
await shut();
ok('the trip album now holds it', [await p.locator('[data-act="photoAlbum"][data-a="trip"].on').count(), await p.locator('.pg-t').count()], [1, 1]);

console.log('\nanother phone, with PINs on and no PIN of its own');
writeFileSync(S + '/photo-move-other.html', readFileSync(S + '/photo-move.html', 'utf8').replace('PINS_ENABLED = false', 'PINS_ENABLED = true'));
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx2.addInitScript(MOCK);
const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(String(e)));
const copy = await p.evaluate(() => JSON.stringify(window.__T.photos));
await q.goto('file://' + S + '/photo-move-other.html'); await q.waitForTimeout(3500);
await q.evaluate(c => { Object.assign(window.__T.photos, JSON.parse(c)); window.__UI.role = 'viewer'; window.__UI.screen = 'boards'; window.__UI.boardTab = 'photos'; window.__UI.photoAlbum = 'trip'; window.__UI.modal = null; window.__forceRender(); }, copy);
await q.waitForTimeout(500);
for (let i = 0; i < 6; i++) { const d = q.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await q.waitForTimeout(200); } else break; }
await q.locator('.pg-t').first().click(); await q.waitForTimeout(400);
ok('someone else sees the photo, but no Move and no Remove', [await q.locator('.pviewer img').count(), await q.locator('.pv-mv').count(), await q.locator('.pv-rm').count()], [1, 0, 0]);

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
