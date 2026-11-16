import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/sh', { recursive: true });
const ROOT = 'docs/preview/shots';
const srv = createServer((q, r) => {
  const f = join(ROOT, q.url === '/' ? 'index.html' : decodeURIComponent(q.url).split('?')[0]);
  if (!existsSync(f)) { r.writeHead(404); r.end('no'); return; }
  const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(f)] || 'text/plain';
  r.writeHead(200, { 'content-type': t }); r.end(readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, w, h, dpr] of [['phone', 390, 844, 2], ['wide', 1280, 1000, 1]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await p.goto(BASE); await p.waitForTimeout(900);
  if (name === 'phone') {
    const box = await p.locator('#svgA').boundingBox();
    for (const [fx, fy] of [[0.52, 0.52], [0.46, 0.22], [0.5, 0.1]])
      await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy), await p.waitForTimeout(150);
    for (let i = 0; i < 3; i++) { await p.click('[data-walk="1"]'); await p.waitForTimeout(120); }
    await p.click('[data-add="B"]'); await p.waitForTimeout(120);
    console.log('A shots :', await p.evaluate(() => [...document.querySelectorAll('#listA li')].map(x => x.textContent.trim())));
    console.log('C shots :', await p.evaluate(() => [...document.querySelectorAll('#listC li')].map(x => x.textContent.trim())));
    console.log('B shots :', await p.evaluate(() => [...document.querySelectorAll('#listB li')].map(x => x.textContent.trim())));
    console.log('svg children:', await p.evaluate(() => document.querySelector('#svgA').childElementCount));
  }
  await p.screenshot({ path: S + '/sh/' + name + '.png', fullPage: name === 'wide' });
  if (errs.length) console.log(name, 'PAGE ERRORS:', errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
