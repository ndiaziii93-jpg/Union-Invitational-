/* PHOTOS FROM THE COURSE. Score Entry carries the camera: a gold one on the
   hole's own plate, for golfer and ref alike, that hands straight to the
   phone — whose own chooser offers the camera or the photo library. Every picture is tagged with the hole it was taken on, and a
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

const cam = () => p.locator('.holeplate .hp-cam').first();
const snap = async () => { await cam().scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
  return (await Promise.all([p.waitForEvent('filechooser'), cam().click()]))[0]; };
console.log('\na golfer on Score Entry');
ok('the gold camera is on the hole’s plate', await p.locator('.holeplate .hp-cam').count(), 1);
ok('and says which hole', await cam().getAttribute('aria-label'), 'Add a photo of hole 1: take one or choose one');
ok('the old row of buttons is gone', await p.locator('.snaprow .snap, .snaprow .choose').count(), 0);
let chooser = await snap();
ok('one tap hands to the phone, which offers camera or library', await chooser.element().getAttribute('capture'), null);
ok('and several can be chosen at once', chooser.isMultiple(), true);
await chooser.setFiles(pic('shot.png')); await p.waitForTimeout(1500);
ok('the shot is in the book, tagged with the hole', await photos(), [{ hole: 0, rid: await p.evaluate(() => window.__UI.entryRound) }]);

await p.locator('[data-act="entryHole"][data-a="6"]').first().dispatchEvent('click'); await p.waitForTimeout(500); await shut();
chooser = await snap();
await chooser.setFiles([pic('a.png'), pic('b.png')]); await p.waitForTimeout(2000);
ok('both go up, on the 7th', (await photos()).filter(x => x.hole === 6).length, 2);

console.log('\nno signal on the course');
await ctx.setOffline(true);
chooser = await snap();
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

console.log('\nanother hole, another photo');
await p.locator('[data-act="entryHole"][data-a="2"]').first().dispatchEvent('click'); await p.waitForTimeout(500); await shut();
ok('the camera moves with the hole', await cam().getAttribute('aria-label'), 'Add a photo of hole 3: take one or choose one');
chooser = await snap();
await chooser.setFiles(pic('ref.png')); await p.waitForTimeout(1500);
ok('and the photo is on hole 3', (await photos()).filter(x => x.hole === 2).length, 1);

console.log('\nthe week\'s photos have their own tab');
await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
ok('Photos is a tab on Boards', await p.locator('.btab[data-a="photos"].on').count(), 1);
ok('the course album opens first, every photo marked with its hole',
  (await p.locator('.pg-t .pg-hb').allInnerTexts()).sort(), ['HOLE 1', 'HOLE 3', 'HOLE 7', 'HOLE 7', 'HOLE 7']);

console.log('\nthe trip, apart from the golf');
await p.locator('[data-act="photoAlbum"][data-a="trip"]').click(); await p.waitForTimeout(400);
ok('the trip album starts empty, and says how to add', await p.locator('.pg-empty').count(), 1);
let [tc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.pg-fab').click()]);
ok('its camera hands to the phone too', await tc.element().getAttribute('capture'), null);
await tc.setFiles(pic('dinner.png')); await p.waitForTimeout(1500);
const tripRows = await p.evaluate(() => Object.values(window.__T.photos).filter(x => x && x.rid === 'trip').map(x => ({ hole: x.hole, day: x.day })));
const resortToday = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
ok('a trip photo is kept apart, by the day at the resort, with no hole', tripRows, [{ hole: null, day: resortToday }]);
ok('and shows in the trip album only', [await p.locator('.pg-t').count(), await p.locator('.pg-t .pg-hb').count()], [1, 0]);
await p.locator('[data-act="photoAlbum"][data-a="course"]').click(); await p.waitForTimeout(300);
ok('the course album still has only the golf', await p.locator('.pg-t').count(), 5);

console.log('\nhearts');
await p.locator('[data-act="photoAlbum"][data-a="trip"]').click(); await p.waitForTimeout(300);
await p.locator('.pg-t').first().click(); await p.waitForTimeout(400);
ok('a photo opens full screen', await p.locator('.pviewer img').count(), 1);
await p.locator('.pv-heart').click(); await p.waitForTimeout(300);
ok('one tap hearts it', [await p.locator('.pv-heart').getAttribute('aria-pressed'), (await p.locator('.pv-heart').innerText()).replace(/\s+/g, '')], ['true', '♥1']);
await p.locator('.pv-heart').click(); await p.waitForTimeout(300);
ok('a second takes it back: one heart a phone', (await p.locator('.pv-heart').innerText()).replace(/\s+/g, ''), '♡0');
await p.locator('.pv-heart').click(); await p.waitForTimeout(300);
const field = await p.evaluate(() => { const ph = Object.values(window.__T.photos).find(x => x.rid === 'trip'); return Object.keys(ph).filter(k => k.startsWith('hv_')).length; });
ok('the heart is this phone’s own field on the photo, so two at once both land', field, 1);
await p.locator('.pv-top [data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('the most-hearted today is the photo of the day', await p.locator('.pg-potd').count(), 1);

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
ok('a ref gets the same gold camera on the plate', await r.locator('.holeplate .hp-cam').count(), 1);
ok('and no sheet of ours in between', await r.locator('.camicon, .camsheet').count(), 0);
await r.locator('.holeplate .hp-cam').scrollIntoViewIfNeeded(); await r.evaluate(() => scrollBy(0, -120));
const [rc] = await Promise.all([r.waitForEvent('filechooser'), r.locator('.holeplate .hp-cam').click()]);
ok('which goes straight to the phone', await rc.element().getAttribute('capture'), null);

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
