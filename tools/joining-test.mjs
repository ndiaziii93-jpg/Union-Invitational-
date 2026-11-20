/* HOW YOU ARE JOINING, AND THE ROUND YOU WALKED AWAY FROM.
 *
 * After Belek the field changes shape: one is not golfing, one plays two of
 * the three, one arrives on the Wednesday. The book had no word for the
 * middle of that, and no door to change it once the sign-up was filled in.
 *
 * Run: node tools/joining-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/join', { recursive: true });
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) fails.push(n);
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };
writeFileSync(S + '/join/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/join/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const boot = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 540, hasTouch: w < 540 });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e)); fails.push('pageerror'); });
  await p.goto(BASE); await p.waitForTimeout(2400);
  await p.evaluate(([from, to]) => {
    const T = window.__T, UI = window.__UI, Cl = window.__C;
    T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }],
      packages: [{ id: '7g', name: '7 nights · golfer', nights: 7, golf: true, price: 2200, inc: ['Room', 'Golf'] }],
      rooms: [], vendors: [], deadlines: {} };
    const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
    T.club.course__g1 = { ...Cl.courseFrom(hit, 'g1'), approved: true };
    T.club.signup__g1 = { pid: 'g1', status: 'in', pkg: '7g' };
    UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
  }, [iso(-3), iso(10)]);
  await p.waitForTimeout(700);
  return { ctx, p, go: (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]) };
};
const sign = p => p.evaluate(() => (window.__T.club || {}).signup__g1 || {});

/* ============ one: how you're joining ============ */
console.log('\n=== the door, on a phone that has no sidebar ===');
{
  const { ctx, p, go } = await boot(390, 844);
  ok('the You tab carries it', await p.locator('.mejoin').count(), 1);
  ok('and says where you stand', (await p.locator('.mejoin .ct').innerText()), 'Golfing · all of it · the full week');
  await p.locator('.mejoin').click(); await p.waitForTimeout(700);
  ok('tapping it opens your own screen', await p.evaluate(() => window.__UI.screen), 'me');
  ok('with your name on it', await p.locator('.me-id b').innerText(), 'Norberto III');

  console.log('\n=== golfing some of it ===');
  await p.locator('.me-r').first().click(); await p.waitForTimeout(500);
  ok('the joining card opens', await p.locator('.me-body .joincard').count(), 1);
  ok('no switches while you are in for all of it', await p.locator('.joincard .sw').count(), 0);
  await p.locator('.chip', { hasText: 'Some of it' }).first().click(); await p.waitForTimeout(600);
  const sw = p.locator('.joincard .sw');
  ok('every part of the trip HE could play gets a switch', await sw.count(), 6);
  ok('and it starts from the rounds that count', (await sign(p)).rounds, ['r1', 'r2', 'r3']);
  ok('the women\u2019s 18 is not among them', await p.locator('.sw', { hasText: '18' }).count(), 0);
  ok('the practice days are off', await sw.nth(0).getAttribute('aria-checked'), 'false');
  ok('round one is on', await sw.nth(2).getAttribute('aria-checked'), 'true');

  console.log('\n=== the switches are switches ===');
  await sw.nth(0).click(); await p.waitForTimeout(500);
  ok('turning a practice day on keeps the rest', (await sign(p)).rounds, ['p1', 'r1', 'r2', 'r3']);
  ok('and the switch says so', await p.locator('.joincard .sw').nth(0).getAttribute('aria-checked'), 'true');
  await p.locator('.sw').nth(4).click(); await p.waitForTimeout(500);
  ok('turning a round off takes only that one', (await sign(p)).rounds, ['p1', 'r1', 'r2']);
  ok('the knob moves, not just the colour', await p.evaluate(() => {
    const ss = document.querySelectorAll('.joincard .sw');
    const on = ss[0].querySelector('.sw-t i');
    const off = ss[4].querySelector('.sw-t i');
    return getComputedStyle(on).translate !== getComputedStyle(off).translate; }), true);

  console.log('\n=== how long you are there ===');
  await p.locator('.joincard .chip', { hasText: 'Part of it' }).first().click(); await p.waitForTimeout(600);
  ok('two dates appear', await p.locator('[data-act="joinField"]').count(), 2);
  await p.locator('[data-act="joinField"][data-a="arrive"]').fill('2027-11-16');
  await p.waitForTimeout(800);
  ok('the nights are counted off them', (await p.locator('.joincard .jh').last().innerText()).startsWith('5 nights'), true);
  ok('and the book holds the date', (await sign(p)).arrive, '2027-11-16');
  ok('the package drift is pointed out', (await p.locator('.jwarn').innerText()).includes('7 nights'), true);

  console.log('\n=== not golfing at all ===');
  await p.locator('.joincard .chip', { hasText: 'Not golfing' }).first().click(); await p.waitForTimeout(700);
  ok('the switches go away', await p.locator('.joincard .sw').count(), 0);
  ok('and the book reads it as not golfing everywhere',
    await p.evaluate(() => window.__C.divisionOf(window.__T, 'g1')), 'none');
  await p.locator('.joincard .chip', { hasText: 'All of it' }).first().click(); await p.waitForTimeout(700);
  ok('turning it back on restores a division', await p.evaluate(() => window.__C.divisionOf(window.__T, 'g1')), 'men');
  await p.locator('.me-menu').first().screenshot({ path: S + '/join/me-phone.png' });
  await ctx.close();
}

