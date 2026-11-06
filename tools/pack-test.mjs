/* THE SOCIAL PACK. Manage → Social media pack, master only: one zip with
   every photograph and clip, the screens drawn as pictures, the manifest
   in the shape the social media plan specifies, the words and a posting
   plan. The book here is a seeded sandbox and the photo store a local
   server, so nothing reaches the real database.
   Run: node tools/pack-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const FIX = S + '/packfix';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* the zip writer on its own */
const PK = await import('../src/pack.js');
ok('the CRC is the standard one', PK.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
ok('names follow the spec: round, hole, who, time', PK.mediaName({ rid: 'r2', hole: 6, at: Date.UTC(2026, 10, 1, 13, 42), kind: 'photo', mime: 'image/jpeg' }, 'Matt'), 'R2_H07_matt_1642.jpg');
ok('a clip off the course', PK.mediaName({ rid: 'trip', at: Date.UTC(2026, 9, 29, 17, 5), kind: 'video', mime: 'video/quicktime' }, 'Devin'), 'TRIP_devin_2005.mov');

/* the book's pages and the photo store, served */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.css': 'text/css' };
mkdirSync(S + '/packsite', { recursive: true });
writeFileSync(S + '/packsite/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const server = createServer((req, res) => {
  let q = decodeURIComponent(req.url.split('?')[0]); if (q.endsWith('/')) q += 'index.html';
  const file = q.startsWith('/fix/') ? join(FIX, q.slice(5)) : join(S + '/packsite', q);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' }); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
await p.goto(BASE); await p.waitForTimeout(3000);

/* a week in the book: three cards a golfer, bands, squads, a few marks, bingo, the prizes, a recap, four photographs and a clip */
const DP = { raw: [6, 3, 6, 4, 6, 5, 6, 4, 6, 5, 3, 4, 4, 4, 3, 6, 3, 7], putts: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 2, 6: 3, 7: 1, 8: 2, 9: 1, 10: 1, 11: 2, 12: 2, 13: 2, 14: 2, 15: 3, 16: 1, 17: 3 }, marks: { 4: ['water'] }, by: {}, at: {}, pu: {}, mF: false, mB: false, bb: true };
const DW = { raw: [6, 5, 7, 4, 8, 6, 7, 5, 6, 6, 5, 6, 5, 7, 6, 5, 6, 8], putts: {}, marks: { 13: ['ob'], 17: ['ob'] }, by: {}, at: {}, pu: { 14: true }, mF: false, mB: false, bb: false };
await p.evaluate(([DP, DW, BASE]) => {
  const T = window.__T;
  const gs = T.config.people.filter(x => x.role === 'golfer');
  gs.forEach((g, i) => { g.band = [16, 30, 20, 25, 15, 20, 25, 20, 30, 16, 20][i] || 20; g.location = i % 2 ? 'UK' : 'USA'; });
  for (const rid of ['r1', 'r2', 'r3']) {
    T.config.rounds[rid].state = 'closed';
    gs.forEach((g, i) => { const base = i % 2 ? DW : DP; T.scores[rid + '__' + g.id] = { ...base, raw: base.raw.map((x, h) => Math.max(2, x + ((i * 7 + h + rid.length) % 3) - 1)), rev: 1 }; });
    T.config.rounds[rid].ctpHole = 7; T.config.rounds[rid].ctpWinner = gs[2].id; T.config.rounds[rid].ldHole = 15; T.config.rounds[rid].ldWinner = gs[0].id; T.config.rounds[rid].ldDist = '262 m';
    T.bbb[rid] = { holes: Array.from({ length: 18 }, (_, h) => ({ bingo: gs[h % 3].id, bango: gs[(h + 1) % 3].id, bongo: gs[(h + 2) % 3].id })) };
  }
  T.scores['r3__' + gs[0].id].raw[6] = 1;   // an ace on the par 3
  T.recaps.r3 = { status: 'published', at: Date.now(), body: { headline: 'The day the cup turned', narrative: ['Paragraph one of the final day.', 'Paragraph two, with the putt on 18.'], honours: [{ slot: 'shot_of_the_day', winner: gs[0].id, citation: 'The ace on seven.' }], pairNotes: {} } };
  T.recaps.week = { status: 'published', at: Date.now(), body: { headline: 'A week that went to the wire', narrative: ['The week, in a paragraph.', 'And another.'], honours: [{ slot: 'golfer_of_the_week', winner: gs[0].id, citation: 'Never missed a tee time.' }], swing: { value: '1', caption: 'ace' } } };
  T.recaps.report = { status: 'published', at: Date.now(), body: { summary: ['The State of the Union, paragraph one.'], players: { [gs[0].id]: { read: 'A tidy golfer.', letter: ['Dear golfer, a letter.'], three: ['Lay up', 'Lag putt', 'Breathe'] } } } };
  const at = Date.UTC(2026, 9, 31, 7, 12);
  T.photos = {
    p1: { id: 'p1', rid: 'r2', hole: 6, url: BASE + 'fix/a.jpg', thumb: BASE + 'fix/a.jpg', at, byName: gs[2].display, kind: 'photo', mime: 'image/jpeg', bytes: 11469, hv_x: true, hv_y: true },
    p2: { id: 'p2', rid: 'r2', hole: 6, url: BASE + 'fix/b.jpg', at: at + 60000, byName: gs[2].display, kind: 'photo', mime: 'image/jpeg', bytes: 10323 },
    p3: { id: 'p3', rid: 'trip', hole: null, url: BASE + 'fix/c.jpg', at: Date.UTC(2026, 9, 29, 16, 5), byName: 'Drea', day: '2026-10-29', kind: 'photo', mime: 'image/jpeg', bytes: 10496 },
    p4: { id: 'p4', rid: 'r3', hole: 17, url: BASE + 'fix/clip.mp4', thumb: BASE + 'fix/a.jpg', at: Date.UTC(2026, 10, 1, 13, 40), byName: gs[0].display, kind: 'video', mime: 'video/mp4', bytes: 3985 },
    p5: { id: 'p5', rid: 'r1', hole: 2, url: BASE + 'fix/missing.jpg', at: Date.UTC(2026, 9, 30, 11, 0), byName: 'Someone', kind: 'photo', mime: 'image/jpeg', bytes: 100 },
  };
  window.__forceRender();
}, [DP, DW, BASE]);
await p.waitForTimeout(300);

console.log('\nin Manage');
await act('manageOpen'); await p.waitForTimeout(300);
ok('the gold card sits above the list, with the count', [await p.locator('.mg-social').count(), /4 photos · 1 clips? · \d+ screens/.test(await p.locator('.mg-social').innerText())], [1, true]);
await p.locator('.mg-social').click(); await p.waitForTimeout(300);
ok('the window: the week and the rounds, the four choices', [await p.locator('.pkmodal').count(), await p.locator('.pk-scopes .chip').count(), await p.locator('.pk-opt.on').count()], [1, 4, 3]);
await p.locator('.pk-opt[data-a="hearted"]').click(); await p.waitForTimeout(200);
ok('hearts only narrows it to the hearted photo', await p.locator('.pk-opt[data-a="photos"] small').innerText(), '1');
await p.locator('.pk-opt[data-a="hearted"]').click(); await p.waitForTimeout(200);
console.log('\nbuilt');
await p.locator('[data-act="packBuild"]').click();
await p.waitForFunction(() => window.__UI.pack && !window.__UI.pack.busy, null, { timeout: 240000 });
const st = await p.evaluate(() => ({ err: window.__UI.pack.err, name: window.__UI.pack.out && window.__UI.pack.out.name, size: window.__UI.pack.out && window.__UI.pack.out.blob.size, failed: window.__UI.pack.out && window.__UI.pack.out.failed, done: !!document.querySelector('[data-act="packSave"]') }));
ok('it builds, names the file for the edition, and says the one missing photo could not be fetched', [st.err, /^union-invitational-\d{4}-\d\d-\d\d_edition\.zip$/.test(st.name || ''), st.failed, st.done], ['', true, 1, true]);
const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-act="packSave"]').click()]);
const zipPath = S + '/pack-out.zip'; await dl.saveAs(zipPath);
ok('Save hands the browser the zip', [dl.suggestedFilename() === st.name, statSync(zipPath).size === st.size], [true, true]);
ok('no errors in the book', errs, []);
await b.close(); server.close();

