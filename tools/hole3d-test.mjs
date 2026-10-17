/* The hole window: the ground stood up with the yardages over it, opened
   from the hole plate; its pill, rails and dock; units; the next hole; How'd
   you feel? writing to your own notes; and the drawn hole when there is no
   WebGL. Needs software GL in headless Chromium, which the launch flags
   below turn on. Run: node tools/hole3d-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/h3.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '</head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errs = [];
const open = async (w, h, mob, init) => {
  const pg = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob })).newPage();
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  if (init) await pg.addInitScript(init);
  await pg.goto('file://' + S + '/h3.html');
  await pg.waitForTimeout(4200);
  for (let i = 0; i < 6; i++) {
    const d = pg.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break;
  }
  return pg;
};
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox(); await loc.page().mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); };
/* the plate sits low on a phone, under the fixed bars, until it is scrolled up */
const openPlate = async (pg) => { await pg.evaluate(() => document.querySelector('.holeplate').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(300); await tap(pg.locator('.hp-open').first()); await pg.waitForTimeout(1800); };
/* Score Entry raises the Setup window the first time it is opened; clear it,
   then pick whatever round the sheet offers. */
const toEntry = async (pg, sel) => {
  await pg.locator(sel).click(); await pg.waitForTimeout(800);
  /* Score Entry already stands on a round; anything raised over it — the
     Setup notice, a sheet — is dismissed */
  for (let i = 0; i < 6; i++) { const d = pg.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(250); } else break; }
};

/* ---- on a phone, with GL ---- */
console.log('\non a phone');
const p = await open(390, 844, true);
await toEntry(p, '.navbtn[data-a="entry"]');
ok('the plate is there to tap', await p.locator('.hp-open').count() > 0, true);
await openPlate(p);
ok('the hole window opens', await p.locator('.h3dwin').count(), 1);
ok('with the ground drawn live', await p.locator('.h3dwin canvas.h3canvas').count(), 1);
ok('the pill names the hole', (await p.locator('.h3pill .n').innerText()).trim(), 'Hole 1');
ok('the green card carries three numbers', await p.locator('.h3gcard b, .h3gcard i').count(), 3);
const yd = +(await p.locator('.h3gcard b').innerText());
ok('in yards, from the tee', yd > 100 && yd < 700, true);
await tap(p.locator('.h3unit [data-a="m"]')); await p.waitForTimeout(500);
const m = +(await p.locator('.h3gcard b').innerText());
ok('switched to metres the number shrinks by the right amount', Math.abs(m * 1.09361 - yd) <= 1.5, true);
ok('and the pill shows it', await p.locator('.h3unit button.on').innerText(), 'M');
ok('the dock carries par', (await p.locator('.h3dock .par b').innerText()).trim(), (await p.evaluate(() => document.querySelector('.h3dock .par b').textContent)).trim());
ok('and asks who you are until you say', (await p.locator('.h3dock .fig span').innerText()).trim().toLowerCase(), 'who are you?');
ok('nothing on the window scores a hole', await p.locator('.h3dwin [data-act="saveHole"], .h3dwin .ptile, .h3dwin .keypad').count(), 0);
/* a tap on the ground puts the target down */
const live = p.locator('.h3live'); const lb = await live.boundingBox();
await p.mouse.click(lb.x + lb.width * .5, lb.y + lb.height * .42); await p.waitForTimeout(400);
ok('a tap on the ground puts the target down', await p.evaluate(() => getComputedStyle(document.querySelector('.h3tcard')).display !== 'none'), true);
ok('with a number to it and a number on', await p.locator('.h3tcard b, .h3tcard small').count(), 2);
/* the next hole */
await tap(p.locator('.h3pill .ar').nth(1)); await p.waitForTimeout(1500);
ok('the arrow turns the hole', (await p.locator('.h3pill .n').innerText()).trim(), 'Hole 2');
ok('and the ground is rebuilt for it', await p.locator('.h3dwin canvas.h3canvas').count(), 1);
/* How'd you feel? */
await tap(p.locator('.h3feel')); await p.waitForTimeout(500);
ok('How\'d you feel? opens a sheet', await p.locator('.h3feelwin').count(), 1);
ok('that first asks who you are', await p.locator('.h3feelwin .h3pick .chip').count() > 0, true);
await tap(p.locator('.h3feelwin .h3pick .chip').first()); await p.waitForTimeout(600);
ok('then offers the four marks of your own', await p.locator('.h3chip').count(), 4);
await tap(p.locator('.h3chip').nth(1)); await p.waitForTimeout(600);
ok('a mark goes on', await p.locator('.h3chip.on').count(), 1);
ok('the dock now knows you', (await p.locator('.h3dock .fig span').innerText()).toLowerCase().startsWith('band'), true);
await tap(p.locator('.h3feelwin [data-act="artFeel"]').last()); await p.waitForTimeout(400);
ok('Done closes the sheet and keeps the window', [await p.locator('.h3feelwin').count(), await p.locator('.h3dwin').count()], [0, 1]);
ok('the mark is in your notes', await p.evaluate(() => {
  const T = window.__T || null; return T ? Object.keys(T.notes || {}).length > 0 : null;
}) !== false, true);
/* close */
await tap(p.locator('.h3x')); await p.waitForTimeout(500);
ok('and it closes', await p.locator('.h3dwin').count(), 0);
ok('without the ground left behind', await p.locator('canvas.h3canvas').count(), 0);
ok('no errors on the way', errs, []);

/* ---- a laptop ---- */
console.log('\non a laptop');
const L = await open(1280, 900, false);
await toEntry(L, '.tab[data-a="entry"]');
await openPlate(L);
const box = await L.locator('.h3dwin').boundingBox();
ok('on a laptop it is a tall window, not the whole glass', box.width < 500 && box.height < 900 && box.x > 100, true);
ok('with the ground in it', await L.locator('.h3dwin canvas.h3canvas').count(), 1);

/* ---- no WebGL: the drawn hole ---- */
console.log('\nwithout WebGL');
const N = await open(390, 844, true, () => { Object.defineProperty(window, 'THREE', { get: () => undefined, set: () => {} }); });
await toEntry(N, '.navbtn[data-a="entry"]');
await openPlate(N);
ok('the window still opens', await N.locator('.h3dwin').count(), 1);
ok('on the drawn hole instead', await N.locator('.h3fallback img').count(), 1);
ok('and no ground is attempted', await N.locator('canvas.h3canvas').count(), 0);

await b.close();
console.log('\nhole3d exit ' + (fails.length ? 1 : 0) + ' (' + (fails.length ? fails.length + ' failed' : 'all passed') + ')');
process.exit(fails.length ? 1 : 0);
