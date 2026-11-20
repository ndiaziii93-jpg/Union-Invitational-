/* THE BOOK AT NIGHT, MEASURED.
 *
 * Night is done with tokens: every colour the book uses is a variable, and
 * the night block swaps them. That works until somebody writes a colour
 * down. A cream panel painted #F7F2E6 stays cream when the page turns pine
 * — and the ink on it, which IS a token, turns cream too. Cream on cream.
 * The coach's three things went out like that, unreadable on a phone at
 * night, and nothing in the stylesheet said a word about it.
 *
 * So this does not read the stylesheet. It opens the book at night, walks
 * every screen and every window, and measures the contrast of every line of
 * text actually on the glass against the thing actually behind it. WCAG AA
 * is 4.5 for body text and 3.0 for large; anything under is reported with
 * the colours, so the fix is obvious from the output.
 *
 * Run: node tools/night-test.mjs [--day] [--all]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const DAY = process.argv.includes('--day');
const ALL = process.argv.includes('--all');
mkdirSync(S + '/night', { recursive: true });
writeFileSync(S + '/night/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/night/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---- the measurement, run inside the page ---- */
const PROBE = `(() => {
  const px = v => { const m = String(v).match(/[\\d.]+/); return m ? +m[0] : 16; };
  const rgb = v => { const m = String(v).match(/[\\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
  const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const over = (fg, bg) => { const a = fg[3] == null ? 1 : fg[3];
    return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
  /* text sits ON its own element's background, not behind it */
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  /* WHAT IS REALLY BEHIND THIS TEXT.
     The first cut of this walked up until it met a background that was all
     but opaque and called anything thinner invisible — which reported the
     dock on the hole as cream text on a blue sky, when in life it is cream
     on a dark bar at nine-tenths over a blue sky, and perfectly readable.
     A translucent layer is not nothing: every layer from the page up is
     collected and then composited in order, the way the screen does it. */
  function behind(el) {
    const layers = []; let n = el, guard = 0, img = false, from = null;
    while (n && guard++ < 40) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') img = true;
      const c = rgb(cs.backgroundColor);
      const a = c ? (c[3] == null ? 1 : c[3]) : 0;
      /* the element's own background sits behind its own text */
      if (c && a > 0.004) { layers.push(c); if (!from) from = n; }
      if (a >= 0.999) break;
      n = n.parentElement;
    }
    let out = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return { c: out, img: img || underPicture(el), from };
  }
  /* A COVER PHOTO IS NOT AN ANCESTOR. The book paints its covers with a
     positioned span filling the panel, a SIBLING of the words on it — so
     walking up the tree finds the page colour and reports the masthead as
     cream on cream when it is in fact cream on a photograph. Anything
     positioned, carrying a picture, and covering these words counts. */
  function underPicture(el) {
    const r = el.getBoundingClientRect();
    let n = el.parentElement, guard = 0;
    while (n && guard++ < 10) {
      for (const k of n.children) {
        if (k === el || k.contains(el)) continue;
        const ks = getComputedStyle(k);
        const hasPic = (ks.backgroundImage && ks.backgroundImage !== 'none') || k.tagName === 'IMG' || k.tagName === 'CANVAS';
        if (!hasPic || ks.position === 'static') continue;
        const kr = k.getBoundingClientRect();
        if (kr.left <= r.left + 1 && kr.top <= r.top + 1 && kr.right >= r.right - 1 && kr.bottom >= r.bottom - 1) return true;
      }
      n = n.parentElement;
    }
    return false;
  }
  const sig = el => el.tagName.toLowerCase() +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const out = [];
  const seen = new Set();
  let measured = 0;
  for (const el of document.querySelectorAll('body *')) {
    /* only elements that themselves hold words */
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own.length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (+cs.opacity < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const fg = rgb(cs.color); if (!fg) continue;
    measured++;
    const bk = behind(el);
    const ink = over(fg, bk.c);
    const cr = ratio(ink, bk.c);
    const size = px(cs.fontSize), weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (cr >= need) continue;
    const key = sig(el) + '|' + cs.color + '|' + bk.c.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sig: sig(el), text: own.map(n => n.textContent.trim()).join(' ').slice(0, 46),
      ink: 'rgb(' + ink.map(Math.round).join(',') + ')', bg: 'rgb(' + bk.c.map(Math.round).join(',') + ')',
      behind: bk.from ? sig(bk.from) : '(page)', img: bk.img,
      size: Math.round(size), ratio: +cr.toFixed(2), need });
  }
  out.measured = measured;
  return { rows: out, measured };
})()`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
await p.goto(BASE); await p.waitForTimeout(2500);

