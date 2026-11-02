/* THE FEEDBACK FORM. Opened by the commissioner, it comes up every time the
   book is opened until it is answered, sits on Today in between, keeps what
   was typed through a Later, and sends one form a phone (again replaces).
   The commissioner reads every answer in Manage. The same form on its own
   page sends the same way, with a stand-in for the database.
   Run: node tools/feedback-test.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/fb.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const shut = async () => { for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]:not(.fbmodal *)'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; } };
const act = (a, extra = {}) => p.evaluate(([a, extra]) => { const x = document.createElement('button'); x.dataset.act = a; Object.assign(x.dataset, extra); document.getElementById('app').appendChild(x); x.click(); x.remove(); }, [a, extra]);
const open = async () => { await p.goto('file://' + S + '/fb.html'); await p.waitForTimeout(3000); };

console.log('\nbefore the commissioner opens it');
await open(); await shut();
ok('no form comes up', await p.locator('.fbmodal').count(), 0);
ok('and nothing on Today', await p.locator('.fb-card').count(), 0);

console.log('\nthe commissioner opens the form');
await act('fbView'); await p.waitForTimeout(400);
ok('Manage has the feedback window, with no answers yet', [await p.locator('.fbview').count(), await p.locator('.fbview .fb-empty').count()], [1, 1]);
await p.locator('.fbview [data-act="fbToggle"]').click(); await p.waitForTimeout(400);
ok('the switch opens it', await p.evaluate(() => !!(window.__T.config.feedback && window.__T.config.feedback.live)), true);
await p.locator('.fbview [data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('and the form comes up on its own', await p.locator('.fbmodal').count(), 1);
ok('the whole form: name, who, every star row, the four boxes, come again', [await p.locator('.fbmodal #fb_name').count(), await p.locator('.fbmodal .fb-rate').count(), await p.locator('.fbmodal textarea').count(), await p.locator('.fbmodal .fb-chips').count()], [1, 14, 3, 2]);
await p.locator('.fbmodal .fb-rate').nth(1).locator('.fb-star').nth(3).click(); await p.waitForTimeout(150);
await p.locator('.fbmodal #fb_keep').fill('The bets and the recaps'); await p.waitForTimeout(150);
ok('a star and a few words go in', [await p.locator('.fbmodal .fb-rate').nth(1).locator('.fb-star.on').count(), await p.evaluate(() => window.__UI.fb.keep)], [4, 'The bets and the recaps']);
await p.locator('.fbmodal #fb_change').focus(); await p.keyboard.type('Earlier tee ti');
await p.evaluate(() => { window.__render(true); window.__T.photos.zz = { id: 'zz', rid: 'trip', url: 'https://x.test/zz.jpg', at: 1 }; window.__forceRender(); }); await p.waitForTimeout(300);
await p.keyboard.type('mes');
ok('the book redrawing under the thumb loses neither the words, the focus nor the caret', [await p.locator('.fbmodal #fb_change').inputValue(), await p.evaluate(() => document.activeElement && document.activeElement.id), await p.locator('.fbmodal .fb-rate').nth(1).locator('.fb-star.on').count()], ['Earlier tee times', 'fb_change', 4]);
await p.locator('.fbmodal [data-act="modalCancel"]').click(); await p.waitForTimeout(300);
ok('Later puts it away', await p.locator('.fbmodal').count(), 0);
ok('and Today has the card', (await p.locator('.fb-card').innerText()).includes('How was it?'), true);
await p.evaluate(() => window.__forceRender()); await p.waitForTimeout(200);
ok('it does not come back on the same open', await p.locator('.fbmodal').count(), 0);

console.log('\nopened again');
await open(); await shut();
ok('the form comes back, with what was typed', [await p.locator('.fbmodal').count(), await p.locator('.fbmodal #fb_keep').inputValue(), await p.locator('.fbmodal .fb-rate').nth(1).locator('.fb-star.on').count()], [1, 'The bets and the recaps', 4]);
await p.locator('.fbmodal [data-act="fbSend"]').click(); await p.waitForTimeout(300);
ok('nothing is sent without an answer on it', await p.locator('.fbmodal .fb-err').count(), 0);   // it has a star and words, so no complaint
await p.waitForTimeout(400);
ok('sent: thanks, and the form stops asking', [await p.locator('.fbmodal').count(), await p.evaluate(() => /gone to the commissioner/.test(document.body.innerText)), await p.evaluate(() => !!localStorage.getItem('union-invitational:feedback'))], [0, true, true]);
await p.locator('[data-act="modalCancel"]').first().click(); await p.waitForTimeout(200);
ok('Today says thanks and offers a change', (await p.locator('.fb-card.done').innerText()).includes('Thanks'), true);
await open(); await shut();
ok('a new open no longer asks', [await p.locator('.fbmodal').count(), await p.locator('.fb-card.done').count()], [0, 1]);

console.log('\nchanged, and the commissioner reads it');
await p.locator('.fb-card').click(); await p.waitForTimeout(300);
ok('the card opens the form with the sent answers', [await p.locator('.fbmodal #fb_keep').inputValue(), await p.locator('.fbmodal #fb_change').inputValue()], ['The bets and the recaps', 'Earlier tee times']);
await p.locator('.fbmodal #fb_name').fill('Ray V'); await p.locator('.fbmodal .fb-chips').nth(1).locator('.fb-chip').first().click();
await p.locator('.fbmodal [data-act="fbSend"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="modalCancel"]').first().click(); await p.waitForTimeout(200);
await act('fbView'); await p.waitForTimeout(500);
const view = await p.evaluate(() => ({ n: (document.querySelector('.fbview .fb-n') || {}).textContent, who: (document.querySelector('.fbview .fb-who b') || {}).textContent, avg: (document.querySelector('.fbview .fb-avg b') || {}).textContent, text: /The bets and the recaps/.test(document.querySelector('.fbview').textContent), count: document.querySelectorAll('.fbview .fb-one').length }));
ok('one answer, replaced not doubled, with its name, stars and words', [view.count, view.who, view.avg, view.text, /come again: Yes 1/.test(view.n || '')], [1, 'Ray V', '4.0', true, true]);
ok('nothing on the page points at Claude', await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('no errors in the book', errs, []);
await ctx.close();

console.log('\nthe page on its own');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = createServer((req, res) => {
  let q = decodeURIComponent(req.url.split('?')[0]); if (q.endsWith('/')) q += 'index.html';
  const file = join('docs', normalize(q).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(String(e)));
const posts = [];
await q.route(/\/rest\/v1\/rpc\/feedback_submit/, route => { posts.push(JSON.parse(route.request().postData())); route.fulfill({ status: 200, contentType: 'application/json', body: '"ok"' }); });
await q.route(/supabase\.co\/(?!rest)/, route => route.abort());
await q.goto(BASE + 'feedback/'); await q.waitForSelector('#fb .fb-rate', { timeout: 15000 });
ok('the same form, every row of it', [await q.locator('#fb .fb-rate').count(), await q.locator('#fb textarea').count(), await q.evaluate(() => document.doctype && document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)], [14, 3, true]);
await q.locator('#fb .fb-rate').nth(0).locator('.fb-star').nth(4).click();
await q.locator('#fb #fb_change').fill('Earlier tee times');
await q.locator('#fb .fb-chips').nth(1).locator('.fb-chip').nth(1).click();
await q.locator('#send').click(); await q.waitForTimeout(500);
ok('Send posts one form, with the phone id and only what was answered', [posts.length, !!posts[0].p_dev, posts[0].p_doc.stars, posts[0].p_doc.change, posts[0].p_doc.again, posts[0].p_doc.was], [1, true, { aspendos: 5 }, 'Earlier tee times', 'probably', 'golfer']);
ok('and says thank you', /gone to the commissioner/.test(await q.locator('#fb').innerText()), true);
await q.reload(); await q.waitForTimeout(600);
ok('opened again it remembers, and offers a change', [/Thank you/.test(await q.locator('#fb').innerText()), await q.locator('#edit').count()], [true, 1]);
await q.locator('#edit').click(); await q.waitForTimeout(300);
ok('which brings the answers back', [await q.locator('#fb #fb_change').inputValue(), await q.locator('#fb .fb-rate').nth(0).locator('.fb-star.on').count()], ['Earlier tee times', 5]);
ok('nothing on it points at Claude', await q.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => /claude\.ai/.test(a.href)).length), 0);
ok('no errors on the page', errs2, []);
await b.close(); server.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
