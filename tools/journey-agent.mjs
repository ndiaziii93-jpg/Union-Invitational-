/* THE JOURNEY AGENT.
 *
 * A person does not read the code; they tap things and find out. So this
 * taps things. It walks the book breadth-first — every screen, every window,
 * every control it can see — and for each tap it asks the questions a person
 * would ask without knowing they were asking them:
 *
 *   Did anything happen?        a control that answers nothing is a lie
 *   How long did it take?       a tap that takes half a second feels broken
 *   Could I hit it?             44 points is the smallest honest target
 *   Could I get back out?       a window with no door is a trap
 *   Did it say what it was?     a control with no name is invisible to a
 *                               screen reader and to a search of the book
 *   Did anything catch fire?    an error on a path nobody tests is an error
 *                               everybody eventually finds
 *
 * Every tap is taken with the book snapshotted and put back afterwards, so
 * the crawl cannot destroy the thing it is walking through: it may press
 * Reset, Freeze and Delete as freely as Next, and often does.
 *
 * Run: node tools/journey-agent.mjs [--night] [--budget 400] [--wide]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const NIGHT = process.argv.includes('--night');
const WIDE = process.argv.includes('--wide');
const WEEK = process.argv.includes('--week');   // the book as the tournament, not the Clubhouse
const BUDGET = +arg('--budget', 400);
const SLOW = 400;          // ms from tap to a settled screen
const TAP = 44;            // points, the smallest target a thumb finds
mkdirSync(S + '/journey', { recursive: true });

writeFileSync(S + '/journey/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/journey/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const iso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 } }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
let errs = [];
p.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 160)));
await p.goto(BASE); await p.waitForTimeout(2500);

/* ---- a book with something on every screen ---- */
await p.evaluate(([from, to, night, week]) => {
  const T = window.__T, UI = window.__UI, C = window.__C;
  T.club.season = { phase: 'club', frozen: false, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
    window: { from: '2027-11-13', to: '2027-11-21' },
    stops: [{ id: 'frostbite', name: 'The Frostbite Open', from, to, format: 'stableford', note: 'Eighteen at home.' },
            { id: 'santa', name: 'The Santa Swing', from: '2027-12-01', to: '2027-12-20', format: 'stableford', note: '' }],
    packages: [{ id: '7g', name: '7 nights · golfer', nights: 7, golf: true, price: 2200, inc: ['Room', 'Golf'] },
               { id: '5n', name: '5 nights · not golfing', nights: 5, golf: false, price: 1400, inc: ['Room'] }],
    rooms: [], vendors: [], deadlines: { deposit: '2027-03-31', balance: '2027-08-03' } };
  const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
  T.club.course__g1 = { ...C.courseFrom(hit, 'g1'), approved: true };
  T.club.signup__g1 = { pid: 'g1', status: 'in', pkg: '7g', shirt: 'XL', initials: 'ND', golf: 'some', rounds: ['r1', 'r2'] };
  T.club.travel__g1 = { pid: 'g1', out: { flight: 'BA275', lands: '15:40', date: '2027-11-13' }, back: {} };
  const card = C.blankClubCard('frostbite', 'g1', 12, T.club.course__g1, '2027-01-01');
  T.club[C.cardKey('frostbite', 'g1')] = { ...card, raw: [5, 4, 6, 4, 3, 5, 4, null, null, null, null, null, null, null, null, null, null, null], at: Date.now() };
  if (week) T.club.season.phase = 'week';
  UI.who = 'g1'; UI.me = 'g1'; UI.modal = null;
  if (night) { UI.mode = 'night'; document.documentElement.classList.add('night'); }
  window.__forceRender();
}, [iso(-3), iso(10), NIGHT, WEEK]);
await p.waitForTimeout(800);

