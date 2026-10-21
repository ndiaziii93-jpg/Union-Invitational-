/* SCROLLING STAYS WHERE THE READER PUTS IT. Reading the Resort or the Rules
   on a phone, a redraw from the shared book used to land mid-swipe: the page
   was rebuilt a moment shorter, the phone clamped the scroll and the reader
   was thrown towards the top. This checks the four things that stop it:
   nothing is rebuilt while a finger is down or the page is still gliding;
   a redraw that would draw the same page is skipped; a real rebuild keeps
   the reader's place; and the picture on the grounds tab holds its size.
   Run: node tools/scroll-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/scroll.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
  + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + S + '/scroll.html'); await p.waitForTimeout(3500);
for (let i = 0; i < 6; i++) { const d = p.locator('.scrim [data-act="modalCancel"]'); if (await d.count()) { await d.first().click({ force: true }); await p.waitForTimeout(200); } else break; }

/* a mark on the page as it stands: gone the moment the page is rebuilt */
const mark = () => p.evaluate(() => { document.querySelector('main.page').__mark = 1; });
const rebuilt = () => p.evaluate(() => !document.querySelector('main.page').__mark);
const y = () => p.evaluate(() => Math.round(window.scrollY));
const touch = (type) => p.evaluate(t => window.dispatchEvent(new Event(t)), type);

for (const [tab, label] of [['resort', 'the Resort'], ['rules', 'the Rules']]) {
  console.log('\nreading ' + label);
  if (tab === 'resort') await p.click('[data-act="go"][data-a="resort"]:visible');
  else await p.evaluate(() => { window.__UI.screen = 'rules'; window.__render(true); });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__render(false));   // the arrival's rise is over: the page as it stays
  await p.waitForTimeout(200);
  const room = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  ok('the page is long enough to scroll', room > 500, true);
  const at = Math.min(1400, room - 50);
  await p.evaluate(v => scrollTo(0, v), at); await p.waitForTimeout(400);

  await mark();
  await p.evaluate(() => window.__render(false));
  ok('a redraw that changes nothing leaves the page alone', await rebuilt(), false);

  /* a finger on the glass, the page moving: the book hears a change */
  await mark();
  await touch('touchstart');
  for (let i = 0; i < 4; i++) { await p.evaluate(v => scrollTo(0, v), at + i * 6); await p.waitForTimeout(40); }
  await p.evaluate(() => window.__render(true));
  ok('nothing is rebuilt under a finger', await rebuilt(), false);
  await touch('touchend');
  for (let i = 0; i < 4; i++) { await p.evaluate(v => scrollTo(0, v), at + 30 + i * 4); await p.waitForTimeout(60); }
  ok('nor while the page is still gliding', await rebuilt(), false);
  const rest = await y();
  await p.waitForTimeout(700);
  ok('once it comes to rest, the change is drawn', await rebuilt(), true);
  ok('and the reader is where they stopped', Math.abs((await y()) - rest) <= 2, true);

  /* a real rebuild while the page is still: the place is kept */
  await mark(); const before = await y();
  await p.evaluate(() => window.__render(true)); await p.waitForTimeout(300);
  ok('a real rebuild keeps the reader\'s place', Math.abs((await y()) - before) <= 2, true);
  ok('the height hold lets go afterwards', await p.waitForFunction(() => !document.getElementById('app').style.minHeight, null, { timeout: 3000 }).then(() => true, () => false), true);
}

console.log('\nthe grounds plan');
await p.click('[data-act="go"][data-a="resort"]:visible'); await p.waitForTimeout(400);
const plan = p.locator('[data-act="resortTab"][data-a="plan"]');
if (await plan.count()) { await plan.first().dispatchEvent('click'); await p.waitForTimeout(600); }
ok('the plan picture carries its size, so it never collapses while it decodes',
  await p.evaluate(() => { const i = document.querySelector('.planimg'); return i ? [i.getAttribute('width'), i.getAttribute('height')].join('x') : 'no plan'; }), '2000x552');

console.log('\na tap is never held');
await touch('touchstart'); await p.evaluate(v => scrollTo(0, v), 300);
await p.evaluate(() => { const t = document.querySelector('[data-act="go"][data-a="today"]'); t && t.click(); });
await touch('touchend'); await p.waitForTimeout(150);
ok('a tap during a glide still goes where it was asked', await p.evaluate(() => window.__UI.screen), 'today');

ok('no errors on the way', errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
