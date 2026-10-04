import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/bd.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e).split('\n')[0]));
const shut = async () => { for (let i=0;i<6;i++){ const m = p.locator('.scrim [data-act="modalCancel"]');
  if (!await m.count()) return; await m.first().click({force:true}).catch(()=>{}); await p.waitForTimeout(200);} };
const tab = async t => { await shut(); await p.locator('.tab',{hasText:t}).click(); await p.waitForTimeout(650); await shut(); };
await p.goto('file://' + S + '/bd.html');
await p.waitForSelector('#app.arrived', { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(400); await shut();
// everybody picks their own band — a spread, so the read has something to say
await tab('Roster');
const rows = await p.locator('.rtable tbody tr').count();
for (let i=0;i<rows;i++){ const bs=p.locator('.rtable tbody tr').nth(i).locator('[data-act="setBand"]');
  const n=await bs.count(); if(!n) continue; await bs.nth(i%n).click(); await p.waitForTimeout(70); }
await p.waitForTimeout(400); await shut();
// play the practice round, with a wide spread of scoring
await tab('Scores');
await p.locator('.rcard.practice').first().click(); await p.waitForTimeout(600); await shut();
for (const f of ['ctpHole','ldHole']) { const s2=p.locator('[data-act="setRoundField"][data-a="'+f+'"]').first();
  if (await s2.count()) { await s2.selectOption({index:1}); await p.waitForTimeout(300); await shut(); } }
if (await p.locator('[data-act="openRound"]').count()) { await p.locator('[data-act="openRound"]').first().click(); await p.waitForTimeout(1100); await shut(); }
const groups = await p.locator('.gchip').count();
for (let g=0; g<groups; g++) {
  await shut(); await p.locator('.gchip').nth(g).click(); await p.waitForTimeout(450); await shut();
  for (let h=0; h<18; h++) {
    await shut();
    await p.locator('.hcell').nth(h).click(); await p.waitForTimeout(200); await shut();
    const plus = p.locator('.step.plus'); const c = await plus.count();
    for (let i=0;i<c;i++){ const taps = (i * 2 + h) % 4; for (let k=0;k<=taps;k++){ await plus.nth(i).click(); await p.waitForTimeout(32);} }
    await p.locator('[data-act="saveHole"]').click(); await p.waitForTimeout(380);
  }
}
await shut();
await tab('Boards');
await p.locator('.btab',{hasText:'Practice Day'}).click(); await p.waitForTimeout(800); await shut();
await p.evaluate(() => {
  const h = [...document.querySelectorAll('h3.sub')].find(x => /band read/i.test(x.textContent));
  if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 16);
});
await p.waitForTimeout(500);
console.log('rows in the read:', await p.locator('.br-row').count());
console.log('verdicts:', (await p.locator('.br-tag').allInnerTexts()).join(' / '));
console.log('sideways scroll:', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
await p.screenshot({ path: S + '/band-read.png' });
await b.close();
