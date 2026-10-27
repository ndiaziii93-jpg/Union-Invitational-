/* CHAT NOTIFICATIONS, end to end on the phone's side. The installable app is
   served as it is on GitHub Pages, its Supabase answered by a stand-in that
   keeps documents the way the real table does, and the push service stood
   in for too (a test browser cannot reach Apple's or Google's).
   Turning notifications on leaves this phone's address in the book; posting
   asks the notify function to pass the line on; a push arriving shows a
   notification; and a tapped notification opens the book on that chat.
   The sending itself is supabase/functions/notify, tested in push-test.mjs.
   Run: node tools/notify-test.mjs */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* the app, served as Pages serves it */
const ROOT = 'docs/app';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const site = http.createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (f.endsWith('/')) f += 'index.html';
  if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[extname(f)] || 'application/octet-stream');
  res.end(readFileSync(f));
});
await new Promise(r => site.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + site.address().port;

/* the book's table, as the stand-in Supabase keeps it */
const rows = new Map();
let clock = Date.parse('2026-10-23T09:00:00Z');
const stamp = () => new Date(clock += 7).toISOString();
const notified = [], reacted = [];
const PUBLIC_KEY = 'BOrgVLcDzyfIySbuNUuAXqfZKA7prk4rZNqAH0cyOKKFDHtOmS6vtGsy1bmxiO8M3t6ISvx9pTSsVFBrw4TIPxo';
async function supabase(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname === '/functions/v1/notify') {
    if (method === 'GET') return send({ publicKey: PUBLIC_KEY });
    const body = JSON.parse(req.postData() || '{}');
    if (body.rx) reacted.push(body); else notified.push(body.path);
    return send({ sent: 1 });
  }
  /* the server's gate for the chat: a signed post lands, a name is proved */
  if (url.pathname === '/rest/v1/rpc/social_write') {
    const { p_path, p_doc, p_merge } = JSON.parse(req.postData());
    rows.set(p_path, { path: p_path, doc: p_merge ? { ...((rows.get(p_path) || {}).doc || {}), ...p_doc } : p_doc, updated_at: stamp() });
    return send('ok');
  }
  if (url.pathname === '/rest/v1/rpc/social_delete') { const { p_path } = JSON.parse(req.postData()); rows.delete(p_path); return send('ok'); }
  if (url.pathname === '/rest/v1/rpc/check_name') return send(true);
  if (url.pathname === '/rest/v1/rpc/claim_name') return send('ok');
  if (url.pathname === '/rest/v1/rpc/merge_doc') {
    const { p, patch } = JSON.parse(req.postData());
    rows.set(p, { path: p, doc: { ...((rows.get(p) || {}).doc || {}), ...patch }, updated_at: stamp() });
    return send(null, 204);
  }
  if (url.pathname !== '/rest/v1/docs') return send({ message: 'not here' }, 404);
  const q = url.searchParams;
  if (method === 'GET') {
    let out = [...rows.values()];
    const path = q.get('path');
    if (path && path.startsWith('eq.')) out = out.filter(r => r.path === path.slice(3));
    if (path && path.startsWith('like.')) out = out.filter(r => r.path.startsWith(path.slice(5).replace(/[%*]+$/, '')));
    const gt = q.get('updated_at'); if (gt && gt.startsWith('gt.')) out = out.filter(r => r.updated_at > gt.slice(3));
    out.sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
    return send(out);
  }
  if (method === 'POST') {
    const body = JSON.parse(req.postData()); for (const r of [].concat(body)) rows.set(r.path, { ...r, updated_at: stamp() });
    return send(null, 201);
  }
  if (method === 'DELETE') { const path = q.get('path'); rows.delete(String(path).slice(3)); return send(null, 204); }
  return send({}, 405);
}

