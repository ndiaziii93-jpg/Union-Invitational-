/* CLIPS. The same camera button takes a video: it goes up as it is (nothing
   on a phone can shrink one), with its first frame as a poster where the
   phone can read it, and a play mark on its tile either way. The viewer
   plays it; the recap keeps clips to the strip and its front for stills.
   Run: node tools/video-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/video.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUDAoAAAgQAAG5/1yqAAAAAElFTkSuQmCC', 'base64');
/* a stand-in for a clip the phone cannot decode: the book must take it anyway, poster or no poster */
const MP4 = Buffer.concat([Buffer.from('\0\0\0\x18ftypmp42', 'latin1'), Buffer.alloc(4000)]);
const MOCK = () => { window.claude = { use: async n => n !== 'assets' ? null : { upload: async (blob, thumb, opts) => { window.__ups = (window.__ups || []).concat([{ size: blob.size, type: blob.type, kind: opts && opts.kind }]); return { id: 'a' + window.__ups.length, url: 'blob-' + window.__ups.length + (opts && opts.kind === 'video' ? '.mp4' : '.jpg'), sizeBytes: blob.size }; } } }; };

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
const rows = () => p.evaluate(() => Object.values(window.__T.photos).filter(Boolean).map(x => ({ kind: x.kind, url: x.url, hole: x.hole })));

await p.goto('file://' + S + '/video.html'); await p.waitForTimeout(3500);
await shut(); await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(700); await shut();
const cam = p.locator('.holeplate .hp-cam').first();
await cam.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
await cam.click(); await p.waitForTimeout(250);
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoLib"]').click()]);
console.log('\nthe same button takes a clip');
ok('the picker offers videos as well as pictures, MP4 by name', /video\/\*.*\.mp4/.test(await chooser.element().getAttribute('accept')), true);
await chooser.setFiles([{ name: 'tee.mp4', mimeType: 'video/mp4', buffer: MP4 }, { name: 'green.png', mimeType: 'image/png', buffer: PNG }]); await p.waitForTimeout(12000);
ok('both are in the book, on the hole, the clip marked as one', await rows(), [{ kind: 'video', url: 'blob-1.mp4', hole: 0 }, { kind: 'photo', url: 'blob-2.jpg', hole: 0 }]);
ok('the clip went up as it was, the picture shrunk to a jpeg', await p.evaluate(() => window.__ups.map(u => u.kind + ':' + u.type)), ['video:video/mp4', 'photo:image/jpeg']);
ok('nothing failed on the way', await p.evaluate(() => window.__UI.upload.err), '');

console.log('\nin the album');
await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
ok('the clip\'s tile wears a play mark, the picture\'s does not', [await p.locator('.pg-t.video .pg-play').count(), await p.locator('.pg-t:not(.video) .pg-play').count()], [1, 0]);
await p.locator('.pg-t.video').click(); await p.waitForTimeout(400);
ok('tapping it opens a player, not a picture', [await p.locator('.pviewer video[controls]').count(), await p.locator('.pviewer img').count()], [1, 0]);
ok('that points at the clip, as an MP4', [await p.locator('.pviewer video source').getAttribute('src'), await p.locator('.pviewer video source').getAttribute('type')], ['blob-1.mp4', 'video/mp4']);
await shut();

console.log('\nin the recap');
await p.evaluate(() => { window.__UI.recapOpen = true; window.__UI.recap = { rid: window.__UI.entryRound, busy: false, err: '', stream: '', edit: false, view: 'report' }; window.__forceRender(); }); await p.waitForTimeout(600);
ok('the front shows the photograph only', [await p.locator('.rh-slide').count(), await p.locator('.rh-slide img').first().getAttribute('src')], [1, 'blob-2.jpg']);
ok('and the strip has both, the clip with its play mark', [await p.locator('.phstrip .ph').count(), await p.locator('.phstrip .ph.video .pg-play').count()], [2, 1]);

console.log('\nan MP4 the phone hands over with no type');
await p.evaluate(() => { window.__UI.screen = 'entry'; window.__UI.modal = null; window.__UI.recapOpen = false; window.__forceRender(); }); await p.waitForTimeout(500); await shut();
await cam.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
await cam.click(); await p.waitForTimeout(250);
const [c3] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoLib"]').click()]);
await c3.setFiles([{ name: 'drive.mp4', mimeType: 'application/octet-stream', buffer: MP4 }]); await p.waitForTimeout(10000);
ok('is taken as a clip, and stored as an MP4', await p.evaluate(() => { const u = window.__ups[window.__ups.length - 1]; const r = Object.values(window.__T.photos).sort((a, b) => b.at - a.at)[0]; return [u.kind, r.kind, r.mime]; }), ['video', 'video', 'video/mp4']);

console.log('\ntoo big a clip');
await p.evaluate(() => { window.__UI.recapOpen = false; window.__UI.screen = 'entry'; window.__UI.modal = null; window.__forceRender(); }); await p.waitForTimeout(500); await shut();
await cam.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
await cam.click(); await p.waitForTimeout(250);
const [c2] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoLib"]').click()]);
writeFileSync(S + '/long.mp4', Buffer.alloc(81 * 1024 * 1024));   // too big for the book, and for a buffer: handed over as a file
await c2.setFiles([S + '/long.mp4']); await p.waitForTimeout(1500);
ok('is turned away with the limit named', /keep clips under 80 MB/.test(await p.evaluate(() => window.__UI.upload.err)), true);
ok('and nothing more is in the book', (await rows()).length, 3);
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
