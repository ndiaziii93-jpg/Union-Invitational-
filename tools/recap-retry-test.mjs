/* A REPORT THAT RUNS OUT OF ROOM. The writer has a ceiling on how long an
   answer may be; a long day can hit it mid-sentence. The book asks once more
   for a tighter report, and if that is cut off too, keeps the paragraphs
   that did come back rather than showing nothing.
   Run: node tools/recap-retry-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/retry.html', '<!doctype html><html><head><meta charset="utf-8"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const full = JSON.stringify({ headline: 'DP runs away with it', narrative: ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'], voices: [], honours: [] });
const cut = full.slice(0, full.indexOf('Four.') + 3);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function run(answers) {
  const ctx = await b.newContext();
  await ctx.addInitScript(a => {
    window.__asked = []; let i = 0;
    const fn = async input => { window.__asked.push(String(input)); const r = a[Math.min(i++, a.length - 1)]; return r; };
    window.claude = { use: async name => name === 'sample' ? fn : null };
  }, answers);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + S + '/retry.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const x = document.createElement('button'); x.dataset.act = 'recapGen'; x.dataset.a = 'r2'; document.getElementById('app').appendChild(x); x.click(); });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => ({ asked: window.__asked.length, shorter: /KEEP IT SHORTER/.test(window.__asked[1] || ''), body: (window.__T.recaps.r2 || {}).body || null }));
  await ctx.close();
  return { ...out, errs };
}
console.log('\ncut off once, then a tighter report fits');
let r = await run([{ text: cut, truncated: true }, { text: full, truncated: false }]);
ok('it asks once more, for a shorter report', [r.asked, r.shorter], [2, true]);
ok('and keeps the one that fits', r.body && r.body.narrative.length, 6);
console.log('\ncut off twice');
r = await run([{ text: cut, truncated: true }, { text: cut, truncated: true }]);
ok('the paragraphs that finished are kept, not an error', [r.asked, r.body && r.body.headline, r.body && r.body.narrative], [2, 'DP runs away with it', ['One.', 'Two.', 'Three.']]);
console.log('\nnot cut off');
r = await run([{ text: full, truncated: false }]);
ok('a report that fits is asked for once', [r.asked, r.body && r.body.narrative.length], [1, 6]);
ok('no errors on the way', r.errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
