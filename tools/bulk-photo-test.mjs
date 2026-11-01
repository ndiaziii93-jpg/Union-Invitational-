/* ADD MANY, SORTED BY DAY. A pile of photos from days already played goes in
   at once: each is read for when it was taken (the camera's own stamp, else
   the phone's date for the file), put with the round it was played in or the
   trip's day, shown in groups to check, and only sent when the person says.
   Run: node tools/bulk-photo-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/bulk.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const MOCK = () => { window.claude = { use: async n => {
  if (n !== 'assets') return null;
  let k = 0;
  return { upload: async blob => ({ id: 'a' + (++k), url: 'blob-' + Date.now() + '-' + k + '.jpg', sizeBytes: blob.size }) };
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
await p.goto('file://' + S + '/bulk.html'); await p.waitForTimeout(3500); await shut();
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);

/* files as a phone hands them over: a JPEG with the camera's own date in it, or a bare picture with only the file's date */
const hand = async specs => {
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoBulk"]').click()]);
  await p.evaluate(async specs => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#486'; x.fillRect(0, 0, 64, 48);
    const jpg = new Uint8Array(await new Promise(r => c.toBlob(async b => r(await b.arrayBuffer()), 'image/jpeg', 0.8)));
    const png = new Uint8Array(await new Promise(r => c.toBlob(async b => r(await b.arrayBuffer()), 'image/png')));
    const exif = when => {
      const t = new Uint8Array(96), v = new DataView(t.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) t[o + i] = s.charCodeAt(i); };
      w(0, 'II'); v.setUint16(2, 42, true); v.setUint32(4, 8, true);
      v.setUint16(8, 2, true);
      v.setUint16(10, 0x0132, true); v.setUint16(12, 2, true); v.setUint32(14, 20, true); v.setUint32(18, 56, true);
      v.setUint16(22, 0x8769, true); v.setUint16(24, 4, true); v.setUint32(26, 1, true); v.setUint32(30, 38, true);
      v.setUint16(38, 1, true);
      v.setUint16(40, 0x9003, true); v.setUint16(42, 2, true); v.setUint32(44, 20, true); v.setUint32(48, 76, true);
      w(56, when); w(76, when);
      const seg = new Uint8Array(4 + 6 + t.length); const sv = new DataView(seg.buffer);
      sv.setUint16(0, 0xFFE1); sv.setUint16(2, 2 + 6 + t.length); [0x45, 0x78, 0x69, 0x66, 0, 0].forEach((c2, i) => { seg[4 + i] = c2; }); seg.set(t, 10);
      const out = new Uint8Array(2 + seg.length + jpg.length - 2); out.set(jpg.slice(0, 2)); out.set(seg, 2); out.set(jpg.slice(2), 2 + seg.length); return out;
    };
    const dt = new DataTransfer();
    for (const s of specs) dt.items.add(s.exif ? new File([exif(s.exif)], s.name, { type: 'image/jpeg', lastModified: Date.UTC(2026, 10, 1, 9) })
      : new File([png], s.name, { type: 'image/png', lastModified: s.mod }));
    const el = document.querySelector('input[data-pick="library"]'); el.files = dt.files; el.dispatchEvent(new Event('change'));
  }, specs);
};
const groups = () => p.locator('.bk-g').evaluateAll(es => es.map(e => [e.querySelector('.bk-h b').textContent, e.querySelector('.bk-h span').textContent.replace(/\s+/g, ' '), e.querySelector('.chip.on').textContent]));

await hand([
  { name: 'a.jpg', exif: '2026:10:30 13:05:00' },     // Friday at the course: Round 1
  { name: 'b.jpg', exif: '2026:10:30 20:15:00' },     // Friday dinner: the trip
  { name: 'c.jpg', exif: '2026:10:29 12:00:00' },     // Thursday, a day off: the trip
  { name: 'd.jpg', exif: '2026:10:31 09:10:00' },     // Saturday morning: Round 2
  { name: 'e.png', mod: Date.UTC(2026, 9, 31, 8, 0) },  // no stamp, the file's date is Saturday 11:00: Round 2
  { name: 'f.png', mod: Date.UTC(2025, 0, 1) },       // from some other year: no date from this trip
]);
await p.waitForSelector('.bk-g', { timeout: 10000 }); await p.waitForTimeout(300);
ok('nothing is sent before they say so', await p.evaluate(() => Object.keys(window.__T.photos || {}).length), 0);
ok('it shows each pile by day with where it is going, the round or the trip', await groups(), [
  ['Thu 29 Oct', '1 photo → The trip', 'The trip'],
  ['Fri 30 Oct', '1 photo → Round 1', 'Round 1'],
  ['Fri 30 Oct', '1 photo → The trip', 'The trip'],
  ['Sat 31 Oct', '2 photos → Round 2', 'Round 2'],
  ['No date from this trip', '1 photo → The trip', 'The trip']]);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/bulk.png' });
ok('the button says how many', (await p.locator('[data-act="bulkGo"]').innerText()).trim(), 'Add 6');
await p.locator('.bk-g').nth(0).locator('[data-act="bulkDest"][data-b="practice"]').click(); await p.waitForTimeout(200);
ok('a pile can be sent to any round with one tap', (await groups())[0], ['Thu 29 Oct', '1 photo → Practice', 'Practice']);
await p.locator('[data-act="bulkGo"]').click();
await p.waitForFunction(() => Object.keys(window.__T.photos || {}).length === 6, null, { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(500);
const got = (await p.evaluate(() => Object.values(window.__T.photos || {}).map(x => ({ rid: x.rid, at: x.at, day: x.day || null, by: x.byName })))).sort((a, c) => a.at - c.at);
const at = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi) - 3 * 3600e3;
ok('every photo is in, under its own round, stamped with when it was taken',
  got.map(x => [x.rid, x.at]).filter(x => x[1] < Date.UTC(2026, 10, 1)),
  ([['practice', at(2026, 10, 29, 12, 0)], ['r1', at(2026, 10, 30, 13, 5)], ['trip', at(2026, 10, 30, 20, 15)], ['r2', at(2026, 10, 31, 9, 10)], ['r2', Date.UTC(2026, 9, 31, 8, 0)]]));
ok('and the undated one is stamped with now', got.filter(x => x.at >= Date.UTC(2026, 10, 1) - 1).length, 1);
ok('a trip photo carries its day, so the trip album files it under that day', got.find(x => x.rid === 'trip' && x.at === at(2026, 10, 30, 20, 15)).day, '2026-10-30');
ok('the one with no date from the trip goes to the trip, as today', got.filter(x => x.rid === 'trip').length, 2);
ok('the pile is closed once added', await p.locator('.modal.bulk').count(), 0);

console.log('\ncancelling');
await hand([{ name: 'g.jpg', exif: '2026:10:30 10:00:00' }]);
await p.waitForSelector('.bk-g', { timeout: 10000 });
await p.locator('.modal.bulk [data-act="modalCancel"]').click(); await p.waitForTimeout(400);
ok('sends nothing and closes', [await p.locator('.modal.bulk').count(), await p.evaluate(() => Object.keys(window.__T.photos || {}).length)], [0, 6]);
ok('the ordinary Add a photo button is not turned into a sorted one', await p.evaluate(() => { const b = document.querySelector('.pg-fab'); return b ? b.dataset.act : 'none'; }), 'photoPick');
ok('no errors', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
