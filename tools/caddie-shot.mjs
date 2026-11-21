/* Look at the caddie on every Clubhouse screen, at every width, and measure
   whether he is covering anything that matters. A working tool, not a test. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/cad', { recursive: true });
writeFileSync(S + '/cad/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/cad/index.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ahead = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const widths = [['phone', 390, 844, true], ['ipad', 834, 1112, true], ['laptop', 1280, 860, false]];
let bad = 0;
for (const [tag, w, h, mob] of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(2500);
  await p.evaluate(([A, H]) => {
    const T = window.__T, UI = window.__UI, C = window.__C;
    T.club.season = { phase: 'club', frozen: true, name: 'Las Vegas 2027', tag: 'A Desert Showdown',
      window: { from: '2027-11-13', to: '2027-11-21' },
      stops: [{ id: 'mulligan', name: 'The Merry Mulligan Open', from: A, to: H, format: 'stableford', note: 'Eighteen at home.' }] };
    const hit = C.courseLibrary(T).find(x => x.id === 'leatherhead');
    T.club['course__g1'] = { ...C.courseFrom(hit, 'g1'), approved: true };
    UI.who = 'g1'; UI.modal = null; window.__forceRender();
  }, [ago(3), ahead(10)]);
  /* The same measure the app itself uses: the inked boxes of the words, not
     the boxes of the elements that hold them. A cell's box runs the width of
     its column, so an element box reports him as covering whitespace. */
  await p.evaluate(() => {
    window.__cadHits = a => {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      const r = document.createRange();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const pa = n.parentElement;
        if (!pa || pa.closest('.caddie') || pa.closest('.tabbar')) continue;
        r.selectNodeContents(n);
        for (const t of r.getClientRects()) {
          if (t.right > a.left + 2 && t.left < a.right - 2 && t.bottom > a.top + 2 && t.top < a.bottom - 2) {
            out.push(n.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 30)); break;
          }
        }
      }
      return [...new Set(out)];
    };
  });
  await p.waitForTimeout(500);

  for (const scr of ['you', 'season', 'hq']) {
    await p.evaluate(s => { const x = document.createElement('button'); x.dataset.act = 'go'; x.dataset.a = s; document.getElementById('app').appendChild(x); x.click(); x.remove(); }, scr);
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const c = document.querySelector('.caddie');
      if (!c) return { there: false };
      /* The figure, not the box it hangs in: the box stays put when he steps
         aside, so measuring it would report an overlap he has already left. */
      const a = (c.querySelector('img') || c).getBoundingClientRect();
      /* Anything with its own words on it, not just the controls: a mascot
         standing on a table's values is as bad as one standing on a button. */
      const hits = window.__cadHits(a);
      return { there: true,
        box: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)],
        offRight: a.right > innerWidth + 1, offBottom: a.bottom > innerHeight + 1, hits };
    });
    /* He does not step aside any more, so any part of him off an edge is a
       fault with no excuse. */
    const flag = !r.there || r.offRight || r.offBottom || r.hits.length;
    if (flag) bad++;
    console.log((flag ? 'X ' : '  ') + tag.padEnd(7), scr.padEnd(7), JSON.stringify(r));
    await p.screenshot({ path: S + '/cad/' + tag + '-' + scr + '.png' });
    /* and again at the very foot of the page, where the gutter has to hold */
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(600);
    const e2 = await p.evaluate(() => {
      const c = document.querySelector('.caddie'); if (!c) return { there: false };
      const a = (c.querySelector('img') || c).getBoundingClientRect();
      return { there: true, peek: c.classList.contains('peek'), hits: window.__cadHits(a) };
    });
    if (e2.hits && e2.hits.length) { bad++; console.log('X ' + tag.padEnd(7), (scr + ' foot').padEnd(12), JSON.stringify(e2.hits)); }
    await p.screenshot({ path: S + '/cad/' + tag + '-' + scr + '-foot.png' });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad ? bad + ' screens with a problem' : 'he is on every screen, inside the glass, covering nothing');
