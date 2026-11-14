/* THE CLUBHOUSE. The book between tournaments: three tabs, a season of
   virtual rounds scored on the Score Entry furniture, Vegas HQ with the
   money in meters, the 2026 book readable under the season switch and
   closed to every write. A seeded sandbox, local mode.
   Run: node tools/club-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

console.log('the season, as functions');
const C = await import('../src/club.js');
const T0 = { config: { people: [{ id: 'g1', name: 'A', display: 'A', role: 'golfer', band: 20 }, { id: 'g2', name: 'B', display: 'B', role: 'golfer', band: 16 }, { id: 's1', name: 'S', display: 'S', role: 'spectator', band: null }] }, club: {} };
ok('no season doc: the week, not frozen, three seeded stops', [C.phaseOf(T0), C.frozen(T0), C.stops(T0).map(s => s.id)], ['week', false, ['mulligan', 'frostbite', 'sweetheart']]);
const course = { ...C.blankCourse('g1'), name: 'Home', holes: Array.from({ length: 18 }, (_, i) => ({ par: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4, 4, 3, 5][i], si: i + 1, y: 380 })) };
ok('a course needs 18 pars and each index once', [C.courseOk(course), C.courseOk({ ...course, holes: course.holes.map(h => ({ ...h, si: 1 })) }), C.coursePar(course)], [true, false, 72]);
const card = C.blankClubCard('frostbite', 'g1', 20, course); card.raw = course.holes.map(h => h.par + 1); card.done = true;
ok('a card of bogeys off 20 is 38 points (two strokes on SI 1 and 2)', [C.cardTotals(card).pts, C.cardTotals(card).thru, C.diffOf(card)], [38, 18, 18]);
T0.club = { season: { phase: 'club', frozen: true, stops: [{ id: 'frostbite', name: 'The Frostbite Open', from: '2026-01-01', to: '2026-01-31', format: 'stableford' }] }, card__frostbite__g1: card, card__frostbite__g2: { ...C.blankClubCard('frostbite', 'g2', 16, course), raw: course.holes.map(h => h.par + 2), done: true } };
ok('the stop board orders by points; the Order of Merit pays 100 and 60 once the stop has closed', [C.stopBoard(T0, 'frostbite').map(r => [r.pid, r.pts, r.pos]), C.merit(T0, '2026-02-01').map(r => [r.pid, r.pts])], [[['g1', 38, 1], ['g2', 16, 2]], [['g1', 100], ['g2', 60]]]);
ok('the Union handicap stays on the Belek band until three cards are in', [C.unionHcp(T0, 'g1', '2026-02-01').hcp, C.unionHcp(T0, 'g1', '2026-02-01').need], [20, 2]);
T0.club.season.packages = [{ id: '7g', name: '7 golf', price: 2000, nights: 7, golf: true, inc: ['x'] }];
T0.club['signup__g1'] = { pid: 'g1', status: 'in', pkg: '7g', shirt: 'XL' };
T0.club['money__g1'] = { pid: 'g1', pays: [{ amt: 400, at: '2026-01-12' }, { amt: 600, at: '2026-02-01' }] };
ok('the ledger: price from the package, paid from the payments, the meter half full', [C.ledger(T0, 'g1').price, C.ledger(T0, 'g1').paid, C.ledger(T0, 'g1').left, C.ledger(T0, 'g1').pct], [2000, 1000, 1000, 0.5]);
ok('the headcount export carries the name, the package and the money', C.csvHeadcount(T0).split('\n')[1], 'A,golfer,Tournament · men’s,in,7 golf,7,yes,XL,,,2000,1000,1000');

/* the book in a browser */
mkdirSync(S + '/clubsite', { recursive: true });
writeFileSync(S + '/clubsite/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(S + '/clubsite/index.html')); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const tabs = () => p.evaluate(() => [...document.querySelectorAll('.tabbar .navbtn .lb')].map(e => e.textContent.replace(e.querySelector('.lg').textContent, '').trim()));
await p.goto(BASE); await p.waitForTimeout(2500);

console.log('\nthe week, untouched');
ok('with no season, the six tabs of the week and no season switch', [(await tabs()).length, await p.locator('.sswitch').count()], [6, 0]);

console.log('\nthe Clubhouse opens');
const today = new Date().toISOString().slice(0, 10);
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ahead = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await p.evaluate(([today, A40, A10, A3, H10, H20, H40]) => {
  const ago = { 40: A40, 10: A10, 3: A3 }, ahead = { 10: H10, 20: H20, 40: H40 };
  const T = window.__T, UI = window.__UI;
  T.config.people.filter(x => x.role === 'golfer').forEach((g, i) => { g.band = [16, 30, 20, 25, 15, 20, 25, 20, 30, 16, 20][i] || 20; });
  T.club.season = { phase: 'club', frozen: true, opened: ago[10], name: 'Las Vegas 2027', tag: 'A Desert Showdown', window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'mulligan', name: 'The Merry Mulligan Open', from: ago[40], to: ago[10], format: 'stableford', note: 'x' }, { id: 'frostbite', name: 'The Frostbite Open', from: ago[3], to: ahead[10], format: 'stableford', note: 'y' }, { id: 'sweetheart', name: 'The Sweetheart Scramble', from: ahead[20], to: ahead[40], format: 'stableford', note: 'z' }],
    packages: [{ id: '7g', name: '7 nights · golfer', price: 2089, nights: 7, golf: true, inc: ['7 nights', 'golf'] }, { id: '7n', name: '7 nights · not golfing', price: 1839, nights: 7, golf: false, inc: ['7 nights'] }], rooms: [], vendors: [] };
  UI.who = 'g1';
  window.__forceRender();
}, [today, ago(40), ago(10), ago(3), ahead(10), ahead(20), ahead(40)]);
await p.waitForTimeout(400);
ok('three tabs, the season switch, and You is the screen', [await tabs(), await p.locator('.sswitch .ssw').count(), await p.evaluate(() => window.__UI.screen)], [['You', 'Season', 'Vegas HQ'], 2, 'you']);
const you = await p.evaluate(() => ({ greet: document.querySelector('.cc-h') && document.querySelector('.cc-h').textContent.includes('Norberto'), dials: document.querySelectorAll('.ckpi').length, open: !!document.querySelector('[data-act="clubEnter"][data-a="frostbite"]'), form: document.querySelector('.ckpi small') && document.querySelector('.ckpi small').textContent, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, photo: !!document.querySelector('.ccover .cc-ph') }));
ok('You: the headline names you, three figures, the open stop with Enter my card, a cover, nothing sideways', [you.greet, you.dials, you.open, you.form, you.wide <= 1, you.photo], [true, 3, true, 'Form', true, true]);
ok('the dateline reads the road to Vegas and the stop that closes', await p.evaluate(() => [...document.querySelectorAll('.dateline span')].map(x => x.textContent.trim()).join(' ')), 'Road to Vegas ' + Math.round((Date.parse('2027-11-13') - Date.parse(today)) / 86400000) + ' days Frostbite Open closes ' + new Date(ahead(10) + 'T12:00:00Z').toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' }).slice(0, 3));

console.log('\na virtual round');
await act('clubEnter', { a: 'frostbite' }); await p.waitForTimeout(300);
ok('with no home course yet, the course form', [await p.evaluate(() => window.__UI.screen), await p.locator('.ctbl.course input').count(), await p.locator('[data-act="courseSave"]').isDisabled()], ['clubentry', 54, true]);
await p.evaluate(() => { const c = window.__UI.courseDraft; c.name = 'Blackwolf Run'; c.tee = 'White'; c.holes.forEach((h, i) => { h.par = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4, 4, 3, 5][i]; h.si = [3, 11, 17, 7, 1, 9, 15, 5, 13, 4, 2, 12, 18, 8, 10, 6, 16, 14][i]; }); });
await act('courseSave'); await p.waitForTimeout(300);
const entry = await p.evaluate(() => ({ cells: document.querySelectorAll('.hstrip .hcell').length, tile: document.querySelectorAll('[data-act="clubPad"]').length, pad: document.querySelectorAll('.keypad').length, course: window.__T.club.course__g1 && window.__T.club.course__g1.name, approved: window.__T.club.course__g1.approved, bar: !!document.querySelector('.savebar.mine') }));
ok('the Score Entry furniture: the eighteen on the strip, the tile, the bar; the course saved and awaiting approval', [entry.cells, entry.tile, entry.pad, entry.course, entry.approved, entry.bar], [18, 1, 0, 'Blackwolf Run', false, true]);
await act('clubPad'); await p.waitForTimeout(200);
ok('tap the tile and the keypad rises with par marked', [await p.locator('.keypad').count(), await p.locator('.keypad .key.par').textContent()], [1, '4par']);
await p.locator('.keypad .key[data-a="5"]').dispatchEvent('click'); await p.waitForTimeout(250);
ok('a 5 on the 1st: on the card, and the pad moves to the 2nd', await p.evaluate(() => [window.__T.club.card__frostbite__g1.raw[0], window.__UI.clubHole, document.querySelectorAll('.keypad').length]), [5, 1, 1]);
for (let i = 1; i < 18; i++) { await p.evaluate(i => { const x = document.createElement('button'); x.dataset.act = 'clubScore'; x.dataset.a = String([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4, 4, 3, 5][i] + 1); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, i); }
await p.waitForTimeout(300);
const done = await p.evaluate(() => ({ thru: window.__T.club.card__frostbite__g1.raw.filter(x => x != null).length, panel: !!document.querySelector('#cardDone'), photoIn: document.querySelectorAll('input[data-act="cardPhoto"]').length, post: document.querySelectorAll('[data-act="clubPost"]').length, pad: document.querySelectorAll('.keypad').length }));
ok('eighteen in: the card asks for the photo before it counts, and no Post without it', [done.thru, done.panel, done.photoIn, done.post, done.pad], [18, true, 1, 0, 0]);
await act('clubPost'); await p.waitForTimeout(200);
ok('posting without a photo does nothing', await p.evaluate(() => !!window.__T.club.card__frostbite__g1.done), false);
await p.evaluate(() => { window.__T.club.card__frostbite__g1.photo = { url: 'https://x.supabase.co/storage/v1/object/public/photos/card.jpg', thumb: null }; window.__forceRender(); }); await p.waitForTimeout(200);
await act('clubPost'); await p.waitForTimeout(300);
const posted = await p.evaluate(() => { const C = window.__T.club.card__frostbite__g1; return [C.done, C.hcp]; });
ok('with the photo, the card posts off the Belek band', posted, [true, 16]);

console.log('\nthe Season');
await act('go', { a: 'season' }); await p.waitForTimeout(300);
const season = await p.evaluate(() => ({ chips: document.querySelectorAll('.stopchips .chip').length, plate: document.querySelector('.cc-h') && document.querySelector('.cc-h').textContent.includes('Norberto III'), rows: document.querySelectorAll('.ctbl tbody tr').length, pts: document.querySelector('.ctbl tbody tr .r b') && document.querySelector('.ctbl tbody tr .r b').textContent, live: !!(document.querySelector('.ccover .ck') || {}).textContent && document.querySelector('.ccover .ck').textContent.includes('live') }));
ok('This stop: three chips, the leader on the cover and live, one card on the board with its points', [season.chips, season.plate, season.rows, season.pts, season.live], [3, true, 1, '34', true]);
await act('seasonTab', { a: 'merit' }); await p.waitForTimeout(200);
ok('Standings pay nothing until a stop closes', await p.locator('.ctbl tbody tr').count(), 0);
await p.evaluate(() => { const s = window.__T.club.season; s.stops[1].to = new Date(Date.now() - 86400000).toISOString().slice(0, 10); window.__forceRender(); }); await p.waitForTimeout(200);
ok('the stop closes at midnight: crowned, and the Order of Merit pays 100', await p.evaluate(() => [...document.querySelectorAll('.ctbl tbody tr')].map(r => [...r.children].map(c => c.textContent.trim()).join(' '))), ['1 Norberto III 1 1 100']);
await act('seasonTab', { a: 'hcp' }); await p.waitForTimeout(200);
ok('Handicaps: the Belek band, the Union handicap, cards in, more cards wanted', await p.evaluate(() => [...document.querySelector('.ctbl tbody tr.me').children].map(c => c.textContent.trim()).join(' ')), 'Norberto III 16 16 1 2 more cards');
await act('seasonTab', { a: 'awards' }); await p.waitForTimeout(200);
ok('Awards: five, the Order of Merit named', [await p.locator('.award').count(), await p.locator('.award').first().textContent()], [5, 'The Order of MeritNorberto III · 100 ptsCrowned in Vegas, on the first night.']);
await act('seasonTab', { a: 'archive' }); await p.waitForTimeout(200);
ok('Archive: the Belek book, and no link to Claude anywhere', [await p.locator('[data-act="archiveView"][data-a="2026"]').count() >= 1, await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length)], [true, 0]);

