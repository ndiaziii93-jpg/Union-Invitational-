/* PHOTOS FROM THE COURSE. Score Entry carries the camera now: a golfer gets
   a big Snap button that opens the phone's camera and a Choose button that
   opens its photos; a ref gets a small camera in the hole's heading that
   offers both. Every picture is tagged with the hole it was taken on, and a
   picture taken with no signal waits on the phone — through a reload — and
   goes up by itself the moment the phone is back online.
   Run: node tools/photo-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/photo.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
/* a small real picture, so the phone-side shrinking has something to decode */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUDAoAAAgQAAG5/1yqAAAAAElFTkSuQmCC', 'base64');
const pic = n => ({ name: n, mimeType: 'image/png', buffer: PNG });

const MOCK = () => { window.claude = { use: async n => {
  if (n !== 'assets') return null;
  let k = 0;
  return { upload: async blob => {
    if (!navigator.onLine) throw new Error('Failed to fetch');           // no signal: the send fails as a real one does
    window.__uploads = (window.__uploads || 0) + 1;
    return { id: 'a' + (++k), url: 'blob-' + Date.now() + '-' + k + '.jpg', sizeBytes: blob.size };
  } };
} }; };

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
const photos = () => p.evaluate(() => Object.values(window.__T.photos || {}).filter(Boolean).map(x => ({ hole: x.hole, rid: x.rid })));
const toEntry = async () => { await shut(); await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(700); await shut(); };

await p.goto('file://' + S + '/photo.html'); await p.waitForTimeout(3500);
await toEntry();

console.log('\na golfer on Score Entry');
ok('the big Snap button names the hole', (await p.locator('.snaprow .snap').innerText()).trim(), 'Snap hole 1');
ok('with Choose from library beside it', await p.locator('.snaprow .choose').count(), 1);
let [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.snaprow .snap').click()]);
ok('Snap opens the camera itself', await chooser.element().getAttribute('capture'), 'environment');
ok('one shot at a time', chooser.isMultiple(), false);
await chooser.setFiles(pic('shot.png')); await p.waitForTimeout(1500);
ok('the shot is in the book, tagged with the hole', await photos(), [{ hole: 0, rid: await p.evaluate(() => window.__UI.entryRound) }]);

await p.locator('[data-act="entryHole"][data-a="6"]').first().dispatchEvent('click'); await p.waitForTimeout(500); await shut();
[chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.snaprow .choose').click()]);
ok('Choose opens the photos, several at once', [chooser.isMultiple(), await chooser.element().getAttribute('capture')], [true, null]);
await chooser.setFiles([pic('a.png'), pic('b.png')]); await p.waitForTimeout(2000);
ok('both go up, on the 7th', (await photos()).filter(x => x.hole === 6).length, 2);

console.log('\nno signal on the course');
await ctx.setOffline(true);
[chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.snaprow .snap').click()]);
await chooser.setFiles(pic('nosignal.png')); await p.waitForTimeout(1500);
ok('it is not lost: it waits', (await photos()).length, 3);
ok('and says so', /waiting for signal/.test(await p.locator('.snaprow .phq').innerText().catch(() => '')), true);
ok('it is kept on the phone', await p.evaluate(() => new Promise(r => { const q = indexedDB.open('union-photos', 1);
  q.onsuccess = () => { const t = q.result.transaction('pending', 'readonly').objectStore('pending').count(); t.onsuccess = () => r(t.result); }; q.onerror = () => r(-1); })), 1);

console.log('\nthe app is closed and opened again, still with no signal');
await p.reload(); await p.waitForTimeout(4500); await toEntry();
ok('still waiting after the reload', (await photos()).length, 3);
ok('and still says so', /waiting for signal/.test(await p.locator('.snaprow .phq').innerText().catch(() => '')), true);

console.log('\nthe signal comes back');
await ctx.setOffline(false);
await p.waitForTimeout(2500);
ok('it goes up by itself', (await photos()).length, 4);
ok('nothing is left waiting', await p.locator('.snaprow .phq').count(), 0);
ok('and nothing is left on the phone', await p.evaluate(() => new Promise(r => { const q = indexedDB.open('union-photos', 1);
  q.onsuccess = () => { const t = q.result.transaction('pending', 'readonly').objectStore('pending').count(); t.onsuccess = () => r(t.result); }; })), 0);

console.log('\na ref gets the small camera, offering both');
await p.evaluate(() => { const rid = window.__UI.entryRound; window.__UI.modal = { kind: 'camera', rid, h: 2 }; window.__forceRender(); });
await p.waitForTimeout(400);
ok('the sheet rises from the foot', await p.locator('.camsheet').count(), 1);
ok('named for the hole', (await p.locator('.camsheet .mb-t').innerText()).trim(), 'A photo of hole 3');
ok('with Take a photo and Choose from library', await p.locator('.camsheet .camopts .btn').allInnerTexts().then(t => t.map(x => x.trim())), ['Take a photo', 'Choose from library']);
[chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.camsheet .snap').click()]);
ok('Take a photo opens the camera', await chooser.element().getAttribute('capture'), 'environment');
await chooser.setFiles(pic('ref.png')); await p.waitForTimeout(1500);
ok('the sheet is gone', await p.locator('.camsheet').count(), 0);
ok('and the photo is on hole 3', (await photos()).filter(x => x.hole === 2).length, 1);

console.log('\nthe week\'s photos have their own tab');
await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
ok('Photos is a tab on Boards', await p.locator('.btab[data-a="photos"].on').count(), 1);
ok('every photo shows the hole it was taken on', (await p.locator('.galsec .ph .phh').allInnerTexts()).sort(), ['Hole 1', 'Hole 3', 'Hole 7', 'Hole 7', 'Hole 7']);

console.log('\na ref, signed in with PINs on');
writeFileSync(S + '/photo-ref.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8').replace('PINS_ENABLED = false', 'PINS_ENABLED = true') + '</body></html>');
const r = await ctx.newPage(); r.on('pageerror', e => errs.push(String(e)));
await r.goto('file://' + S + '/photo-ref.html'); await r.waitForTimeout(3500);
await r.evaluate(() => { window.__T.config.pins = { master: '9991', s1: '9992', s2: '9993' };
  localStorage.setItem('union-invitational:role', JSON.stringify({ role: 's1', pin: '9992' }));
  window.__UI.role = 's1'; window.__UI.screen = 'entry'; window.__UI.modal = null; window.__forceRender(); });
await r.waitForTimeout(600);
for (let i = 0; i < 6; i++) { const d = r.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await r.waitForTimeout(200); } else break; }
ok('a ref gets the small camera in the hole band', await r.locator('.entryhd .camicon').count(), 1);
ok('and not the big buttons', await r.locator('.snaprow .snap').count(), 0);
await r.locator('.entryhd .camicon').click(); await r.waitForTimeout(400);
ok('which opens the sheet with both ways in', await r.locator('.camsheet .camopts .btn').count(), 2);

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
