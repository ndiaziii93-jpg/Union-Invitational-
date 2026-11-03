/* THE MOON. One button in the masthead, on every screen: a tap goes Day,
   Night, Low power, Day. Night is the pine palette on every token. Low power
   is night with the photos waiting for a tap and a line at the top saying
   so. The phone remembers, and nothing but the button changes it.
   Run: node tools/mode-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/mode.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#3E5C43"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUDAoAAAgQAAG5/1yqAAAAAElFTkSuQmCC', 'base64');
const MOCK = () => { window.claude = { use: async n => n !== 'assets' ? null : { upload: async blob => { window.__uploads = (window.__uploads || 0) + 1; return { id: 'a' + window.__uploads, url: 'blob-' + Date.now() + '.jpg', sizeBytes: blob.size }; } } }; };

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
const cls = () => p.evaluate(() => ({ night: document.documentElement.classList.contains('night'), low: document.documentElement.classList.contains('low') }));
const bg = sel => p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
const moon = () => p.locator('.masthead .moonbtn');

await p.goto('file://' + S + '/mode.html'); await p.waitForTimeout(3500); await shut();
console.log('\nday, as the book opens');
ok('the moon is in the masthead, once', [await moon().count(), await p.locator('.topstrip .moonbtn').count()], [1, 1]);
ok('day: the page is cream and the moon is a sun', [await cls(), await moon().getAttribute('aria-label')], [{ night: false, low: false }, 'Day. Tap for night']);
const dayPage = await bg('body');

console.log('\none tap: night');
await moon().click(); await p.waitForTimeout(400);
ok('the page turns to the pine night', [await cls(), (await bg('body')) !== dayPage], [{ night: true, low: false }, true]);
ok('every pine surface follows: the main card, the tab bar, the countdown plate', await p.evaluate(() => ['.cc--main', '.tabbar', '.nowplate'].map(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : 'none'; })),
  ['rgb(11, 17, 13)', 'rgb(11, 17, 13)', 'rgb(11, 17, 13)']);
ok('the phone\'s own chrome is told', await p.evaluate(() => document.querySelector('meta[name=theme-color]').content), '#0B110D');
ok('and the phone remembers', await p.evaluate(() => localStorage.getItem('union-invitational:mode')), 'night');

console.log('\nanother: low power');
await moon().click(); await p.waitForTimeout(400);
ok('low power is night with a gold dot', [await cls(), await p.evaluate(() => getComputedStyle(document.querySelector('.masthead .moonbtn .dot')).display)], [{ night: true, low: true }, 'block']);
ok('a line at the top says so, with a way off', [await p.locator('.lowline').count(), await p.locator('.lowline button').innerText()], [1, 'Turn off']);
ok('nothing moves', await p.evaluate(() => getComputedStyle(document.querySelector('.cc')).transitionDuration), '0s');
ok('the store is told', await p.evaluate(() => window.__meta ? window.__meta.lowPower : null), true);

console.log('\na photo in low power');
await p.locator('.navbtn[data-a="entry"]').click(); await p.waitForTimeout(700); await shut();
const cam = p.locator('.holeplate .hp-cam').first();
await cam.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(200);
await cam.click(); await p.waitForTimeout(250);
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-act="photoLib"]').click()]);
await chooser.setFiles({ name: 'low.png', mimeType: 'image/png', buffer: PNG }); await p.waitForTimeout(1500);
ok('it waits, and says why', [await p.evaluate(() => window.__uploads || 0), /low power is on/.test(await p.locator('.snaprow .phq').innerText())], [0, true]);
ok('with a way to send it now', await p.locator('.phq .sendnow').count(), 1);
await p.locator('.phq .sendnow').click(); await p.waitForTimeout(1500);
ok('which sends it', [await p.evaluate(() => window.__uploads || 0), await p.locator('.snaprow .phq').count()], [1, 0]);

console.log('\nthe app opened again');
await p.reload(); await p.waitForTimeout(3500);
ok('comes back in low power', await cls(), { night: true, low: true });
await shut();
console.log('\nturn off, from the line');
await p.locator('.lowline button').click(); await p.waitForTimeout(400);
ok('day again, cream again, remembered', [await cls(), (await bg('body')) === dayPage, await p.evaluate(() => localStorage.getItem('union-invitational:mode'))], [{ night: false, low: false }, true, 'day']);
ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
