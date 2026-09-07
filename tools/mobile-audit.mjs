/* Reports horizontal overflow and undersized tap targets on every screen,
   at phone and tablet widths. Run: node tools/mobile-audit.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

/* The artifact host wraps the file in a head carrying charset, viewport and a
   small reset. Without that wrapper a local file lays out at 980px and scales,
   so a phone test measures the wrong thing entirely. Mirror the host here. */
const WRAP = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad/preview.html';
writeFileSync(WRAP, '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>' + readFileSync('/home/user/Union-Invitational-/dist/union-invitational.html', 'utf8') + '</body></html>');
const PAGE = 'file://' + WRAP;
const SCREENS = ['Today','Leaderboards','Ryder Cup','Calendar','Score Entry','Roster','Games & Rules','Course Setup'];
const SIZES = [['phone',390,844],['tablet',820,1180]];

const probe = () => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      // ignore anything inside a container that scrolls on purpose
      let p = el.parentElement, inScroller = false;
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') { inScroller = true; break; }
        p = p.parentElement;
      }
      if (inScroller) continue;
      bad.push((el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ').filter(Boolean).slice(0,2).join('.'))
        + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
    }
  }
  const small = [];
  for (const el of document.querySelectorAll('button,select,input,a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 40) small.push((el.tagName.toLowerCase() + '.' + (el.className||'').toString().split(' ')[0]) + ' h=' + Math.round(r.height));
  }
  return { vw, scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth,
           bad: [...new Set(bad)].slice(0,8), small: [...new Set(small)].slice(0,6) };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let problems = 0;
for (const [name, w, h] of SIZES) {
  console.log('\n=== ' + name + ' ' + w + 'x' + h + ' ===');
  const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: name === 'phone', hasTouch: true })).newPage();
  await p.goto(PAGE); await p.waitForTimeout(1400);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  for (const scr of SCREENS) {
    await p.locator('.tab', { hasText: scr }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('[data-act="modalCancel"]').click().catch(() => {});
    await p.waitForTimeout(150);
    const r = await p.evaluate(probe);
    const over = r.scrollW - r.vw;
    const flag = over > 1 ? 'OVERFLOW +' + over + 'px' : 'ok';
    if (over > 1) problems++;
    console.log('  ' + scr.padEnd(16) + flag + (r.bad.length ? '\n      culprits: ' + r.bad.join('\n                ') : '')
      + (r.small.length ? '\n      small taps: ' + r.small.join(', ') : ''));
  }
  await p.close();
}
await b.close();
console.log(problems ? '\n' + problems + ' screen(s) scroll sideways.' : '\nNo screen scrolls sideways.');