console.log('\nVegas HQ');
await act('go', { a: 'hq' }); await p.waitForTimeout(300);
ok('the hero counts the days; the line has eight items; the field lists everyone but the refs', await p.evaluate(() => [document.querySelector('.vhero .big').textContent.replace(/\D/g, '') !== '', document.querySelectorAll('.chk').length, document.querySelectorAll('.frow').length]), [true, 8, 20]);
await act('signStatus', { a: 'in' }); await p.waitForTimeout(200);
await act('signPkg', { a: '7g' }); await p.waitForTimeout(200);
await p.evaluate(() => { window.__T.club.money__g1 = { pid: 'g1', pays: [{ amt: 400, at: '2026-11-01', note: 'deposit' }] }; window.__forceRender(); }); await p.waitForTimeout(200);
const hq = await p.evaluate(() => ({ status: window.__T.club.signup__g1.status, pkg: window.__T.club.signup__g1.pkg, meter: document.querySelector('.mymeter .meter i').style.width, text: document.querySelector('.mymeter .num').textContent, pill: document.querySelector('.frow .pill').textContent, chosen: document.querySelectorAll('.pkg.on').length }));
ok('In, the package chosen, the meter shows £400 of £2,089', [hq.status, hq.pkg, hq.meter, hq.text, hq.pill, hq.chosen], ['in', '7g', '19%', '£400 paid · £1,689 to go', 'In', 1]);
ok('nothing sideways on HQ', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);