console.log('\ninside the zip');
const py = execFileSync('python3', ['-I', '-c', `
import zipfile, json, sys, struct
sys.path.insert(0, '${S}/pylib')
from PIL import Image, ImageStat
import io
z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip(); names = z.namelist()
M = json.loads(z.read('manifest.json'))
pngs = [n for n in names if n.startswith('screenshots/')]
flat = {}
for n in pngs:
    im = Image.open(io.BytesIO(z.read(n))).convert('L'); st = ImageStat.Stat(im); flat[n] = [im.size[0], im.size[1], round(st.stddev[0], 1)]
out = { 'bad': bad, 'top': sorted(n for n in names if '/' not in n), 'media': sorted(n for n in names if n.startswith('media/')), 'screens': len(pngs),
  'widths': sorted(set(v[0] for v in flat.values())), 'blank': [n for n, v in flat.items() if v[2] < 8], 'tall': max(v[1] for v in flat.values()),
  'sized': [n for n in names if n.startswith('sized/')][:3], 'nsized': len([n for n in names if n.startswith('sized/')]),
  'scope': M['export']['scope'], 'players': len(M['players']), 'golfers': len([p for p in M['players'] if p['role'] == 'golfer']), 'consent': M['players'][0]['consent'], 'handles': M['players'][0]['handles'],
  'comps': [c['id'] for c in M['competitions']], 'pairs_top': M['competitions'][0]['standings'][0]['value_label'], 'mvp_top': M['competitions'][1]['standings'][0]['value_label'],
  'hl': sorted(set(h['type'] for h in M['highlights'])), 'ace': [h['note'] for h in M['highlights'] if h['type'] == 'hole_in_one'],
  'media_rows': [[m['file'], m['type'], m['round'], m['hole'], m['starred'], m['hearts'], m['orientation'], m['duration_s']] for m in M['media']],
  'shots': [[s['file'], s['screen'], s['competition_id'], s['round']] for s in M['screenshots']][:8], 'nshots': len(M['screenshots']),
  'readme': ['consent' in z.read('README.md').decode().lower(), '#UnionInvitational' in z.read('README.md').decode(), 'Commissioner' in z.read('README.md').decode()],
  'recap': ['The day the cup turned' in z.read('recap.md').decode(), 'The State of the Union' in z.read('recap.md').decode(), 'Golfer of the week' in z.read('recap.md').decode()],
  'plan': ['## 6 · Vegas 2027' in z.read('posting-plan.md').decode(), 'R2_H07' in z.read('posting-plan.md').decode()],
  'sizes_ok': all(Image.open(io.BytesIO(z.read(n))).size in [(1080, 1350), (1080, 1920)] for n in names if n.startswith('sized/')),
  'photo_ok': z.read('media/R2_H07_matt_1012.jpg') == open('${FIX}/a.jpg', 'rb').read() }
print(json.dumps(out))
`, zipPath], { encoding: 'utf8' });
const Z = JSON.parse(py);
ok('a sound zip, with the four files at the top', [Z.bad, Z.top], [null, ['README.md', 'manifest.json', 'posting-plan.md', 'recap.md']]);
ok('the media, named by round, hole, who and time; the missing one left out', Z.media, ['media/R2_H07_matt_1012.jpg', 'media/R2_H07_matt_1013.jpg', 'media/R3_H18_norberto_1640.mp4', 'media/TRIP_drea_1905.jpg']);
ok('the first photograph is the file itself, byte for byte', Z.photo_ok, true);
ok('the manifest knows each, in the order they were taken: type, round, hole, hearts, orientation, the clip\'s length', Z.media_rows, [['media/TRIP_drea_1905.jpg', 'photo', null, null, false, 0, 'square', null], ['media/R2_H07_matt_1012.jpg', 'photo', 'r2', 7, true, 2, 'landscape', null], ['media/R2_H07_matt_1013.jpg', 'photo', 'r2', 7, false, 0, 'portrait', null], ['media/R3_H18_norberto_1640.mp4', 'video', 'r3', 18, false, 0, 'portrait', 1.2]]);
ok('the screens: 1080 wide, none blank, none taller than a canvas allows', [Z.widths, Z.blank, Z.tall <= 15000], [[1080], [], true]);
ok('every board, the honours, the report and a page a golfer, a card a golfer a round and a team card a pair a round', [Z.nshots, Z.shots], [6 + 1 + 1 + 11 + 3 * (11 + 5), [['screenshots/WEEK_leaderboard_' + Z.shots[0][0].slice(-8, -4) + '.png', 'leaderboard', null, null], ['screenshots/WEEK_competition-pairs_' + Z.shots[0][0].slice(-8, -4) + '.png', 'competition', 'pairs', null], ['screenshots/WEEK_competition-mvp_' + Z.shots[0][0].slice(-8, -4) + '.png', 'competition', 'mvp', null], ['screenshots/WEEK_competition-ryder_' + Z.shots[0][0].slice(-8, -4) + '.png', 'competition', 'ryder_cup', null], ['screenshots/WEEK_competition-bbb_' + Z.shots[0][0].slice(-8, -4) + '.png', 'competition', 'bbb', null], ['screenshots/WEEK_competition-prizes_' + Z.shots[0][0].slice(-8, -4) + '.png', 'competition', 'prizes', null], ['screenshots/WEEK_honours_' + Z.shots[0][0].slice(-8, -4) + '.png', 'honours', null, null], ['screenshots/WEEK_report-union_' + Z.shots[0][0].slice(-8, -4) + '.png', 'report', null, null]]]);
ok('the sized copies are feed and story sizes, for the screens that fit', [Z.nsized > 0, Z.sizes_ok], [true, true]);
ok('the manifest: the edition, every golfer and official, consent and handles left open', [Z.scope, Z.players, Z.golfers, Z.consent, Z.handles], ['edition', 14, 11, { face: null, name: null, tag: null }, { instagram: null, x: null, tiktok: null, youtube: null }]);
ok('the competitions, with display-ready labels', [Z.comps.slice(0, 4), /pts$/.test(Z.pairs_top), /net$/.test(Z.mvp_top)], [['pairs', 'mvp', 'ryder_cup', 'bbb'], true, true]);
ok('the highlights read off the cards: the ace among them', [Z.hl.includes('hole_in_one'), Z.hl.includes('ctp_set'), Z.hl.includes('long_drive_set'), Z.hl.includes('ryder_point'), Z.ace.length], [true, true, true, true, 1]);
ok('the README carries the rules, the recap the words, the plan the six beats and the files', [Z.readme, Z.recap, Z.plan], [[true, true, true], [true, true, true], [true, true]]);
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
