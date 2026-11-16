/* Shots on the hole: that the tap which aims becomes the tap which records
   while your own round is open, that what it writes is small and right, that
   it is never demanded, and that nobody can write shots onto anybody else. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as C from '../src/club.js';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/sp', { recursive: true });
let bad = 0;
const ok = (name, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + name + '  got ' + JSON.stringify(got) +
    (want === undefined ? '' : '  want ' + JSON.stringify(want)));
};

/* ---- the model, on its own ---- */
console.log('--- what a shot costs to keep ---');
const holes = Array.from({ length: 18 }, (_, i) => ({ par: [4,4,3,4,5,4,3,4,5,4,5,4,3,4,4,4,3,5][i], si: i + 1, y: 380 }));
let card = C.blankClubCard('s1', 'g1', 20, { name: 'Leatherhead Golf Club', tee: 'White', holes }, '2027-03-01');
card.shots = C.withShot(card, 0, C.clubIndex('Dr'), -3.4, -231.5);
ok('a shot is three numbers, not an object', card.shots['0'], [[0, -34, -2315]]);
ok('and reads back as the club and the ground', C.shotsOf(card, 0), [{ ci: 0, club: 'Dr', x: -3.4, z: -231.5 }]);
ok('a drive of 231 metres is 253 yards', C.toYards(C.shotGap({ x: 0, z: 0 }, C.shotsOf(card, 0)[0])), 253);
let full = C.blankClubCard('s1', 'g1', 20, { name: 'Leatherhead Golf Club', tee: 'White', holes }, '2027-03-01');
for (let h = 0; h < 18; h++) for (let k = 0; k < 5; k++) full.shots = C.withShot(full, h, k, -3 - k, -(230 - k * 40));
full.done = true; full.at = Date.now();
full.photo = { url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/shots/abcdef0123456789.webp',
  thumb: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/shots/abcdef0123456789-t.webp', at: Date.now() };
ok('a whole round of them still fits the server’s 4000', JSON.stringify(full).length < 4000, true);
ok('fifteen a hole and no more', (() => { let c = card; for (let i = 0; i < 40; i++) c = { ...c, shots: C.withShot(c, 1, 0, 1, -10) }; return C.shotsOf(c, 1).length; })(), C.SHOTS_MAX);
ok('the club list is append-only, so Dr stays index 0', [C.clubIndex('Dr'), C.clubName(0), C.clubName(17)], [0, 'Dr', 'Putt']);

/* ---- and in the app ---- */
writeFileSync(S + '/sp/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/sp/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2500);
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const tapGlass = async (fx, fy) => {
  const box = await p.locator('.h3live').boundingBox();
  const x = box.x + box.width * fx, y = box.y + box.height * fy;
  await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up();
  await p.waitForTimeout(260);
};

await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, Cl = window.__C;
  T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: '' }], packages: [] };
  const hit = Cl.courseLibrary(T).find(x => x.id === 'leatherhead');
  for (const pid of ['g1', 'g2']) T.club['course__' + pid] = { ...Cl.courseFrom(hit, pid), approved: true };
  UI.who = 'g1'; UI.me = 'g1'; UI.screen = 'you'; UI.modal = null; window.__forceRender();
}, [iso(-3), iso(10)]);
await p.waitForTimeout(400);
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(350);
if (await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'newround')) { await act('roundGo', { a: 'comp' }); await p.waitForTimeout(500); }
console.log('--- the hole is on the Score Entry screen, not behind a tap ---');
const inline = await p.evaluate(() => ({
  canvas: document.querySelectorAll('#h3dInline canvas').length,
  bar: document.querySelectorAll('.h3in .h3shotbar').length,
  big: document.querySelectorAll('.h3big').length,
  pans: getComputedStyle(document.querySelector('#h3dInline .h3live')).touchAction }));
ok('the glass is there without opening anything', inline.canvas, 1);
ok('with its own shot bar', inline.bar, 1);
ok('and a way to see it full screen', inline.big, 1);
ok('it does not eat the page\u2019s scroll', inline.pans, 'pan-y');
{
  const box = await p.locator('#h3dInline .h3live').boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); await p.waitForTimeout(400);
}
ok('a tap on it writes a shot, same as the big one',
  await p.evaluate(() => { const c = window.__T.club.card__frostbite__g1; return c && c.shots && c.shots['0'] ? c.shots['0'].length : 0; }), 1);
await p.evaluate(() => { const b = document.querySelector('.h3in [data-act="shotClear"]'); if (b) b.click(); });
await p.waitForTimeout(300);

await act('holeArt', { a: '0', b: 'home__g1' }); await p.waitForTimeout(1800);
ok('and when the big window opens, the small one stands down',
  await p.evaluate(() => [document.querySelectorAll('#h3dInline').length, document.querySelectorAll('.h3shotbar').length]), [0, 1]);

