/* LAYOUT. Nothing that should sit on one line breaks onto two: the role
   tags (⛳ PLAYER, 🏟️ BLEACHERS), names beside them, times, chips, pills,
   tabs and buttons; and no screen scrolls sideways. Every screen, with long
   names, a bleacher guest, bets and a shuttle, at 320, 375 and 390 wide and
   on an iPad. A check counts the lines the text is actually drawn on.
   Run: node tools/layout-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/audit.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const found = new Map();
const seed = () => {
  const T = window.__T, now = Date.now(), m = n => now - n * 60000;
  T.config.rounds.r1.state = 'open';
  const C = T.chat;
  C.guest_xbob = { id: 'guest_xbob', k: 'g', pid: 'xbob', name: 'Uncle Bartholomew', at: m(300), dev: 'dbob' };
  const say = (id, pid, name, text, ago, rid = 'r1') => { C[id] = { id, k: 'm', rid, pid, name, text, at: m(ago), dev: 'd' + id, re: null }; };
  say('m1', 'g1', 'Norberto III', 'Gotta be honest team Norberto is looking pretty good right now', 3000);
  say('m2', 'g2', 'Norberto Jr.', 'Ray V & Drea FTW! Bet on it now or lose beers', 70);
  say('m3', 'xbob', 'Uncle Bartholomew', 'Watching from Leeds', 40);
  say('m4', 's2', 'Aimee K', 'Pool bar is open', 20);
  say('m5', 'o1', 'Justin P', 'Scores are in', 5, 'trip');
  const M = T.market, tr = (id, mk, pid, side, n, cost, px) => { M[id] = { id, k: 't', m: mk, pid, side, n, cost, px, at: m(30), dev: 'd' + id }; };
  tr('t1', 's_cup', 'g1', 'yes', 4, 2, 50); tr('t2', 's_mvp_g6', 'xbob', 'yes', 6, 1.5, 25); tr('t3', 's_mvp_g2', 's2', 'yes', 3, 1, 25); tr('t4', 's_r1_water_g6', 'o1', 'yes', 3, 1, 25);
  M.qx = { id: 'qx', k: 'q', q: 'Will Norberto Jr. wear the pink trousers on Sunday?', rules: '', cat: 'trip', p0: 30, tags: ['g2', 'xbob'], pid: 'xbob', byName: 'Uncle Bartholomew', dev: 'dbob', at: m(100), result: null };
  T.config.travel = { text: '', shuttles: [{ id: 'sh1', dir: 'arrive', dayIdx: 3, pickup: null, meet: 'Meeting point to come · Baby seat booked', riders: [
    { pid: 'g9', name: 'Duncan W', flight: 'BA2795', time: '17:50' }, { pid: 'g1', name: 'Norberto III', flight: 'XQ525', time: '18:35' }, { pid: null, name: 'Bertie (infant)', flight: 'XQ525', time: '18:35' }, { pid: 'g2', name: 'Norberto Jr.', flight: 'XQ525', time: '18:35' }] }] };
  localStorage.setItem('union-invitational:whoami', 'g1'); localStorage.setItem('union-invitational:shuttleOpen', '1'); window.__UI.who = undefined;
};
const check = (where) => {
  const out = [], W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) {
    const wide = [...document.querySelectorAll('#app *')].filter(e => e.getBoundingClientRect().right > W + 1 && getComputedStyle(e).position !== 'fixed').slice(-3).map(e => e.className || e.tagName);
    out.push(['SIDEWAYS', where, document.documentElement.scrollWidth + ' > ' + W + ' ' + wide.join(' | ')]); }
  const sel = '.gtag,.xm-tag,.xm-res,.sh-fh em,.sh-fn i,.sh-av,.xm-tabs button b,.xm-tabs button small,.ch-rooms button,.btab,.navbtn,.xm-cats button,.xm-about button,.xm-bal,.btn,.mg-ct,.who-c button,.xm-ppl button,.ch-at button,.xm-yn button,.xm-mo button,.xm-mo em,.sh-tm b,.sh-rt b,.sh-rt small,.xm-ch strong,.ch-n small,.ch-who,.xm-new,.xm-back,.xm-backfab,.sh-foot,.xm-st em,.xm-plate .k,.pill,.xm-more,.ch-hb,.ch-rx button,.xm-seg button,.xm-q button';
  const seen = new Set(document.querySelectorAll(sel));
  for (const el of document.querySelectorAll('body *')) { const r = parseFloat(getComputedStyle(el).borderTopLeftRadius); if (r >= 30 && el.innerText && el.innerText.trim().length < 40 && el.offsetHeight < 80) seen.add(el); }
  for (const el of seen) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    const cs = getComputedStyle(el), txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    /* lines of text actually drawn: the distinct tops of the text's own boxes */
    const rg = document.createRange(); rg.selectNodeContents(el);
    const tops = [];
    const texts = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) texts.push(tw.currentNode);
    const rects = texts.flatMap(t => { const r2 = document.createRange(); r2.selectNodeContents(t); return [...r2.getClientRects()]; });
    for (const q of rects) { if (q.width < 2 || q.height < 4) continue; if (!tops.some(t => Math.abs(t - q.top) < q.height * 0.6)) tops.push(q.top); }
    const multi = tops.length > 1;
    const designed = el.matches('.xm-tabs button,.ch-rooms button,.navbtn,.sh-foot,.xm-yn button,.sh-tm,.xm-ch,.btab');
    if (multi && !designed) out.push(['WRAPS', where, (el.className || el.tagName) + ' "' + txt.slice(0, 50) + '" lines=' + tops.length]);
  }
  return out;
};
const shut = async p => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(150); } else break; } };
for (const [w, h, ua] of [[320, 640], [375, 812], [390, 844], [1024, 1366, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, ...(ua ? { userAgent: ua } : {}) });
  const p = await ctx.newPage(); p.on('pageerror', e => found.set('ERR ' + e, 1));
  await p.clock.install({ time: new Date('2026-10-27T09:00:00Z') });
  await p.goto('file://' + S + '/audit.html'); await p.waitForTimeout(2500); await shut(p);
  await p.evaluate(seed); await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(300); await shut(p);
  const views = [
    ['today', () => { window.__UI.screen = 'today'; }],
    ['bets r1', () => { window.__UI.screen = 'bets'; window.__UI.xView = null; window.__UI.xTab = 'r1'; }],
    ['bets week', () => { window.__UI.xTab = 'week'; window.__UI.xWho = 'g1'; }],
    ['bets off', () => { window.__UI.xTab = 'off'; }],
    ['bets ours', () => { window.__UI.xTab = 'ours'; }],
    ['bets about', () => { window.__UI.xAbout = 'g2'; }],
    ['market', () => { window.__UI.xAbout = 'all'; window.__UI.xView = 's_mvp_g6'; window.__UI.xTicket = null; }],
    ['market custom', () => { window.__UI.xView = 'qx'; window.__UI.xTicket = null; }],
    ['my bets', () => { window.__UI.xView = 'pf'; }],
    ['new bet', () => { window.__UI.xView = 'new'; window.__UI.xNew = { q: '', rules: '', cat: 'trip', p0: 50, kind: 'who', ppl: ['g1', 'xbob'] }; }],
    ['boards chat', () => { window.__UI.xView = null; window.__UI.screen = 'boards'; window.__UI.boardTab = 'chat'; window.__UI.chatRoom = 'r1'; }],
    ['boards trip chat', () => { window.__UI.chatRoom = 'trip'; }],
    ['chat sheet', () => { window.__UI.screen = 'today'; window.__UI.modal = { kind: 'chat' }; window.__UI.chatRoom = 'r1'; }],
    ['who modal', () => { window.__UI.modal = { kind: 'who' }; }],
    ['manage', () => { window.__UI.modal = { kind: 'manage' }; }],
    ['roster', () => { window.__UI.modal = null; window.__UI.screen = 'roster'; }],
    ['calendar', () => { window.__UI.screen = 'calendar'; }],
    ['resort', () => { window.__UI.screen = 'resort'; }],
    ['boards', () => { window.__UI.screen = 'boards'; window.__UI.boardTab = null; }],
    ['scores', () => { window.__UI.screen = 'entry'; }],
  ];
  for (const [name, fn] of views) {
    await p.evaluate(fn); await p.evaluate(() => { window.__forceRender(); scrollTo(0, 0); }); await p.waitForTimeout(250);
    for (const r of await p.evaluate(check, name + ' @' + w)) { const k = r[0] + ' ' + r[2]; found.set(k, (found.get(k) || []).concat(r[1])); }
  }
  await ctx.close();
}
await b.close();
for (const [k, v] of found) console.log('  FAIL  ' + k + '  ←', Array.isArray(v) ? [...new Set(v)].join(', ') : '');
console.log(found.size ? '\n' + found.size + ' FAILED' : '  PASS  every screen, four sizes: nothing wraps that shouldn’t, nothing scrolls sideways\n\nall good');
process.exit(found.size ? 1 : 0);