/* a book with something on every screen */
await p.evaluate(([from, to]) => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: 'Eighteen at home.' }],
    packages: [{ id: '7g', name: '7 nights · golfer', nights: 7, golf: true, price: 2200, inc: ['Room', 'Golf'] }],
    rooms: [], vendors: [], deadlines: {} };
  const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
  T.club.course__g1 = { ...C.courseFrom(hit, 'g1'), approved: true };
  T.club.signup__g1 = { pid: 'g1', status: 'in', pkg: '7g', shirt: 'XL', golf: 'some', rounds: ['r1', 'r2'] };
  const card = C.blankClubCard('frostbite', 'g1', 12, T.club.course__g1, '2027-01-01');
  T.club[C.cardKey('frostbite', 'g1')] = { ...card, raw: [5, 4, 6, 4, 3, 5, 4, null, null, null, null, null, null, null, null, null, null, null], at: Date.now() };
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null;
  if (false) { UI.mode = 'night'; document.documentElement.classList.add('night'); }
  window.__forceRender();
}, [iso(-3), iso(10)]).catch(() => {});
await p.evaluate(d => { const UI = window.__UI; if (!d) { UI.mode = 'night'; document.documentElement.classList.add('night'); } else { UI.mode = 'day'; document.documentElement.classList.remove('night'); } window.__forceRender(); }, DAY);
await p.waitForTimeout(700);

const go = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);

/* every room in the book that can be opened from here */
const STOPS = [
  ['You',              async () => go('go', { a: 'you' })],
  ['You · my trip',    async () => go('go', { a: 'me' })],
  ['You · joining open', async () => { await go('go', { a: 'me' }); await go('meOpen', { a: 'join' }); }],
  ['You · package open', async () => { await go('go', { a: 'me' }); await go('meOpen', { a: 'pkg' }); }],
  ['Season',           async () => go('go', { a: 'season' })],
  ['Vegas HQ',         async () => go('go', { a: 'hq' })],
  ['Score entry',      async () => { await go('go', { a: 'season' }); await go('clubEnter', { a: 'frostbite' }); }],
  ['The hole',         async () => { await go('go', { a: 'season' }); await go('clubEnter', { a: 'frostbite' }); await go('holeArt', { a: '0', b: 'home__g1' }); }],
  ['My report card',   async () => go('reportPlayer', { a: 'g1' })],
  ['My manual',        async () => go('manualOpen', { a: 'g1' })],
  ['The Belek book',   async () => go('archiveView', { a: '2026' })],
  ['Feedback',         async () => go('fbOpen', {})],
  ['Who am I',         async () => go('whoOpen', {})],
];

const all = [], thin = [];
for (const [name, open] of STOPS) {
  await p.evaluate(() => { window.__UI.modal = null; window.__UI.archive = null; window.__forceRender(); }).catch(() => {});
  await p.waitForTimeout(260);
  try { await open(); } catch (e) { console.log('  (could not open ' + name + ')'); continue; }
  await p.waitForTimeout(950);
  const { rows, measured } = await p.evaluate(PROBE);
  rows.forEach(r => all.push({ ...r, where: name }));
  const bad = rows.filter(r => !r.img);
  /* A ROOM THAT DID NOT OPEN IS NOT A CLEAN ROOM. Without this the report
     card came back "clean" because the probe never got into it. */
  const note = measured < 12 ? '  \u2190 only ' + measured + ' lines seen: did it open?' : '';
  console.log((bad.length ? '  ' + String(bad.length).padStart(3) + ' unreadable' : '    clean     ')
    + '  ' + name.padEnd(22) + String(measured).padStart(4) + ' lines' + note);
  if (measured < 12) thin.push(name);
  if (bad.length) await p.screenshot({ path: S + '/night/' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png', fullPage: true });
}

/* a background picture is a judgement call, not a measurement */
const hard = all.filter(r => !r.img);
const soft = all.filter(r => r.img);
const by = new Map();
for (const r of hard) { const k = r.sig + ' on ' + r.behind;
  if (!by.has(k) || by.get(k).ratio > r.ratio) by.set(k, r); }
const list = [...by.values()].sort((a, b) => a.ratio - b.ratio);

console.log('\n' + (DAY ? 'DAY' : 'NIGHT') + ': ' + list.length + ' unreadable places'
  + (soft.length ? ', and ' + soft.length + ' over a picture (judge by eye)' : ''));
for (const r of list) {
  console.log('  ' + String(r.ratio).padStart(5) + ':1  needs ' + r.need + '  ' + r.sig
    + '\n            ' + r.ink + ' on ' + r.bg + ' (' + r.behind + ')  ' + r.where
    + '\n            “' + r.text + '”');
}
if (thin.length) console.log('\nNOT ACTUALLY LOOKED AT: ' + thin.join(', ') + '  \u2014 fix the fixture before trusting a pass here');
if (errs.length) console.log('\nPAGE ERRORS: ' + JSON.stringify(errs.slice(0, 6)));
writeFileSync(S + '/night/report.json', JSON.stringify({ hard: list, soft }, null, 1));
await ctx.close(); await b.close(); srv.close();
process.exit(list.length ? 1 : 0);
