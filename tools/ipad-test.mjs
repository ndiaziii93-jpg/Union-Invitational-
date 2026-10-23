/* THE BAR ON AN iPAD. A tablet is held like a big phone, so on a touch
   screen of an iPad's size the five tabs sit along the bottom in the same
   dark bar a phone has, and the strip at the head goes. A laptop window of
   the same size keeps the strip. Whatever stands at the foot of the screen
   — Save, the keypad — stands on the bar, not behind it.
   Run: node tools/ipad-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/ipad.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const open = async (w, h, touch, ua, points) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch || points > 0, ...(ua ? { userAgent: ua } : {}) });
  if (points != null) await ctx.addInitScript(n => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n }), points);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + S + '/ipad.html'); await p.waitForTimeout(4000);
  for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(150); } else break; }
  return p;
};
const bars = p => p.evaluate(() => {
  const t = document.querySelector('.tabbar'), s = document.querySelector('.tabs');
  const r = t.getBoundingClientRect(), btns = [...t.querySelectorAll('.navbtn')];
  return { bar: getComputedStyle(t).display !== 'none', strip: getComputedStyle(s).display !== 'none',
    atFoot: Math.abs(innerHeight - r.bottom) <= 1, rows: new Set(btns.map(x => Math.round(x.getBoundingClientRect().top))).size, n: btns.length };
});
for (const [w, h, name] of [[820, 1180, 'an iPad upright'], [1180, 820, 'an iPad on its side'], [1024, 1366, 'an iPad Pro upright']]) {
  console.log('\n' + name);
  const p = await open(w, h, true, IPAD, 5);
  const s = await bars(p);
  ok('the five tabs are along the bottom', [s.bar, s.atFoot, s.n, s.rows], [true, true, 5, 1]);
  ok('and the strip at the head is gone', s.strip, false);
  await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(700);
  for (let i = 0; i < 4; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(150); } }
  const tile = p.locator('.ptile[data-act="padOpen"]').first();
  if (await tile.count()) { await tile.click(); await p.waitForTimeout(400); }
  const clear = await p.evaluate(() => {
    const top = document.querySelector('.tabbar').getBoundingClientRect().top;
    return ['.savebar', '.keypad'].map(q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().bottom <= top + 1 : 'absent'; });
  });
  ok('Save and the keypad stand on the bar, not behind it', clear.map(x => x === true || x === 'absent'), [true, true]);
  ok('nothing pushes the page sideways', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await p.context().close();
}
/* A trackpad or a Magic Keyboard makes the pointer fine, like a laptop's, and
   iPadOS's desktop-site mode calls the browser a Mac. Still an iPad. */
for (const [ua, how] of [[IPAD, 'with a trackpad attached'], [MAC, 'with a trackpad, asking for the desktop site']]) {
  console.log('\nan iPad ' + how);
  const t = await open(1180, 820, false, ua, 5);
  const ts = await bars(t);
  ok('still has the tabs along the bottom', [ts.bar, ts.atFoot, ts.strip], [true, true, false]);
  await t.context().close();
}
console.log('\na laptop window of the same size');
const d = await open(1180, 820, false, MAC, 0);
const ds = await bars(d);
ok('keeps the strip at the head', [ds.strip, ds.bar], [true, false]);
await d.context().close();
console.log('\na phone');
const ph = await open(390, 844, true);
const ps = await bars(ph);
ok('keeps its own bar at the foot', [ps.bar, ps.atFoot, ps.strip], [true, true, false]);
await ph.context().close();
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