console.log('--- the window turns into a notebook ---');
ok('the glass is up', await p.locator('.h3live').count(), 1);
ok('with a shot bar on it', await p.locator('.h3shotbar').count(), 1);
ok('every club on the bar', await p.locator('.h3club').count(), C.SHOT_CLUBS.length);
ok('the driver is the one in hand to start', await p.locator('.h3club.on').textContent(), 'Dr');
ok('and the glass says it is listening', await p.evaluate(() => document.querySelector('.h3live').classList.contains('picking')), true);
ok('it asks for the first one plainly', /Tap the ground/.test(await p.locator('.h3sb-foot span').first().textContent()), true);

console.log('--- a drive ---');
await tapGlass(0.5, 0.56);
const one = await p.evaluate(() => {
  const c = window.__T.club.card__frostbite__g1;
  return { shots: c && c.shots ? JSON.parse(JSON.stringify(c.shots)) : null,
    pins: document.querySelectorAll('.h3shot').length,
    said: (document.querySelector('.h3sb-foot span') || {}).textContent || '' };
});
ok('one shot is on the card, under hole one', one.shots && Object.keys(one.shots), ['0']);
ok('written as three numbers', Array.isArray(one.shots['0'][0]) && one.shots['0'][0].length, 3);
ok('with the driver on it', one.shots['0'][0][0], 0);
ok('a pin is drawn for it', one.pins >= 1, true);
ok('and the bar counts it with a yardage', /1 shot here .* yds/.test(one.said), true);

console.log('--- a second, with a different club ---');
await p.evaluate(() => { const b = [...document.querySelectorAll('.h3club')].find(x => x.textContent === '9i'); b.click(); });
await p.waitForTimeout(200);
ok('the club in hand changes without redrawing the glass', await p.locator('.h3club.on').textContent(), '9i');
await tapGlass(0.52, 0.36);
const two = await p.evaluate(() => {
  const c = window.__T.club.card__frostbite__g1;
  return { n: c.shots['0'].length, clubs: c.shots['0'].map(s => s[0]), pins: document.querySelectorAll('.h3shot').length };
});
ok('two shots on the hole', two.n, 2);
ok('the second was a 9 iron', two.clubs[1], C.clubIndex('9i'));
ok('two pins on the glass', two.pins >= 2, true);
ok('the glass never blinked: it is the same canvas', await p.locator('.h3live canvas').count(), 1);

console.log('--- undo, and clear ---');
await p.evaluate(() => document.querySelector('[data-act="shotUndo"]').click()); await p.waitForTimeout(250);
ok('undo takes the last one off', await p.evaluate(() => window.__T.club.card__frostbite__g1.shots['0'].length), 1);
await p.evaluate(() => document.querySelector('[data-act="shotClear"]').click()); await p.waitForTimeout(250);
ok('clear empties the hole, and leaves no empty row behind',
  await p.evaluate(() => JSON.stringify(window.__T.club.card__frostbite__g1.shots)), '{}');

console.log('--- it is never demanded ---');
await tapGlass(0.5, 0.5);
await p.evaluate(() => { window.__UI.modal = null; window.__forceRender(); }); await p.waitForTimeout(400);
const pars = await p.evaluate(() => window.__T.club.course__g1.holes.map(h => h.par));
for (let i = 0; i < 18; i++) { await p.evaluate(i => { window.__UI.clubHole = i; }, i); await act('clubScore', { a: String(pars[i] + 1) }); }
await p.waitForTimeout(400);
const posted = await p.evaluate(() => {
  const C2 = window.__C, c = window.__T.club.card__frostbite__g1;
  return { thru: C2.cardTotals(c).thru, shots: C2.shotCount(c), dots: document.querySelectorAll('.hcell .sdot').length };
});
ok('eighteen holes written with shots on only one of them', [posted.thru, posted.shots], [18, 1]);
ok('and the strip marks the hole that has them', posted.dots, 1);

console.log('--- whose round it is ---');
const other = await p.evaluate(() => {
  window.__UI.modal = { kind: 'art', rid: null, hole: 0, ckey: 'home__g2' };
  window.__forceRender();
  return document.querySelectorAll('.h3shotbar').length;
});
ok('somebody else’s hole offers no shot bar', other, 0);

await p.evaluate(() => {
  const T = window.__T;
  T.club.card__frostbite__g1 = { ...T.club.card__frostbite__g1, done: true };
  window.__UI.modal = { kind: 'art', rid: null, hole: 0, ckey: 'home__g1' };
  window.__forceRender();
});
await p.waitForTimeout(400);
ok('and a card already posted is closed to them too', await p.locator('.h3shotbar').count(), 0);

await p.screenshot({ path: S + '/sp/hole.png' });
await ctx.close(); await b.close(); srv.close();
if (errs.length) { bad += errs.length; console.log('PAGE ERRORS: ' + errs.join(' | ')); }
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