console.log('\nManage');
await act('manageClub'); await p.waitForTimeout(300);
ok('the season window opens on its tabs', [await p.locator('.clubmodal').count(), await p.locator('.clubmodal .btab').count()], [1, 7]);
await act('clubMTab', { a: 'money' }); await p.waitForTimeout(200);
ok('Money: a meter and a payment row per person', [await p.locator('.clubmodal .pay').count(), await p.locator('.clubmodal [data-act="moneyAdd"]').count() > 10], [1, true]);
await act('clubMTab', { a: 'courses' }); await p.waitForTimeout(200);
await act('courseApprove', { a: 'g1', b: '1' }); await p.waitForTimeout(200);
ok('the commissioner approves the course', await p.evaluate(() => window.__T.club.course__g1.approved), true);
await act('clubMTab', { a: 'exports' }); await p.waitForTimeout(200);
await act('exportCsv', { a: 'headcount' }); await p.waitForTimeout(300);
ok('the headcount export names the golfer, the package and the money', await p.evaluate(() => window.__UI.lastCsv && window.__UI.lastCsv.text.split('\n')[1]), 'Norberto Diaz III,golfer,Tournament · men’s,in,7 nights · golfer,7,yes,,,,2089,400,1689');
await act('modalCancel'); await p.waitForTimeout(200);