/* ============ two: the round you walked away from ============ */
console.log('\n=== the resume panel ===');
for (const [tag, w, h, nines] of [['phone', 390, 844, 1], ['iPad', 834, 1112, 2], ['laptop', 1440, 900, 2]]) {
  const { ctx, p, go } = await boot(w, h);
  await p.evaluate(() => {
    const T = window.__T, Cl = window.__C;
    const raw = [5, 4, 6, 4, 3, 5, 4, null, null, null, null, null, null, null, null, null, null, null];
    /* a card with no course scores nothing, so build it the way the book does */
    const C = window.__C;
    const card = C.blankClubCard('frostbite', 'g1', 12, T.club.course__g1, '2027-01-01');
    T.club[C.cardKey('frostbite', 'g1')] = { ...card, raw, at: Date.now() };
    window.__forceRender();
  });
  await p.waitForTimeout(900);
  console.log('--- ' + tag + ' ---');
  ok(tag + ': the panel is there', await p.locator('.resume').count(), 1);
  ok('it is the dark thing on the page', await p.evaluate(() => {
    const bg = getComputedStyle(document.querySelector('.resume')).backgroundColor;
    const card = getComputedStyle(document.querySelector('.cline')).backgroundColor;
    return bg !== card; }), true);
  ok('it shows the nines a screen this wide can read', await p.evaluate(() =>
    [...document.querySelectorAll('.rz-nine')].filter(n => getComputedStyle(n).display !== 'none').length), nines);
  ok('it knows which hole you are on', await p.locator('.rz-h.now').innerText(), '8');
  ok('and says what the round is worth', (await p.locator('.rz-sc').innerText()).includes('through 7'), true);
  const cw = await p.evaluate(() => {
    const nine = [...document.querySelectorAll('.rz-nine')].filter(n => getComputedStyle(n).display !== 'none')[0];
    const ws = [...nine.children].map(c => +c.getBoundingClientRect().width.toFixed(1));
    return { n: nine.children.length, min: Math.min(...ws), max: Math.max(...ws),
      nineW: Math.round(nine.getBoundingClientRect().width),
      strip: Math.round(document.querySelector('.rz-strip').getBoundingClientRect().width),
      panel: Math.round(document.querySelector('.resume').getBoundingClientRect().width) }; });
  console.log('      panel ' + cw.panel + 'px, strip ' + cw.strip + 'px, nine ' + cw.nineW + 'px, ' + cw.n + ' cells at ' + cw.min + '-' + cw.max + 'px');
  ok('every cell is wide enough to read', cw.min >= 20, true);
  ok('and the panel never runs off the glass', await p.evaluate(() => {
    const r = document.querySelector('.resume').getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 0.5; }), true);
  ok('the cover does not say it twice', await p.locator('[data-act="clubEnter"]').count() <= 2, true);
  await p.locator('.resume').screenshot({ path: S + '/join/resume-' + tag + '.png' });
  await ctx.close();
}

await b.close(); srv.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall good');
process.exit(fails.length ? 1 : 0);
