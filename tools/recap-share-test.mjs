/* The day's report goes to the group: a Send to WhatsApp button for anyone
   who can read it, and the words it sends. Run: node tools/recap-share-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/rshare.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(() => {
  window.__sent = []; window.__opened = [];
  navigator.share = async d => { window.__sent.push(d.text); };
  window.open = (u) => { window.__opened.push(u); return null; };
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } } }); } catch (e) {}
});
await p.goto('file://' + S + '/rshare.html'); await p.waitForTimeout(3000);
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]'); if (await m.count()) { await m.first().click({ force: true }); await p.waitForTimeout(200); } else return; } };
await shut();
/* a written, published report for the practice round, straight into the book */
await p.evaluate(() => { const T = window.__T;
  T.recaps.practice = { rid: 'practice', status: 'published', at: 1, body: { headline: 'The wind got up on the back nine',
    narrative: ['It was that sort of afternoon.', 'Nobody said much on the 16th tee.', 'Dinner was better.'],
    swing: { value: '4 shots', caption: 'between the 12th and the 15th' }, pairNotes: {},
    honours: [{ slot: 'shot_of_the_day', winner: 'g1', citation: 'A six iron that had no business getting there.' }] } };
  window.__UI.recapOpen = true; window.__UI.recap.rid = 'practice'; window.__forceRender(); });
await p.waitForTimeout(600);
ok('a reader gets a Send to WhatsApp button', await p.locator('[data-act="recapWhatsApp"]').count(), 1);
ok('and a Copy', await p.locator('[data-act="recapCopy"]').count(), 1);
await p.locator('[data-act="recapWhatsApp"]').click(); await p.waitForTimeout(400);
const sent = await p.evaluate(() => window.__sent[0] || '');
ok('the phone\'s share sheet is handed the words', sent.length > 50, true);
ok('with the headline, bold the WhatsApp way', /\*The wind got up on the back nine\*/.test(sent), true);
ok('the paragraphs', /Nobody said much on the 16th tee\./.test(sent), true);
ok('the swing and the honour by name', /Swing of the day: 4 shots/.test(sent) && /Shot of the day — Norberto III: A six iron/.test(sent), true);
ok('and the book\'s address at the foot', /github\.io\/Union-Invitational-\/$/.test(sent.trim()), true);
/* no share sheet: WhatsApp's own link, with the words in it */
await p.evaluate(() => { delete navigator.share; });
await p.locator('[data-act="recapWhatsApp"]').click(); await p.waitForTimeout(300);
ok('without a share sheet it opens WhatsApp with the words', await p.evaluate(() => /^https:\/\/wa\.me\/\?text=/.test(window.__opened[0] || '') && decodeURIComponent(window.__opened[0]).includes('wind got up')), true);
await p.locator('[data-act="recapCopy"]').click(); await p.waitForTimeout(300);
ok('Copy puts the same words on the clipboard', await p.evaluate(() => (window.__copied || '').includes('Dinner was better.')), true);
ok('and says so', (await p.locator('[data-act="recapCopy"]').innerText()).trim(), 'Copied');
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
