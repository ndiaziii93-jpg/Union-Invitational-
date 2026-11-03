/* THE BOARDS STRIP STAYS WHERE IT WAS SCROLLED. A redraw used to bring the
   chosen tab back into view, which dragged a strip scrolled along to reach
   Photos back to its start every time the shared book landed anything.
   Run: node tools/tabs-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/tabs.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + S + '/tabs.html'); await p.waitForTimeout(3000);
for (let i = 0; i < 5; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(150); } }
await p.locator('[data-act="go"][data-a="boards"]:visible').first().click(); await p.waitForTimeout(500);
const strip = () => p.evaluate(() => { const s = document.querySelector('.btabs.games'); return [Math.round(s.scrollLeft), s.scrollWidth > s.clientWidth]; });
ok('the strip is wider than the phone, and starts at All', await strip(), [0, true]);
await p.evaluate(() => { const s = document.querySelector('.btabs.games'); s.scrollLeft = s.scrollWidth; }); await p.waitForTimeout(200);
const far = (await strip())[0];
ok('scrolled along to the end', far > 100, true);
await p.evaluate(() => { window.__T.photos.zz = { id: 'zz', rid: 'trip', url: 'https://x.test/zz.jpg', at: 1 }; window.__forceRender(); window.__render(true); }); await p.waitForTimeout(400);
ok('a redraw from the shared book leaves it where it was scrolled', (await strip())[0], far);
await p.locator('.btab[data-a="photos"]').click(); await p.waitForTimeout(500);
ok('tapping a tab there keeps it in view', await p.evaluate(() => { const s = document.querySelector('.btabs.games'), t = s.querySelector('.btab.on'); return t.dataset.a === 'photos' && t.offsetLeft >= s.scrollLeft && t.offsetLeft + t.offsetWidth <= s.scrollLeft + s.clientWidth + 1; }), true);
await p.evaluate(() => { window.__render(true); }); await p.waitForTimeout(300);
ok('and another redraw does not move it', await p.evaluate(() => { const s = document.querySelector('.btabs.games'), t = s.querySelector('.btab.on'); return t.offsetLeft >= s.scrollLeft && t.offsetLeft + t.offsetWidth <= s.scrollLeft + s.clientWidth + 1; }), true);
await p.evaluate(() => { document.querySelector('.btabs.games').scrollLeft = 0; }); await p.waitForTimeout(100);
await p.locator('.btab[data-a="report"]').click().catch(() => {}); await p.waitForTimeout(400);
ok('choosing a tab that was off the end brings it into view', await p.evaluate(() => { const s = document.querySelector('.btabs.games'), t = s.querySelector('.btab.on'); return t && t.dataset.a === 'report' && t.offsetLeft + t.offsetWidth <= s.scrollLeft + s.clientWidth + 1; }), true);
ok('no errors', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