/* ---- the book, saved and put back around every tap ---- */
await p.evaluate(() => {
  window.__snap = () => JSON.stringify({ T: window.__T, UI: window.__UI });
  window.__back = s => { const o = JSON.parse(s);
    for (const k of Object.keys(window.__T)) delete window.__T[k];
    Object.assign(window.__T, o.T);
    for (const k of Object.keys(window.__UI)) delete window.__UI[k];
    Object.assign(window.__UI, o.UI);
    window.__forceRender(); };
  /* where we are, as a person would describe it */
  window.__where = () => { const U = window.__UI;
    return (U.archive ? 'archive:' + U.archive + '/' : '') + (U.screen || '?')
      + (U.modal ? ' » ' + (U.modal.kind || 'window') : '')
      + (U.clubMTab ? ' [' + U.clubMTab + ']' : '') + (U.boardTab ? ' [' + U.boardTab + ']' : ''); };
  /* every control a person can see and reach right now */
  window.__controls = () => {
    const out = [];
    for (const el of document.querySelectorAll('[data-act]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .05) continue;
      if (el.disabled) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') continue;   // typing is another test's job
      const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
      const chosen = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true'
        || el.getAttribute('aria-current') === 'page' || /(^| )on( |$)/.test(el.className || '');
      out.push({ act: el.dataset.act, a: el.dataset.a || '', b: el.dataset.b || '', chosen,
        name: name.slice(0, 48), w: Math.round(r.width), h: Math.round(r.height),
        tag, cls: (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0] || '' });
    }
    return out;
  };
  window.__fire = (act, a, bb) => {
    const sel = '[data-act="' + act + '"]' + (a ? '[data-a="' + CSS.escape(a) + '"]' : '') + (bb ? '[data-b="' + CSS.escape(bb) + '"]' : '');
    const el = [...document.querySelectorAll(sel)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) return false;
    el.click(); return true;
  };
  /* how long until the screen stops moving */
  /* A CHANGE IS NOT A CHANGE IN LENGTH. The first cut compared how LONG
     the screen's markup was, which cannot see the one thing half these
     controls do: move a class from one chip to its neighbour. Picking a
     different club came back as a dead control because "Dr" and "3w" are
     the same width in characters. It is a hash now. */
  window.__dom = () => { const h = document.getElementById('app').innerHTML
      + (document.querySelector('.scrim') ? document.querySelector('.scrim').innerHTML : '');
    let x = 5381; for (let i = 0; i < h.length; i++) { x = ((x << 5) + x + h.charCodeAt(i)) | 0; }
    return x; };
  window.__settle = () => new Promise(res => {
    const t0 = performance.now(); let last = '', same = 0;
    const tick = () => { const now = document.getElementById('app').innerHTML.length + ':' + (document.querySelector('.scrim') ? 1 : 0);
      if (now === last) same++; else { same = 0; last = now; }
      if (same >= 3 || performance.now() - t0 > 2500) return res(Math.round(performance.now() - t0));
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
});

/* ---- the crawl ---- */
const seen = new Set();
const queue = [];
const findings = { dead: [], inert: [], slow: [], small: [], unnamed: [], trap: [], error: [], dupe: [] };
let taps = 0, states = 0;

const where = () => p.evaluate(() => window.__where());
const snap = () => p.evaluate(() => window.__snap());
const back = s => p.evaluate(x => window.__back(x), s);

/* a place is worth exploring once */
const atStart = await snap();
queue.push({ path: [], label: 'start' });

while (queue.length && taps < BUDGET) {
  const job = queue.shift();
  /* walk back to this place from the beginning: the only way to be sure
     the place is the place, with no residue from the last experiment */
  await back(atStart);
  await p.waitForTimeout(120);
  for (const step of job.path) { await p.evaluate(s => window.__fire(s.act, s.a, s.b), step); await p.waitForTimeout(170); }
  await p.waitForTimeout(150);
  const here = await where();
  if (seen.has(here)) continue;
  seen.add(here); states++;

  const controls = await p.evaluate(() => window.__controls());
  /* two controls that say the same thing in the same place is a coin toss */
  const byName = new Map();
  for (const c of controls) { const k = c.act + '|' + c.a + '|' + c.b;
    byName.set(k, (byName.get(k) || 0) + 1); }
  for (const [k, n] of byName) if (n > 2) findings.dupe.push({ where: here, what: k, n });

  /* a window has to have a door */
  if (here.includes('»')) {
    const out = controls.some(c => /modalCancel|modalScrim|modalClose|close|back|Done|done/i.test(c.act + ' ' + c.name));
    if (!out) findings.trap.push({ where: here, controls: controls.length });
  }

  for (const c of controls) {
    if (taps >= BUDGET) break;
    if (!c.name) findings.unnamed.push({ where: here, act: c.act, cls: c.cls, w: c.w, h: c.h });
    if (Math.min(c.w, c.h) < TAP && c.tag === 'button')
      findings.small.push({ where: here, act: c.act, name: c.name, size: c.w + 'x' + c.h, cls: c.cls });

    const before = await snap();
    const dom0 = await p.evaluate(() => window.__dom());
    errs = [];
    const fired = await p.evaluate(s => window.__fire(s.act, s.a, s.b), c);
    if (!fired) { await back(before); continue; }
    taps++;
    const ms = await p.evaluate(() => window.__settle());
    const after = await where();
    const dom1 = await p.evaluate(() => window.__dom());
    const moved = after !== here || dom1 !== dom0;

    if (errs.length) findings.error.push({ where: here, act: c.act, name: c.name, err: errs[0] });
    /* AN OPTION ALREADY CHOSEN IS ALLOWED TO DO NOTHING. Tapping the tab
       you are on, or the package you already bought, is not a dead control
       \u2014 lumping those in buries the taps that really do answer nothing. */
    if (!moved) (c.chosen ? findings.inert : findings.dead).push({ where: here, act: c.act, a: c.a, name: c.name, cls: c.cls });
    if (ms > SLOW) findings.slow.push({ where: here, act: c.act, name: c.name, ms });
    if (moved && after !== here && !seen.has(after) && job.path.length < 3)
      queue.push({ path: job.path.concat([{ act: c.act, a: c.a, b: c.b }]), label: after });

    await back(before);
    await p.waitForTimeout(60);
  }
  process.stdout.write('\r  ' + states + ' places, ' + taps + ' taps, ' + queue.length + ' to go   ');
}
console.log('\n');

/* ---- what it found ---- */
const uniq = (list, key) => { const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, { ...x, n: 0 }); m.get(k).n++; } return [...m.values()]; };
const R = {
  'ERRORS on a path a person can walk': uniq(findings.error, x => x.act + x.err),
  'TRAPS — a window with no door': uniq(findings.trap, x => x.where),
  'DEAD TAPS — the control answered nothing': uniq(findings.dead, x => x.act + '|' + x.cls),
  ['SLOW — over ' + SLOW + 'ms from tap to a still screen']: uniq(findings.slow, x => x.act).sort((a, c) => c.ms - a.ms),
  ['SMALL — under ' + TAP + ' points for a thumb']: uniq(findings.small, x => x.act + '|' + x.cls + '|' + x.size),
  'UNNAMED — nothing for a screen reader to say': uniq(findings.unnamed, x => x.act + '|' + x.cls),
  'AMBIGUOUS — the same control three times over': uniq(findings.dupe, x => x.what),
  'NO ANSWER WHEN ALREADY CHOSEN — correct, but silent': uniq(findings.inert, x => x.act + '|' + x.cls),
};
console.log('=== ' + states + ' places walked, ' + taps + ' taps, ' + (NIGHT ? 'night' : 'day') + ', '
  + (WIDE ? 'laptop' : 'phone') + ', ' + (WEEK ? 'the week' : 'the Clubhouse') + ' ===\n');
let total = 0;
for (const [head, list] of Object.entries(R)) {
  if (!list.length) { console.log('  none  ' + head); continue; }
  total += list.length;
  console.log('\n' + head + '  (' + list.length + ')');
  for (const x of list.slice(0, 14)) {
    const bits = [x.act && ('act=' + x.act), x.name && ('“' + x.name + '”'), x.size, x.ms && (x.ms + 'ms'),
      x.cls && ('.' + x.cls), x.err, x.what, x.n > 1 ? '×' + x.n : ''].filter(Boolean);
    console.log('   • ' + bits.join('  ') + (x.where ? '\n       at ' + x.where : ''));
  }
  if (list.length > 14) console.log('   … and ' + (list.length - 14) + ' more');
}
writeFileSync(S + '/journey/report.json', JSON.stringify({ states: [...seen], findings }, null, 1));
console.log('\nplaces reached: ' + [...seen].join(' | '));
console.log('full log: ' + S + '/journey/report.json');
await ctx.close(); await b.close(); srv.close();
process.exit(0);