console.log('\nthe closed book');
await act('archiveView', { a: '2026' }); await p.waitForTimeout(400);
const arc = await p.evaluate(() => ({ tabs: document.querySelectorAll('.tabbar .navbtn').length, screen: window.__UI.screen, bar: !!document.querySelector('.loadbar.closedbook'), sw: document.querySelector('.sswitch .ssw.on').textContent }));
ok('the Belek book under the switch: six tabs, Today, the closed banner', [arc.tabs, arc.screen, arc.bar, arc.sw], [6, 'today', true, 'Belek ’26 · archive']);
await act('go', { a: 'entry' }); await p.waitForTimeout(400);
ok('Score Entry in the closed book: the gate says closed, no save bar, no tile to tap', await p.evaluate(() => [document.querySelector('.gate .msg b').textContent, document.querySelectorAll('.savebar:not(.mine)').length, document.querySelectorAll('.ptile[data-act="padOpen"]').length]), ['This season is closed', 0, 0]);
await act('archiveView', { a: '' }); await p.waitForTimeout(300);
ok('back to the Clubhouse', [await tabs(), await p.evaluate(() => window.__UI.screen)], [['You', 'Season', 'Vegas HQ'], 'you']);

console.log('\nadding yourself, and who is on the app');
await act('whoOpen'); await p.waitForTimeout(300);
ok('the name window offers to add yourself, men’s or women’s', [await p.locator('.who-join').count(), await p.locator('.who-join [data-act="joinDiv"]').count(), await p.locator('#joinName').count()], [1, 2, 1]);
await p.fill('#joinName', 'Norberto'); await act('joinOpen'); await p.waitForTimeout(200);
ok('a roster name cannot be added twice', await p.evaluate(() => (window.__UI.joinErr || '').includes('on the list already')), true);
await p.fill('#joinName', 'Sam Rivera'); await act('joinDiv', { a: 'women' }); await p.waitForTimeout(150); await act('joinOpen'); await p.waitForTimeout(250);
ok('a new name asks for a PIN', await p.evaluate(() => window.__UI.modal && window.__UI.modal.kind === 'whopin' && window.__UI.modal.mode === 'join' && window.__UI.modal.division === 'women'), true);
await p.fill('#whoPinA', '4321'); await p.fill('#whoPinB', '4321'); await act('whoPinGo'); await p.waitForTimeout(600);
const joined = await p.evaluate(() => { const np = window.__T.config.people.find(x => x.name === 'Sam Rivera'); return np ? [np.role, np.division, window.__UI.who === np.id, !!window.__T.chat['id_' + np.id]] : null; });
ok('she is on the roster as a women’s golfer, this phone is her, her name has its PIN', joined, ['golfer', 'women', true, true]);
await act('go', { a: 'hq' }); await p.waitForTimeout(300);
ok('Vegas HQ knows which tournament she is in once she is in', await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'signStatus'; b.dataset.a = 'in'; document.getElementById('app').appendChild(b); b.click(); b.remove(); return new Promise(r => setTimeout(() => r([...document.querySelectorAll('[data-act="signDivision"].on')].map(x => x.dataset.a)), 300)); }), ['women']);
await act('signDivision', { a: 'men' }); await p.waitForTimeout(200);
ok('and she can change it', await p.evaluate(() => [window.__T.club['signup__' + window.__UI.who].division, [...document.querySelectorAll('.frow')].find(r => r.textContent.includes('Sam Rivera')).querySelector('.fn small').textContent]), ['men', 'men’s']);
await act('manageOpen'); await p.waitForTimeout(200); await act('onAppOpen'); await p.waitForTimeout(500);
const onapp = await p.evaluate(() => ({ rows: document.querySelectorAll('.ctbl.onapp tbody tr').length, on: document.querySelectorAll('.ctbl.onapp tr.onit').length, sam: [...document.querySelectorAll('.ctbl.onapp tbody tr')].find(r => r.textContent.includes('Sam Rivera')).textContent.replace(/\s+/g, ' ').trim() }));
ok('Who’s on the app lists the roster with roles, and marks who has chosen their name', [onapp.rows >= 24, onapp.on >= 1, /Player · men’s/.test(onapp.sam) && /Yes/.test(onapp.sam) && /added themselves/.test(onapp.sam)], [true, true, true]);
await act('modalCancel'); await p.waitForTimeout(200);
await p.evaluate(() => { window.__UI.who = 'g1'; window.__forceRender(); });

await p.screenshot({ path: S + '/club-you.png' });
await act('go', { a: 'hq' }); await p.waitForTimeout(300); await p.screenshot({ path: S + '/club-hq.png', fullPage: true });
await act('go', { a: 'season' }); await act('seasonTab', { a: 'stop' }); await p.waitForTimeout(300); await p.screenshot({ path: S + '/club-season.png' });
await act('clubEnter', { a: 'sweetheart' }); await p.waitForTimeout(300); await p.screenshot({ path: S + '/club-entry.png' });
ok('no errors in the book', errs, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAIL' : '\nall pass');
process.exit(fails.length ? 1 : 0);