/* the phone's push service, stood in for: a browser under test has none */
const FAKE_PUSH = () => {
  const sub = { endpoint: 'https://push.example/phone-1', options: {},
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPhonePublicKeyForTheTest', auth: 'AuthSecretForTest' } }; },
    unsubscribe() { window.__pushOff = true; return Promise.resolve(true); } };
  let held = null;
  PushManager.prototype.subscribe = function (opts) { window.__subscribedWith = opts && opts.applicationServerKey && opts.applicationServerKey.length; held = sub; return Promise.resolve(sub); };
  PushManager.prototype.getSubscription = function () { return Promise.resolve(held); };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
await ctx.route(/zolsghkbgceularukood\.supabase\.co/, supabase);
await ctx.addInitScript(FAKE_PUSH);
const errs = [];

console.log('\na phone that has not said who it is');
{
  const fresh = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await fresh.route(/zolsghkbgceularukood\.supabase\.co/, supabase);
  const f = await fresh.newPage(); f.on('pageerror', e => errs.push(String(e)));
  await f.goto(ORIGIN + '/'); await f.waitForTimeout(5000);
  /* an empty test book opens on Setup's outstanding list first; the ask follows it */
  for (let i = 0; i < 3; i++) { const d = f.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await f.waitForTimeout(300); } else break; }
  ok('is asked, as it opens', await f.locator('.whomodal').count(), 1);
  ok('with no way to wave it off, and a way in for the refs', [await f.locator('.whomodal [data-act="modalCancel"]').count(), await f.locator('.whomodal [data-act="signIn"]').count()], [0, 1]);
  await f.locator('.scrim').first().click({ position: { x: 5, y: 5 } }); await f.waitForTimeout(400);
  ok('and asked again if it taps away', await f.locator('.whomodal').count(), 1);
  await f.locator('#guestName').fill('Uncle Bob'); await f.locator('[data-act="guestJoin"]').click(); await f.waitForTimeout(600);
  ok('a guest pass answers it, for good', [await f.locator('.whomodal').count(), await f.locator('.chatfab').count()], [0, 1]);
  await fresh.close();
}

await ctx.addInitScript(() => { try { if (!localStorage.getItem('union-invitational:whoami')) localStorage.setItem('union-invitational:whoami', 's1'); } catch (e) {} });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e)));
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };

await p.goto(ORIGIN + '/'); await p.waitForTimeout(5000); await shut();

console.log('\nturning them on');
await p.locator('.chatfab').click(); await p.waitForTimeout(500);
ok('the chat asks, plainly', (await p.locator('.chatsheet .ch-push b').innerText()), 'Get a buzz when someone posts.');
await p.locator('.chatsheet [data-act="pushOn"]').click(); await p.waitForTimeout(1500);
ok('it signs up with the book’s 65-byte public key', await p.evaluate(() => window.__subscribedWith), 65);
const dev = await p.evaluate(() => localStorage.getItem('union-invitational:device'));
const saved = (rows.get('push/' + dev) || {}).doc || {};
ok('and leaves this phone’s address in the book', [saved.on, saved.sub && saved.sub.endpoint, saved.pid], [true, 'https://push.example/phone-1', 's1']);
ok('the card turns into a quiet line', [await p.locator('.chatsheet .ch-push').count(), /You’ll get a buzz/.test(await p.locator('.chatsheet .ch-pushnote').innerText())], [0, true]);

console.log('\nposting');
await p.locator('#chatText').fill('Anyone for the pool bar?'); await p.locator('#chatText').press('Enter');
await p.waitForTimeout(1500);
const msg = [...rows.keys()].find(k => k.startsWith('chat/m'));
ok('the message is in the book', !!msg, true);
ok('and the notify function is asked to pass it on', notified, [msg]);

console.log('\na reaction');
const room = rows.get(msg).doc.rid;
rows.set('chat/mray1', { path: 'chat/mray1', doc: { id: 'mray1', k: 'm', rid: room, pid: 'g6', name: 'Ray V', text: 'Pool bar in 10', at: Date.now(), dev: 'dray', re: null }, updated_at: stamp() });
await p.evaluate(() => document.activeElement && document.activeElement.blur());     // the keyboard down, as when reading
await p.waitForSelector('.chatsheet .ch-msg:has-text("Pool bar in 10")', { timeout: 15000 });
await p.locator('.chatsheet .ch-msg:has-text("Pool bar in 10") .ch-rx button').first().click(); await p.waitForTimeout(1500);
ok('reacting to Ray V’s message asks to tell him, once', reacted, [{ path: 'chat/mray1', rx: dev }]);
ok('with her name on the reaction', ((rows.get('chat/mray1') || {}).doc || {})['rxby_' + dev], 'Jennifer D');
await p.locator('.chatsheet .ch-msg:has-text("Anyone for the pool bar") .ch-rx button').first().click(); await p.waitForTimeout(1200);
ok('reacting to her own message tells nobody', reacted.length, 1);

console.log('\na bet with people on it');
await p.evaluate(() => document.activeElement && document.activeElement.blur());
await p.locator('.scrim.tcscrim').click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(300);
await p.locator('.navbtn[data-a="bets"]').click(); await p.waitForTimeout(500);
await p.locator('.xm-new').click(); await p.waitForTimeout(300);
await p.locator('#xQ').fill('Will Ray V wear the pink trousers on Sunday');
await p.locator('[data-act="xN"][data-a="ppl"][data-b="g6"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="xCreate"]').click(); await p.waitForTimeout(1500);
const bet = [...rows.keys()].find(k => k.startsWith('market/q'));
ok('the bet is in the book, Ray V tagged on it', ((rows.get(bet) || {}).doc || {}).tags, ['g6']);
ok('and the notify function is asked to tell him', notified.includes(bet), true);

console.log('\na notification arriving');
const cdp = await ctx.newCDPSession(p);
await cdp.send('ServiceWorker.enable');
const regId = await new Promise(r => { cdp.on('ServiceWorker.workerRegistrationUpdated', e => { const x = e.registrations.find(g => g.scopeURL.startsWith(ORIGIN)); if (x) r(x.registrationId); }); setTimeout(() => r(null), 4000); });
ok('the book’s worker is installed', !!regId, true);
await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN + '/', registrationId: regId,
  data: JSON.stringify({ title: 'Becky · Round 2', body: 'Ray, you OK?', room: 'r2', tag: 'chat-r2' }) });
await p.waitForTimeout(1200);
const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => [n.title, n.body, n.tag, n.data && n.data.room]));
ok('it shows, with who, where and what', shown, [['Becky · Round 2', 'Ray, you OK?', 'chat-r2', 'r2']]);

console.log('\ntapping one');
const q = await ctx.newPage(); q.on('pageerror', e => errs.push(String(e)));
await q.goto(ORIGIN + '/?chat=r2'); await q.waitForTimeout(5000);
ok('the book opens on the chat', await q.locator('.chatsheet').count(), 1);
ok('on the round it came from', await q.locator('.chatsheet .ch-rooms button.on').getAttribute('data-a'), 'r2');
ok('and the address is tidied, so a reload does not reopen it', new URL(q.url()).search, '');
await q.close();

console.log('\ntapping one about a bet');
const r2 = await ctx.newPage(); r2.on('pageerror', e => errs.push(String(e)));
await r2.goto(ORIGIN + '/?bet=' + bet.slice('market/'.length)); await r2.waitForTimeout(5000);
ok('the book opens on that bet', await r2.locator('.xm-h').innerText(), 'Will Ray V wear the pink trousers on Sunday?');
await r2.close();
await p.locator('.navbtn[data-a="today"]').click(); await p.waitForTimeout(300);
await p.locator('.chatfab').click(); await p.waitForTimeout(400);

console.log('\nturning them off');
await p.locator('.chatsheet [data-act="pushOff"]').click(); await p.waitForTimeout(1200);
ok('this phone stops being sent them', [((rows.get('push/' + dev) || {}).doc || {}).on, await p.evaluate(() => !!window.__pushOff)], [false, true]);
ok('and the card offers to turn them on again', await p.locator('.chatsheet [data-act="pushOn"]').count(), 1);

ok('no errors on the way', errs, []);
await b.close(); site.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
